import { add, dir } from "./character";
import { ramp } from "./color";
import type { Look } from "./look";
import type { Material, PixelBuffer, Vec } from "./raster";

export interface ItemContext {
  buf: PixelBuffer;
  /** Centre of the holding hand, frame pixels. */
  hand: Vec;
  /** Pose angle the item points along (0 = down, 90 = forward). */
  angle: number;
  depth: number;
  part: number;
  /** Maps the item's own material index to the buffer's material slot. */
  mat: (i: number) => number;
}

/**
 * Anything a character can hold. Declare materials (5-tone ramps), draw at
 * the hand, and return an anchor point (e.g. the racket head for hit timing).
 */
export interface HeldItem {
  materials(look: Look): Material[];
  draw(ctx: ItemContext): Vec;
}

/** Badminton / squash / tennis style racket in look.itemColor. */
export function racket(o: { head?: [number, number]; shaft?: number } = {}): HeldItem {
  const [A, B] = o.head ?? [5.6, 3.9];
  const shaft = o.shaft ?? 6.5;
  return {
    materials: (look) => [
      { ramp: ramp(look.itemColor), outline: false },
      { ramp: ramp("#c9cbd6"), outline: false },
      { ramp: ramp("#2c2a36"), outline: false },
      { ramp: ramp("#6c6c7a"), outline: false },
    ],
    draw({ buf, hand, angle, depth, part, mat }) {
      const [FRAME, STRING, GRIP, SHAFT] = [0, 1, 2, 3].map(mat);
      const v = dir(angle);
      const n = { x: -v.y, y: v.x };
      buf.capsule(add(hand, v, -1.5), add(hand, v, 4), 1.15, 1.0, depth, part, ({ t }) => ({
        mat: GRIP,
        tone: t > 0.85 ? 3 : 2,
      }));
      buf.line(add(hand, v, 4), add(hand, v, 4 + shaft), SHAFT, 2, depth, part);
      const c = add(hand, v, 4 + shaft + A - 0.5);
      const r = Math.ceil(A + 1);
      for (let y = Math.floor(c.y - r); y <= c.y + r; y++) {
        for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
          const ox = x + 0.5 - c.x;
          const oy = y + 0.5 - c.y;
          const e = ((ox * v.x + oy * v.y) / A) ** 2 + ((ox * n.x + oy * n.y) / B) ** 2;
          if (e > 1) continue;
          if (e > 0.6) buf.put(x, y, FRAME, oy < -1 ? 3 : oy > 1.5 ? 1 : 2, depth, part);
          else buf.put(x, y, STRING, e > 0.32 ? 2 : 3, depth - 0.01, part);
        }
      }
      // Throat: a short V joining shaft to head.
      const throat = add(hand, v, 3.7 + shaft);
      buf.line(throat, add(add(c, v, -A + 0.4), n, 1.6), FRAME, 1, depth, part);
      buf.line(throat, add(add(c, v, -A + 0.4), n, -1.6), FRAME, 1, depth, part);
      return c;
    },
  };
}

/** A short sword: grip in look.itemColor, steel blade. Anchor is the tip. */
export function sword(o: { blade?: number } = {}): HeldItem {
  const blade = o.blade ?? 18;
  return {
    materials: (look) => [
      { ramp: ramp(look.itemColor), outline: true },
      { ramp: ramp("#c9d2dc"), outline: true },
      { ramp: ramp("#c9a13a"), outline: true },
    ],
    draw({ buf, hand, angle, depth, part, mat }) {
      const [GRIP, BLADE, GUARD] = [0, 1, 2].map(mat);
      const v = dir(angle);
      const n = { x: -v.y, y: v.x };
      buf.capsule(add(hand, v, -2.5), add(hand, v, 2.5), 1.1, 1.1, depth, part, () => ({ mat: GRIP, tone: 2 }));
      buf.capsule(add(add(hand, v, 3), n, -3), add(add(hand, v, 3), n, 3), 1, 1, depth + 0.01, part, () => ({
        mat: GUARD,
        tone: 3,
      }));
      const tip = add(hand, v, 3.5 + blade);
      buf.capsule(add(hand, v, 3.5), tip, 1.4, 0.4, depth, part, ({ s }) => ({ mat: BLADE, tone: s < 0 ? 4 : 2 }));
      return tip;
    },
  };
}
