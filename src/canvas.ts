/** Canvas helpers for DOM previews, portraits and exporting sprite sheets. */
export interface Pixels {
  pixels: Uint8ClampedArray;
  width?: number;
  height?: number;
  size?: number;
}

const dims = (p: Pixels) => ({ w: p.width ?? p.size!, h: p.height ?? p.size! });

export function toCanvas(p: Pixels): HTMLCanvasElement {
  const { w, h } = dims(p);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.pixels), w, h), 0, 0);
  return c;
}

export interface DrawOptions {
  /** Source rectangle [x, y, w, h] (default: whole frame). */
  crop?: [number, number, number, number];
  scale?: number;
}

/** Nearest-neighbour upscale into a new canvas (for UI portraits). */
export function toScaledCanvas(p: Pixels, o: DrawOptions = {}): HTMLCanvasElement {
  const { w, h } = dims(p);
  const [sx, sy, sw, sh] = o.crop ?? [0, 0, w, h];
  const k = o.scale ?? 1;
  const out = document.createElement("canvas");
  out.width = sw * k;
  out.height = sh * k;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(toCanvas(p), sx, sy, sw, sh, 0, 0, sw * k, sh * k);
  return out;
}

/** Lay frames out left-to-right as one sprite sheet (PNG-exportable). */
export function toSheet(frames: Pixels[]): HTMLCanvasElement {
  const { w, h } = dims(frames[0]);
  const c = document.createElement("canvas");
  c.width = w * frames.length;
  c.height = h;
  const g = c.getContext("2d")!;
  frames.forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), w, h), i * w, 0));
  return c;
}
