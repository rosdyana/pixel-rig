import { describe, expect, it } from "vitest";
import {
  BIKE_KINDS,
  DEFAULT_LOOK,
  mirrorRider,
  REAR_FRAME,
  renderRider,
  renderRiderAnim,
  RIDER_ANIMS,
  RIDER_POSES,
  riderFramePoses,
  riderPose,
  sword,
  type Bike,
  type Rider,
} from "../src/index.js";

const { width: W, height: H, groundY } = REAR_FRAME;
const alpha = (px: Uint8ClampedArray, x: number, y: number) => px[(y * W + x) * 4 + 3];
const count = (px: Uint8ClampedArray) => px.reduce((n, v, i) => n + (i % 4 === 3 && v ? 1 : 0), 0);
function lowestRow(px: Uint8ClampedArray): number {
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (alpha(px, x, y)) return y;
  return -1;
}

const rider: Rider = { look: { ...DEFAULT_LOOK, outfit: { ...DEFAULT_LOOK.outfit, sleeves: "long" } }, patch: true };
const bikes: Bike[] = BIKE_KINDS.map((kind) => ({ kind, body: "#d8262f", accent: "#f4f1ea" }));

describe("rear rig", () => {
  it("puts the rear tyre on the ground line for every bike kind", () => {
    for (const bike of bikes) {
      const low = lowestRow(renderRider(rider, bike).pixels);
      expect(low, bike.kind).toBeGreaterThanOrEqual(groundY - 1);
      expect(low, bike.kind).toBeLessThanOrEqual(groundY);
    }
  });

  it("never clips the frame edges through lean, attacks and a held item", () => {
    for (const bike of bikes) {
      const poses = [
        ...Object.values(RIDER_ANIMS).flatMap(riderFramePoses),
        ...Object.values(RIDER_ANIMS).flatMap(riderFramePoses).map(mirrorRider),
        ...[-25, -12, 12, 25].map((roll) => riderPose({ roll, steer: roll / 25 })),
        riderPose({ ...RIDER_POSES.kick, roll: 20 }),
        riderPose({ ...mirrorRider(RIDER_POSES.swing), roll: -20 }),
      ];
      poses.forEach((p, i) => {
        const f = renderRider(rider, bike, p, { item: sword({ blade: 12 }) });
        for (let y = 0; y < H; y++) {
          expect(alpha(f.pixels, 0, y), `${bike.kind}[${i}] left`).toBe(0);
          expect(alpha(f.pixels, W - 1, y), `${bike.kind}[${i}] right`).toBe(0);
        }
        for (let x = 0; x < W; x++) expect(alpha(f.pixels, x, 0), `${bike.kind}[${i}] top`).toBe(0);
      });
    }
  });

  it("is deterministic", () => {
    const a = renderRider(rider, bikes[0], RIDER_POSES.kick).pixels;
    const b = renderRider(rider, bikes[0], RIDER_POSES.kick).pixels;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("draws a riderless bike with fewer pixels and no item", () => {
    const parked = renderRider(null, bikes[2], RIDER_POSES.ride, { item: sword() });
    expect(parked.item).toBeNull();
    expect(count(parked.pixels)).toBeGreaterThan(200);
    expect(count(parked.pixels)).toBeLessThan(count(renderRider(rider, bikes[2]).pixels));
  });

  it("mirrors an action to the other side", () => {
    const right = renderRider(rider, bikes[0], RIDER_POSES.punch, { item: sword() });
    const left = renderRider(rider, bikes[0], mirrorRider(RIDER_POSES.punch), { item: sword() });
    expect(right.hand.x).toBeGreaterThan(REAR_FRAME.originX);
    expect(left.hand.x).toBeLessThan(REAR_FRAME.originX);
    expect(left.hand.x + right.hand.x).toBeCloseTo(REAR_FRAME.originX * 2, 5);
    expect(mirrorRider(mirrorRider(RIDER_POSES.kick))).toEqual(RIDER_POSES.kick);
  });

  it("leans the rider's head toward the roll", () => {
    const column = (px: Uint8ClampedArray) => {
      // Mean x of the top 10 occupied rows: the helmet.
      let sum = 0;
      let n = 0;
      let rows = 0;
      for (let y = 0; y < H && rows < 10; y++) {
        let any = false;
        for (let x = 0; x < W; x++) {
          if (!alpha(px, x, y)) continue;
          sum += x;
          n++;
          any = true;
        }
        if (any) rows++;
      }
      return sum / n;
    };
    const upright = column(renderRider(rider, bikes[0]).pixels);
    expect(column(renderRider(rider, bikes[0], riderPose({ roll: 20 })).pixels)).toBeGreaterThan(upright + 8);
    expect(column(renderRider(rider, bikes[0], riderPose({ roll: -20 })).pixels)).toBeLessThan(upright - 8);
  });

  it("expands animations and lights the brake lamp", () => {
    expect(renderRiderAnim(rider, bikes[0], RIDER_ANIMS.punch)).toHaveLength(7);
    const off = renderRider(rider, bikes[0], RIDER_POSES.ride).pixels;
    const on = renderRider(rider, bikes[0], RIDER_POSES.brake).pixels;
    expect(Array.from(on)).not.toEqual(Array.from(off));
  });

  it("supports helmets, bare heads, shorts and cargo", () => {
    const base = count(renderRider(rider, bikes[1]).pixels);
    for (const helmet of ["half", "none"] as const) {
      const f = renderRider({ ...rider, helmet, shorts: true, look: { ...rider.look, hair: "ponytail" } }, bikes[1]);
      expect(count(f.pixels), helmet).toBeGreaterThan(base * 0.8);
    }
    expect(count(renderRider(rider, { ...bikes[1], cargo: "#2f9e44" }).pixels)).toBeGreaterThan(base);
  });
});
