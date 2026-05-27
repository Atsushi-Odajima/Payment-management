// Inline brand icon. Uses a fixed 100×100 viewBox so CSS can scale it
// to any rendered size. Mirrors the shape produced by lib/wire-pay-icon.ts
// (which is the same SVG, written out to disk for favicon / apple-icon).

import { buildWirePayIconSvg } from "@/lib/wire-pay-icon";

interface Props {
  className?: string;
  title?: string;
  rounded?: boolean;
}

export function WirePayIcon({ className, title, rounded = true }: Props) {
  const svg = buildWirePayIconSvg({ size: 100, rounded });
  // Strip the outer <svg> tag so we can re-emit it as a React element with
  // className applied; the inner markup is static and trusted.
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
