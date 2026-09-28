import { describe, expect, it } from "vitest";
import {
  ANIMS,
  DEFAULT_FRAME,
  DEFAULT_LOOK,
  framePoses,
  PixelBuffer,
  POSES,
  racket,
  randomLook,
  ramp,
  renderAnims,
  renderPose,
  renderRotations,
  rotationIndex,
  solid,
  sword,
  type HeldItem,
} from "../src";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { width: W, height: H, groundY } = DEFAULT_FRAME;
const alpha = (px: Uint8ClampedArray, x: number, y: number) => px[(y * W + x) * 4 + 3];
function lowestRow(px: Uint8ClampedArray): number {
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (alpha(px, x, y)) return y;
  return -1;
}

const rng = mulberry32(99);
const looks = [DEFAULT_LOOK, ...Array.from({ length: 10 }, () => randomLook(rng))];
const items: (HeldItem | null)[] = [null, racket(), sword()];

describe("rig", () => {
  it("plants feet on the ground line in every grounded frame", () => {
    for (const look of looks) {
      for (const [name, a] of Object.entries(ANIMS)) {
        framePoses(a).forEach((p, i) => {
          if (p.air > 0) return;
          const low = lowestRow(renderPose(look, p).pixels);
          expect(low, `${name}[${i}]`).toBeGreaterThanOrEqual(groundY - 1);
          expect(low, `${name}[${i}]`).toBeLessThanOrEqual(groundY);
        });
      }
    }
  });

  it("never clips the frame edges, with any item", () => {
    for (const look of looks.slice(0, 4)) {
      for (const item of items) {
        for (const [name, frames] of Object.entries(renderAnims(look, ANIMS, { item }))) {
          frames.forEach((f, i) => {
            for (let y = 0; y < H; y++) {
              expect(alpha(f.pixels, 0, y), `${name}[${i}] left`).toBe(0);
              expect(alpha(f.pixels, W - 1, y), `${name}[${i}] right`).toBe(0);
            }
            for (let x = 0; x < W; x++) expect(alpha(f.pixels, x, 0), `${name}[${i}] top`).toBe(0);
          });
        }
      }
    }
  });

  it("is deterministic", () => {
    const a = renderPose(DEFAULT_LOOK, POSES.lunge, { item: racket() }).pixels;
    const b = renderPose(DEFAULT_LOOK, POSES.lunge, { item: racket() }).pixels;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("reports item anchors only when an item is held", () => {
    expect(renderPose(DEFAULT_LOOK, POSES.ready).item).toBeNull();
    const withRacket = renderPose(DEFAULT_LOOK, POSES.ready, { item: racket() });
    expect(withRacket.item).not.toBeNull();
    // Ready pose holds the racket up: its head is above the hand.
    expect(withRacket.item!.y).toBeLessThan(withRacket.hand.y);
  });

  it("supports custom frame sizes", () => {
    const f = renderPose(DEFAULT_LOOK, POSES.ready, { frame: { width: 80, height: 90, groundY: 86, originX: 40 } });
    expect(f.pixels.length).toBe(80 * 90 * 4);
    expect(f.origin).toEqual({ x: 40, y: 86 });
  });
});

describe("props", () => {
  it("pre-renders rotations and picks the nearest heading", () => {
    const sprites = renderRotations(9, 8, [{ ramp: ramp("#ffffff"), outline: true }], (buf: PixelBuffer, c, v) => {
      buf.capsule({ x: c.x - v.x * 2, y: c.y - v.y * 2 }, { x: c.x + v.x * 2, y: c.y + v.y * 2 }, 1.2, 0.6, 1, 1, solid(0));
    });
    expect(sprites).toHaveLength(8);
    expect(sprites.every((s) => s.pixels.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
    expect(rotationIndex(0, 8)).toBe(0);
    expect(rotationIndex(Math.PI, 8)).toBe(4);
    expect(rotationIndex(-Math.PI / 4, 8)).toBe(7);
  });
});
