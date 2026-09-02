// Minimal Markdown → React renderer for the in-app manual.
//
// Supports what the manual uses and nothing more: #/##/### headings, paragraphs,
// "-" and "1." lists, fenced code blocks, pipe tables, **bold**, `code`, and
// [links](url). Content is repo-controlled, so no sanitizer is needed; React
// escapes text nodes anyway. Zero dependencies by design (see CLAUDE.md).

import type { ReactNode } from "react";

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; code: string }
  | { kind: "table"; header: string[]; rows: string[][] };

export interface Heading {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const usedIds = new Map<string, number>();
  const uniqueId = (base: string) => {
    const n = usedIds.get(base) ?? 0;
    usedIds.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // fenced code
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push({ kind: "code", code: buf.join("\n") });
      continue;
    }
    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text, id: uniqueId(slugify(text) || "section") });
      i++;
      continue;
    }
    // table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    // lists
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    // paragraph (until blank line or block start)
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) blocks.push({ kind: "paragraph", text: buf.join(" ") });
    else i++;
  }
  return blocks;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function extractHeadings(blocks: Block[]): Heading[] {
  return blocks.flatMap((b) => (b.kind === "heading" && b.level >= 2 ? [{ level: b.level, text: b.text, id: b.id }] : []));
}

/** Inline: `code`, **bold**, [text](url). */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(
        <code key={k++} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const href = lm[2];
      const external = /^https?:\/\//.test(href);
      out.push(
        <a key={k++} href={href} className="text-brand-700 underline decoration-brand-300 hover:decoration-brand-700" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {lm[1]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case "heading": {
        const cls =
          b.level === 1
            ? "text-2xl font-semibold tracking-tight text-slate-900"
            : b.level === 2
              ? "mt-10 border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900"
              : "mt-6 text-base font-semibold text-slate-800";
        const Tag = `h${b.level}` as "h1" | "h2" | "h3";
        return (
          <Tag key={i} id={b.id} className={`${cls} scroll-mt-24`}>
            {renderInline(b.text)}
          </Tag>
        );
      }
      case "paragraph":
        return (
          <p key={i} className="mt-4 leading-7 text-slate-700">
            {renderInline(b.text)}
          </p>
        );
      case "list": {
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={i} className={`mt-4 space-y-1.5 pl-6 text-slate-700 ${b.ordered ? "list-decimal" : "list-disc"}`}>
            {b.items.map((it, j) => (
              <li key={j} className="leading-7">
                {renderInline(it)}
              </li>
            ))}
          </Tag>
        );
      }
      case "code":
        return (
          <pre key={i} className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
            {b.code}
          </pre>
        );
      case "table":
        return (
          <div key={i} className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {b.header.map((h, j) => (
                    <th key={j} scope="col" className="px-4 py-2 font-medium">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} className="px-4 py-2 align-top text-slate-700">
                        {renderInline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}
