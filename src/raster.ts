import { mix, type RGB } from "./color.js";

export interface Material {
  ramp: RGB[];
  /** Gets a 1px outline where it borders empty space. */
  outline: boolean;
}

export interface Vec {
  x: number;
  y: number;
}

/** Key light from above and in front (the character faces +x). */
const LIGHT = (() => {
  const v = [0.42, -0.66, 0.62];
  const len = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / len) as [number, number, number];
})();

const OUTLINE_DARK: RGB = [22, 14, 30];

export function quantize(shade: number): number {
  if (shade < -0.5) return 0;
  if (shade < -0.1) return 1;
  if (shade < 0.33) return 2;
  if (shade < 0.56) return 3;
  return 4;
}

/** Lambert term for a point on a sphere/cylinder with 2D offset n (|n|<=1). */
export function lambert(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] - 0.35;
}

export type Painter = (info: {
  /** Unscaled pixel position; whole numbers at scale 1, fractional above it. */
  x: number;
  y: number;
  /** 0..1 along the segment. */
  t: number;
  /** -1..1 across the segment (signed). */
  s: number;
  shade: number;
}) => { mat: number; tone: number } | null;

/**
 * Indexed pixel buffer. Parts are painted with a depth; nearer paint wins.
 * resolve() then adds occlusion creases, selective outlines and cleanup.
 *
 * `scale` renders the same drawing with more pixels: every coordinate and radius stays in
 * unscaled units and the buffer (`w` × `h`, already scaled) holds `scale` pixels per unit.
 * Shapes gain real detail; outlines and creases stay one pixel wide.
 */
