// PDF generation (Phase K-2 / K-3) on pdf-lib with a bundled Noto Sans JP
// subset (lib/pdf/fonts: JIS X 0208 for Regular, JIS level 1 for Bold —
// about 3 MB in total, far below Vercel's 250 MB function limit and with no
// headless browser involved). Why pdf-lib: pure JavaScript, no native
// binaries, ~1 MB. Puppeteer / Chromium builds exceed the 50 MB compressed
// limit and were ruled out.
//
// Per-document subsetting: pdf-lib's own subsetter (fontkit) drops glyphs of
// this TrueType build, so the document's characters are subset with HarfBuzz
// (subset-font, WebAssembly, ~40 ms) and the result is embedded whole. To
// know the characters before embedding, drawing is recorded as a list of
// operations and replayed once the fonts are ready; text is measured with
// fontkit on the bundled font (same advances as the embedded subset).
//
// This module keeps the drawing primitives (text with wrapping, rules,
// simple tables, page breaks); receipt.ts and invoice.ts lay out the
// documents. Server only (reads the fonts from disk).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import subsetFont from "subset-font";

export const A4 = { width: 595.28, height: 841.89 } as const;
export const MARGIN = 48;

const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");

type Face = { bytes: Buffer; font: ReturnType<typeof fontkit.create> };
let faceCache: Promise<{ regular: Face; bold: Face }> | null = null;

/** Font bytes are read (and parsed for metrics) once per process. */
export function loadFaces(): Promise<{ regular: Face; bold: Face }> {
  if (!faceCache) {
    faceCache = Promise.all([readFile(path.join(FONT_DIR, "NotoSansJP-Regular.ttf")), readFile(path.join(FONT_DIR, "NotoSansJP-Bold.ttf"))]).then(([regular, bold]) => ({
      regular: { bytes: regular, font: fontkit.create(regular) },
      bold: { bytes: bold, font: fontkit.create(bold) },
    }));
  }
  return faceCache;
}

export const COLORS = {
  text: rgb(0.1, 0.12, 0.16),
  muted: rgb(0.4, 0.44, 0.5),
  rule: rgb(0.8, 0.83, 0.87),
  accent: rgb(0.15, 0.39, 0.92),
  danger: rgb(0.8, 0.15, 0.2),
  fill: rgb(0.96, 0.97, 0.98),
} as const;

export interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: "left" | "right" | "center";
  /** Wrap at this width (points); characters are the wrapping unit so Japanese text wraps too. */
  maxWidth?: number;
  lineHeight?: number;
}

type Weight = "regular" | "bold";
type Op = (ctx: { pages: PDFPage[]; fonts: Record<Weight, PDFFont> }) => void;

export class Pdf {
  private constructor(
    private readonly faces: { regular: Face; bold: Face },
    private readonly meta: { title: string; author: string },
  ) {}
  private ops: Op[] = [];
  private pageCount = 0;
  private pageIndex = -1;
  private chars: Record<Weight, Set<string>> = { regular: new Set(), bold: new Set() };
  /** Current baseline from the top (points). */
  y = MARGIN;

  static async create(opts: { title: string; author?: string }): Promise<Pdf> {
    const pdf = new Pdf(await loadFaces(), { title: opts.title, author: opts.author ?? "Wire Pay" });
    pdf.newPage();
    return pdf;
  }

  newPage(): void {
    this.pageCount++;
    this.pageIndex = this.pageCount - 1;
    this.y = MARGIN;
  }

  get contentWidth(): number {
    return A4.width - MARGIN * 2;
  }

  /** Move down; starts a new page when the remaining space is too small. */
  ensure(height: number): void {
    if (this.y + height > A4.height - MARGIN) this.newPage();
  }

