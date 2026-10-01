import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAME,
  DEFAULT_LOOK,
  POSES,
  REAR_FRAME,
  renderPose,
  renderRider,
  renderWalker,
  runCycle,
  STAND_POSE,
  sword,
  type Frame,
  type Rider,
} from "../src/index.js";

const alpha = (f: Frame, x: number, y: number) => f.pixels[(y * f.width + x) * 4 + 3];
const count = (f: Frame) => f.pixels.reduce((n, v, i) => n + (i % 4 === 3 && v ? 1 : 0), 0);
function lowestRow(f: Frame): number {
  for (let y = f.height - 1; y >= 0; y--) for (let x = 0; x < f.width; x++) if (alpha(f, x, y)) return y;
  return -1;
}

const riders: Rider[] = [
  { look: DEFAULT_LOOK, patch: true },
  { look: { ...DEFAULT_LOOK, hair: "spiky" }, helmet: "none", shorts: true },
  { look: { ...DEFAULT_LOOK, gender: "female", hair: "ponytail" }, helmet: "half" },
];

describe("on-foot rig", () => {
  it("stands on the ground line, facing either way", () => {
    for (const rider of riders) {
      for (const facing of ["front", "back"] as const) {
        const low = lowestRow(renderWalker(rider, STAND_POSE, { facing }));
        expect(low).toBeGreaterThanOrEqual(DEFAULT_FRAME.groundY - 1);
        expect(low).toBeLessThanOrEqual(DEFAULT_FRAME.groundY);
      }
    }
  });

  it("runs an eight-frame loop that never leaves the frame", () => {
    const cycle = runCycle();
    expect(cycle).toHaveLength(8);
    for (const rider of riders) {
      const frames = cycle.map((p) => renderWalker(rider, p));
      for (const f of frames) {
        for (let y = 0; y < f.height; y++) {
          expect(alpha(f, 0, y)).toBe(0);
          expect(alpha(f, f.width - 1, y)).toBe(0);
        }
        for (let x = 0; x < f.width; x++) expect(alpha(f, x, 0)).toBe(0);
      }
      // The legs actually move.
      expect(Array.from(frames[0].pixels)).not.toEqual(Array.from(frames[4].pixels));
    }
  });

  it("shows a different picture from the front and from behind, and is deterministic", () => {
    const front = renderWalker(riders[0], STAND_POSE, { facing: "front" });
    const back = renderWalker(riders[0], STAND_POSE, { facing: "back" });
    expect(Array.from(front.pixels)).not.toEqual(Array.from(back.pixels));
    expect(Array.from(renderWalker(riders[0], STAND_POSE).pixels)).toEqual(Array.from(front.pixels));
  });
});

describe("raised arm", () => {
  it("holds an item above the head, on the side asked for", () => {
    const up = renderWalker(riders[1], { ...STAND_POSE, raise: { side: 1, angle: 170 } }, { item: sword({ blade: 10 }) });
    const plain = renderWalker(riders[1], STAND_POSE);
    expect(up.item).not.toBeNull();
    expect(up.item!.y).toBeLessThan(up.hand.y);
    expect(up.hand.x).toBeGreaterThan(DEFAULT_FRAME.originX);
    expect(up.hand.y).toBeLessThan(plain.hand.y - 15);
    const left = renderWalker(riders[1], { ...STAND_POSE, raise: { side: -1, angle: 170 } });
    expect(left.hand.x).toBeLessThan(DEFAULT_FRAME.originX);
    expect(plain.item).toBeNull();
  });
});

describe("scale", () => {
  it("draws every rig with scale² the pixels, anchors scaled to match", () => {
    const pairs: [Frame, Frame][] = [
      [renderPose(DEFAULT_LOOK, POSES.ready), renderPose(DEFAULT_LOOK, POSES.ready, { scale: 2 })],
      [renderRider(riders[0], { kind: "sport", body: "#d8262f", accent: "#f4f1ea" }), renderRider(riders[0], { kind: "sport", body: "#d8262f", accent: "#f4f1ea" }, undefined, { scale: 2 })],
      [renderWalker(riders[1]), renderWalker(riders[1], STAND_POSE, { scale: 2 })],
    ];
    for (const [one, two] of pairs) {
      expect(two.width).toBe(one.width * 2);
      expect(two.height).toBe(one.height * 2);
      expect(two.origin).toEqual({ x: one.origin.x * 2, y: one.origin.y * 2 });
      expect(two.hand.x).toBeCloseTo(one.hand.x * 2, 6);
      const ratio = count(two) / count(one);
      // Outlines stay one pixel wide, so a little under four times.
      expect(ratio).toBeGreaterThan(3.3);
      expect(ratio).toBeLessThan(4.1);
    }
    expect(renderRider(riders[0], { kind: "sport", body: "#d8262f", accent: "#f4f1ea" }, undefined, { scale: 2 }).origin).toEqual({
      x: REAR_FRAME.originX * 2,
      y: REAR_FRAME.groundY * 2,
    });
  });
});