export class PixelBuffer {
  readonly mat: Uint8Array;
  readonly tone: Int8Array;
  readonly depth: Float32Array;
  readonly part: Uint8Array;
  /** Bounds of everything plotted so far: resolve() only walks this box. */
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -1;
  private y1 = -1;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly materials: Material[],
    readonly scale = 1,
  ) {
    const n = w * h;
    this.mat = new Uint8Array(n);
    this.tone = new Int8Array(n);
    this.depth = new Float32Array(n).fill(-Infinity);
    this.part = new Uint8Array(n);
  }

  /** One buffer pixel. */
  private plot(
    x: number,
    y: number,
    mat: number,
    tone: number,
    depth: number,
    part: number,
  ) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (depth < this.depth[i]) return;
    this.mat[i] = mat + 1;
    this.tone[i] = Math.max(0, Math.min(4, tone));
    this.depth[i] = depth;
    this.part[i] = part;
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  /** One unscaled pixel: a `scale` × `scale` block of the buffer. */
  put(
    x: number,
    y: number,
    mat: number,
    tone: number,
    depth: number,
    part: number,
  ) {
    const k = this.scale;
    if (k === 1) return this.plot(x, y, mat, tone, depth, part);
    for (let v = Math.floor(y * k); v < Math.floor((y + 1) * k); v++)
      for (let u = Math.floor(x * k); u < Math.floor((x + 1) * k); u++)
        this.plot(u, v, mat, tone, depth, part);
  }

  /** Material at an unscaled pixel, or -1. */
  matAt(x: number, y: number): number {
    x = Math.floor(x * this.scale);
    y = Math.floor(y * this.scale);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.mat[y * this.w + x] - 1;
  }

  /** Tapered capsule from a to b; painter decides material per pixel. */
  capsule(
    a: Vec,
    b: Vec,
    ra: number,
    rb: number,
    depth: number,
    part: number,
    paint: Painter,
  ) {
    const r = Math.max(ra, rb);
    const k = this.scale;
    const x0 = Math.floor((Math.min(a.x, b.x) - r - 1) * k);
    const x1 = Math.ceil((Math.max(a.x, b.x) + r + 1) * k);
    const y0 = Math.floor((Math.min(a.y, b.y) - r - 1) * k);
    const y1 = Math.ceil((Math.max(a.y, b.y) + r + 1) * k);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-6;
    const len = Math.sqrt(len2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Pixel centre in unscaled units.
        const px = (x + 0.5) / k;
        const py = (y + 0.5) / k;
        const t = Math.max(
          0,
          Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2),
        );
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        const ox = px - cx;
        const oy = py - cy;
        const rr = ra + (rb - ra) * t;
        const d = Math.hypot(ox, oy);
        if (d > rr) continue;
        const nx = ox / rr;
        const ny = oy / rr;
        // Signed side: which side of the a->b line the pixel is on.
        const side = (dx * oy - dy * ox) / len;
        const res = paint({
          x: px - 0.5,
          y: py - 0.5,
          t,
          s: side / rr,
          shade: lambert(nx, ny),
        });
        if (res) this.plot(x, y, res.mat, res.tone, depth, part);
      }
    }
  }

  disc(c: Vec, r: number, depth: number, part: number, paint: Painter) {
    this.capsule(c, c, r, r, depth, part, paint);
  }

  /**
   * Flat-ended oriented rectangle from a to b, `half` px either side of the axis
   * (panels, plates, bodywork). Shaded as a gently curved panel.
   */
  box(a: Vec, b: Vec, half: number, depth: number, part: number, paint: Painter) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / len;
    const uy = dy / len;
    const k = this.scale;
    const x0 = Math.floor((Math.min(a.x, b.x) - half - 1) * k);
    const x1 = Math.ceil((Math.max(a.x, b.x) + half + 1) * k);
    const y0 = Math.floor((Math.min(a.y, b.y) - half - 1) * k);
    const y1 = Math.ceil((Math.max(a.y, b.y) + half + 1) * k);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / k;
        const py = (y + 0.5) / k;
        const ox = px - a.x;
        const oy = py - a.y;
        const along = ox * ux + oy * uy;
        // Same sign convention as capsule(): which side of the a->b line.
        const side = ux * oy - uy * ox;
        if (along < 0 || along > len || Math.abs(side) > half) continue;
        const s = side / half;
        const res = paint({
          x: px - 0.5,
          y: py - 0.5,
          t: along / len,
          s,
          shade: lambert(-uy * s * 0.5, ux * s * 0.5),
        });
        if (res) this.plot(x, y, res.mat, res.tone, depth, part);
      }
    }
  }

  line(a: Vec, b: Vec, mat: number, tone: number, depth: number, part: number) {
    const steps =
      Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 1.5) || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.put(
        Math.floor(a.x + (b.x - a.x) * t),
        Math.floor(a.y + (b.y - a.y) * t),
        mat,
        tone,
        depth,
        part,
      );
    }
  }

  /** Crease shadows, orphan cleanup, then selective outline → RGBA. */
  resolve(): Uint8ClampedArray {
    const { w, h, mat, tone, depth, part } = this;
    const idx = (x: number, y: number) => y * w + x;
    const N4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    // 1. A nearer part casts a 1px crease onto the part behind it.
    // Painted pixels plus the one-pixel rim the outline can land on.
    const xa = Math.max(0, this.x0 - 1);
    const xb = Math.min(w - 1, this.x1 + 1);
    const ya = Math.max(0, this.y0 - 1);
    const yb = Math.min(h - 1, this.y1 + 1);

    const crease = new Uint8Array(w * h);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const i = idx(x, y);
        if (!mat[i]) continue;
        for (const [ox, oy] of N4) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = idx(nx, ny);
          if (mat[j] && part[j] !== part[i] && depth[j] > depth[i] + 0.5) {
            crease[i] = 1;
            break;
          }
        }
      }
    }
    for (let i = 0; i < crease.length; i++)
      if (crease[i]) tone[i] = Math.max(0, tone[i] - 1);

    // 2. Remove single-pixel tone speckles inside a material.
    const cleaned = Int8Array.from(tone);
    for (let y = Math.max(1, ya); y <= Math.min(h - 2, yb); y++) {
      for (let x = Math.max(1, xa); x <= Math.min(w - 2, xb); x++) {
        const i = idx(x, y);
        if (!mat[i] || crease[i]) continue;
        const counts = [0, 0, 0, 0, 0];
        let same = 0;
        let match = false;
        for (const [ox, oy] of N4) {
          const j = idx(x + ox, y + oy);
          if (mat[j] !== mat[i]) continue;
          same++;
          counts[tone[j]]++;
          if (tone[j] === tone[i]) match = true;
        }
        if (same >= 3 && !match)
          cleaned[i] = counts.indexOf(Math.max(...counts));
      }
    }

    // 3. Colour + selective outline (lighter on the lit top/front edges).
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const i = idx(x, y);
        let rgb: RGB | null = null;
        if (mat[i]) {
          rgb = this.materials[mat[i] - 1].ramp[cleaned[i]];
        } else {
          let best = -1;
          let bestDepth = -Infinity;
          let lit = false;
          for (const [ox, oy] of N4) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = idx(nx, ny);
            if (!mat[j] || !this.materials[mat[j] - 1].outline) continue;
            if (depth[j] > bestDepth) {
              bestDepth = depth[j];
              best = j;
              // Shape lies below or behind (-x) this empty pixel: lit edge.
              lit = oy === 1 || ox === -1;
            }
          }
          if (best >= 0) {
            const r = this.materials[mat[best] - 1].ramp;
            rgb = lit
              ? mix(r[0], OUTLINE_DARK, 0.35)
              : mix(r[0], OUTLINE_DARK, 0.75);
          }
        }
        if (rgb) {
          out[i * 4] = rgb[0];
          out[i * 4 + 1] = rgb[1];
          out[i * 4 + 2] = rgb[2];
          out[i * 4 + 3] = 255;
        }
      }
    }
    return out;
  }
}