  /** Characters the bold subset lacks (JIS level 2 kanji) fall back to Regular automatically. */
  private weightFor(text: string, bold: boolean): Weight {
    if (!bold) return "regular";
    for (const ch of Array.from(text)) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x20 && !this.faces.bold.font.hasGlyphForCodePoint(cp)) return "regular";
    }
    return "bold";
  }

  width(text: string, size: number, bold = false): number {
    const face = this.faces[this.weightFor(text, bold)].font;
    if (!text) return 0;
    return (face.layout(text).advanceWidth * size) / face.unitsPerEm;
  }

  wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    const out: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      for (const ch of Array.from(paragraph)) {
        const next = line + ch;
        if (line && this.width(next, size, bold) > maxWidth) {
          out.push(line);
          line = ch;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  private draw(op: Op): void {
    this.ops.push(op);
  }

  /** Draw text at an absolute position (top-based y). Returns the height used. */
  textAt(text: string, x: number, yTop: number, o: TextOptions = {}): number {
    const size = o.size ?? 10;
    const lineHeight = o.lineHeight ?? size * 1.5;
    const lines = o.maxWidth ? this.wrap(text, size, o.maxWidth, o.bold) : text.split(/\r?\n/);
    const page = this.pageIndex;
    let y = yTop;
    for (const line of lines) {
      const weight = this.weightFor(line, o.bold ?? false);
      for (const ch of Array.from(line)) this.chars[weight].add(ch);
      const w = this.width(line, size, o.bold);
      const dx = o.align === "right" ? (o.maxWidth ?? 0) - w : o.align === "center" ? ((o.maxWidth ?? 0) - w) / 2 : 0;
      const lineY = y;
      this.draw(({ pages, fonts }) => pages[page].drawText(line, { x: x + dx, y: A4.height - lineY - size, size, font: fonts[weight], color: o.color ?? COLORS.text }));
      y += lineHeight;
    }
    return lines.length * lineHeight;
  }

  /** Draw a paragraph at the cursor and advance it. */
  text(text: string, o: TextOptions & { x?: number; gap?: number } = {}): void {
    const size = o.size ?? 10;
    const maxWidth = o.maxWidth ?? this.contentWidth;
    const lines = this.wrap(text, size, maxWidth, o.bold);
    this.ensure(lines.length * (o.lineHeight ?? size * 1.5));
    this.y += this.textAt(text, o.x ?? MARGIN, this.y, { ...o, maxWidth });
    this.y += o.gap ?? 0;
  }

  private line(x1: number, y1: number, x2: number, y2: number, thickness: number, color: RGB): void {
    const page = this.pageIndex;
    this.draw(({ pages }) => pages[page].drawLine({ start: { x: x1, y: A4.height - y1 }, end: { x: x2, y: A4.height - y2 }, thickness, color }));
  }

  private rectangle(x: number, yTop: number, width: number, height: number, style: { color?: RGB; borderColor?: RGB; borderWidth?: number }): void {
    const page = this.pageIndex;
    this.draw(({ pages }) => pages[page].drawRectangle({ x, y: A4.height - yTop - height, width, height, ...style }));
  }

  rule(opts: { color?: RGB; thickness?: number; gap?: number } = {}): void {
    this.ensure(4);
    this.line(MARGIN, this.y, A4.width - MARGIN, this.y, opts.thickness ?? 0.6, opts.color ?? COLORS.rule);
    this.y += opts.gap ?? 8;
  }

  space(h: number): void {
    this.y += h;
  }

  /** Label / value rows (two columns). */
  rows(items: Array<[string, string]>, opts: { labelWidth?: number; size?: number } = {}): void {
    const size = opts.size ?? 10;
    const labelWidth = opts.labelWidth ?? 130;
    for (const [label, value] of items) {
      const lines = this.wrap(value, size, this.contentWidth - labelWidth);
      const h = Math.max(1, lines.length) * size * 1.5;
      this.ensure(h);
      this.textAt(label, MARGIN, this.y, { size, color: COLORS.muted });
      this.textAt(value, MARGIN + labelWidth, this.y, { size, maxWidth: this.contentWidth - labelWidth });
      this.y += h + 2;
    }
  }

  /**
   * Simple table: header row on a tinted band, then rows. Columns carry a
   * width (points) and an alignment; text is clipped by wrapping.
   */
  table(columns: Array<{ label: string; width: number; align?: "left" | "right" }>, rows: string[][], opts: { size?: number; footer?: string[][] } = {}): void {
    const size = opts.size ?? 9;
    const pad = 4;
    const drawRow = (cells: string[], bold: boolean, band: boolean) => {
      const heights = cells.map((c, i) => this.wrap(c, size, columns[i].width - pad * 2, bold).length * size * 1.45);
      const h = Math.max(...heights, size * 1.45) + pad * 2;
      this.ensure(h);
      if (band) this.rectangle(MARGIN, this.y, this.contentWidth, h, { color: COLORS.fill });
      let x = MARGIN;
      cells.forEach((c, i) => {
        this.textAt(c, x + pad, this.y + pad, { size, bold, maxWidth: columns[i].width - pad * 2, align: columns[i].align ?? "left", lineHeight: size * 1.45 });
        x += columns[i].width;
      });
      this.y += h;
      this.line(MARGIN, this.y, MARGIN + this.contentWidth, this.y, 0.4, COLORS.rule);
    };
    drawRow(
      columns.map((c) => c.label),
      true,
      true,
    );
    for (const r of rows) drawRow(r, false, false);
    for (const r of opts.footer ?? []) drawRow(r, true, false);
  }

  /** Small stamp-like box (e.g. 再発行 / REISSUED) at the top right. */
  stamp(text: string, color: RGB = COLORS.danger): void {
    const size = 11;
    const w = this.width(text, size, true) + 16;
    const x = A4.width - MARGIN - w;
    this.rectangle(x, MARGIN, w, 22, { borderColor: color, borderWidth: 1 });
    this.textAt(text, x + 8, MARGIN + 4, { size, bold: true, color });
  }

  /** Footer on every page: text + page numbers (regular weight). */
  footer(text: string): void {
    const size = 8;
    for (const ch of Array.from(text)) this.chars.regular.add(ch);
    for (const ch of "0123456789 /") this.chars.regular.add(ch);
    this.draw(({ pages, fonts }) => {
      pages.forEach((p, i) => {
        p.drawText(`${text}   ${i + 1} / ${pages.length}`, { x: MARGIN, y: MARGIN / 2, size, font: fonts.regular, color: COLORS.muted });
      });
    });
  }

  /** Subset the fonts to the characters used, embed them, replay the drawing and serialize. */
  async bytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setTitle(this.meta.title);
    doc.setAuthor(this.meta.author);
    doc.setCreator("Wire Pay (pdf-lib)");
    doc.setProducer("Wire Pay");
    doc.setCreationDate(new Date());
    const embed = async (weight: Weight): Promise<PDFFont> => {
      const text = [...this.chars[weight]].join("") || " ";
      const sub = await subsetFont(this.faces[weight].bytes, text, { targetFormat: "truetype" });
      return doc.embedFont(new Uint8Array(sub), { subset: false });
    };
    const fonts = { regular: await embed("regular"), bold: await embed("bold") };
    const pages: PDFPage[] = [];
    for (let i = 0; i < this.pageCount; i++) pages.push(doc.addPage([A4.width, A4.height]));
    for (const op of this.ops) op({ pages, fonts });
    return doc.save();
  }
}

/** HTTP response for a generated PDF (inline; the file name is RFC 5987 encoded for non-ASCII). */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return new Response(new Blob([Buffer.from(bytes)]), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      "content-length": String(bytes.byteLength),
    },
  });
}

/** Yen with thousands separators for PDFs (the UI helper lives in lib/utils). */
export function yen(n: number): string {
  return `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("en-US")}`;
}
