import { PixelBuffer, quantize, type Material, type Painter, type Vec } from "./raster";

export interface PropSprite {
  pixels: Uint8ClampedArray;
  size: number;
}

/**
 * Pre-render a small prop at `count` headings (rotating pixel art at runtime
 * smears it). `draw` paints the prop pointing along `heading` (unit vector,
 * screen space) around `centre`.
 */
export function renderRotations(
  size: number,
  count: number,
  materials: Material[],
  draw: (buf: PixelBuffer, centre: Vec, heading: Vec, degrees: number) => void,
): PropSprite[] {
  return Array.from({ length: count }, (_, i) => {
    const deg = (i * 360) / count;
    const r = (deg * Math.PI) / 180;
    const buf = new PixelBuffer(size, size, materials);
    draw(buf, { x: size / 2, y: size / 2 }, { x: Math.cos(r), y: Math.sin(r) }, deg);
    return { pixels: buf.resolve(), size };
  });
}

/** Index of the pre-rendered heading closest to an angle in radians. */
export function rotationIndex(radians: number, count: number): number {
  const step = (Math.PI * 2) / count;
  return ((Math.round(radians / step) % count) + count) % count;
}

/** A shaded painter for a single material (the common case). */
export const solid =
  (mat: number, toneOffset = 0): Painter =>
  ({ shade }) => ({ mat, tone: quantize(shade) + toneOffset });
