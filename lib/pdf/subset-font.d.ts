// Minimal typing for subset-font (HarfBuzz subsetter, no bundled types).
declare module "subset-font" {
  export default function subsetFont(
    buffer: Buffer,
    text: string,
    options?: { targetFormat?: "sfnt" | "woff" | "woff2" | "truetype"; preserveNameIds?: number[]; variationAxes?: Record<string, number | { min: number; max: number }> },
  ): Promise<Buffer>;
}
