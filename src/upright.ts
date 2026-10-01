/**
 * On-foot rig for 2.5D games: a person seen from the front or from behind, standing or
 * running toward or away from the camera. The companion to the rear rig: it draws the same
 * `Rider` (look, helmet, jacket patch) at the same scale, for when they are off the bike.
 */
import { DEFAULT_FRAME, dims, onPattern, type Frame, type FrameSpec } from "./character.js";
import { bodyMaterials, M } from "./palette.js";
import { PixelBuffer, quantize, type Painter, type Vec } from "./raster.js";
import type { HeldItem } from "./items.js";
import { drawBackHead, rearMaterials, REAR_PART, REAR_SLOTS, RM, type Place, type Rider } from "./rear.js";

export type Facing = "front" | "back";

export interface WalkPose {
  /** Each leg's lift, 0 (planted) to 1 (knee high). `L` is the leg on the left of the picture. */
  legL: number;
  legR: number;
  /** Each arm's swing, -1 (back) to 1 (forward and up). */
  armL: number;
  armR: number;
  /** Pixels the whole body is off the ground (the flight phase of a stride). */
  bob: number;
  /**
   * One arm held straight out instead of swinging, for waving and pointing: which arm
   * (-1 left of the picture, 1 right) and its angle (0 down, 90 out to its side, 180 up).
   * A held item goes in this hand and points the same way.
   */
  raise?: { side: -1 | 1; angle: number };
}

export const STAND_POSE: WalkPose = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };

const RUN_KEYS: WalkPose[] = [
  { legL: 1, legR: 0, armL: -1, armR: 1, bob: 0 },
  { legL: 0.3, legR: 0.15, armL: 0, armR: 0, bob: 2.2 },
  { legL: 0, legR: 1, armL: 1, armR: -1, bob: 0 },
  { legL: 0.15, legR: 0.3, armL: 0, armR: 0, bob: 2.2 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A looping run: the four key poses with `steps` frames blended between each (default 2 = 8 frames). */
export function runCycle(steps = 2): WalkPose[] {
  const out: WalkPose[] = [];
  RUN_KEYS.forEach((p, i) => {
    const q = RUN_KEYS[(i + 1) % RUN_KEYS.length];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        legL: lerp(p.legL, q.legL, t),
        legR: lerp(p.legR, q.legR, t),
        armL: lerp(p.armL, q.armL, t),
        armR: lerp(p.armR, q.armR, t),
        bob: lerp(p.bob, q.bob, t),
      });
    }
  });
  return out;
}

export interface WalkOptions {
  /** Which way they face: `front` looks at the camera (default). */
  facing?: Facing;
  frame?: FrameSpec;
  /** Pixels per rig unit (default 1): see RenderOptions.scale. */
  scale?: number;
  /** Something to hold in the raised hand (see WalkPose.raise). */
  item?: HeldItem | null;
}

const solid =
  (mat: number, off = 0): Painter =>
  ({ shade }) => ({ mat, tone: quantize(shade) + off });

/** A face (or the front of a helmet) centred on `hc`, local coordinates. */
function drawFrontHead(buf: PixelBuffer, P: Place, rider: Rider, hc: Vec) {
  const look = rider.look;
  const d = dims(look);
  const H = REAR_PART.head;
  const C = P(hc.x, hc.y);
  /** Pixel position relative to the head centre: [across, up]. */
  const rel = (x: number, y: number): [number, number] => [x + 0.5 - C.x, C.y - (y + 0.5)];
  const helmet = rider.helmet ?? "full";
  if (helmet === "full") {
    const r = d.headR + 1.5;
    buf.capsule(P(hc.x, hc.y - 1.4), P(hc.x, hc.y + 0.8), r, r, 4.4, H, ({ shade, x, y }) => {
      const [ac, v] = rel(x, y);
      if (Math.abs(ac) < r - 1.4 && v > -1.6 && v < 2.4) return { mat: RM.visor, tone: v > 1.3 && ac > 0 ? 4 : v > 1.3 ? 3 : 2 };
      if (v < -r + 0.2) return { mat: RM.dark, tone: 1 };
      if (Math.abs(ac) < 1.15 && v >= 2.4) return { mat: RM.helmetTrim, tone: quantize(shade) };
      return { mat: RM.helmet, tone: quantize(shade) };
    });
    return;
  }
  const r = d.headR;
  const bare = helmet === "none";
  const long = look.hair === "bob" || look.hair === "ponytail" || look.hair === "curly";
  buf.disc(C, r + (bare && look.hair === "curly" ? 0.9 : 0), 4.4, H, ({ shade, x, y }) => {
    const [ac, v] = rel(x, y);
    // Hairline: a cap on top, coming down the sides.
    const side = Math.abs(ac) > r - 1.5 && v > (long ? -3 : -0.5);
    const top = v > (look.hair === "buzz" ? r * 0.62 : r * 0.42);
    if (top || side) return { mat: M.hair, tone: quantize(shade) };
    return { mat: M.skin, tone: quantize(shade) };
  });
  for (const side of [-1, 1]) {
    buf.disc(P(hc.x + side * (r - 0.1), hc.y - 0.6), 1.2, 4.35, H, solid(M.skin, -1));
    buf.disc(P(hc.x + side * 2.2, hc.y + 0.4), 0.8, 4.5, H, () => ({ mat: M.eye, tone: 2 }));
  }
  buf.capsule(P(hc.x - 1, hc.y - 3), P(hc.x + 1, hc.y - 3), 0.55, 0.55, 4.5, H, () => ({ mat: M.lip, tone: 1 }));
  if (look.facialHair === "mustache") buf.capsule(P(hc.x - 1.4, hc.y - 2), P(hc.x + 1.4, hc.y - 2), 0.55, 0.55, 4.5, H, () => ({ mat: M.hair, tone: 1 }));
  if (!bare) {
    buf.disc(C, r + 1.2, 4.6, H, ({ shade, x, y }) => {
      const [ac, v] = rel(x, y);
      if (v < 1.1) return null;
      if (v < 2.1) return { mat: RM.dark, tone: 1 };
      if (Math.abs(ac) < 1.15) return { mat: RM.helmetTrim, tone: quantize(shade) };
      return { mat: RM.helmet, tone: quantize(shade) };
    });
  } else if (look.hair === "bun") {
    buf.disc(P(hc.x, hc.y + r), 2.4, 4.3, H, solid(M.hair));
  } else if (look.hair === "spiky") {
    for (const k of [-1, 0, 1]) buf.capsule(P(hc.x + k * 2.6, hc.y + r - 1.5), P(hc.x + k * 3.6, hc.y + r + 1.6), 1.2, 0.5, 4.3, H, solid(M.hair));
  }
}

/**
 * Draw a rider on foot, facing the camera or away from it. Deterministic. `frame.origin` is
 * the point on the ground between their feet.
 */
export function renderWalker(rider: Rider, pose: WalkPose = STAND_POSE, opts: WalkOptions = {}): Frame {
  const f = opts.frame ?? DEFAULT_FRAME;
  const k = opts.scale ?? 1;
  const front = (opts.facing ?? "front") === "front";
  const look = rider.look;
  const o = look.outfit;
  const d = dims(look);
  const raise = pose.raise;
  const item = raise ? (opts.item ?? null) : null;
  const materials = [
    ...bodyMaterials(look),
    ...rearMaterials({ kind: "underbone", body: "#000000", accent: "#000000" }, rider),
    ...(item?.materials(look) ?? []),
  ];
  const buf = new PixelBuffer(f.width * k, f.height * k, materials, k);
  const P: Place = (x, y) => ({ x: f.originX + x, y: f.groundY - y });
  const D = (v: Vec): Vec => ({ x: v.x, y: -v.y });

  // 2.5: the ankle's height over the sole.
  const hipY = d.thigh + d.shin + 2.5 + pose.bob;
  const neckY = hipY + 0.6 + d.torso * 0.97;
  const sw = d.rChest + 1.7;
  const shY = neckY - 2.4;

  for (const side of [-1, 1]) {
    const lift = Math.max(0, Math.min(1, side < 0 ? pose.legL : pose.legR));
    const hip = { x: side * 3.1, y: hipY };
    // A raised knee points at (or away from) the camera: the leg foreshortens.
    const knee = { x: side * (3.1 + 1.3 * lift), y: hip.y - d.thigh * (1 - 0.5 * lift) };
    const ankle = { x: side * (3.1 + 0.4 * lift), y: knee.y - d.shin * (1 - 0.4 * lift) };
    // Facing us, the raised leg is the near one; from behind it is the far one.
    const depth = lift > 0.5 === front ? 4.7 : 2.5;
    const L = REAR_PART.legs;
    buf.capsule(P(hip.x, hip.y), P(knee.x, knee.y), d.rThigh[0], d.rThigh[1] + 0.3, depth, L, ({ shade, t }) => ({
      mat: rider.shorts && t > 0.78 ? M.skin : M.bottom,
      tone: quantize(shade),
    }));
    buf.capsule(P(knee.x, knee.y), P(ankle.x, ankle.y), d.rShin[0] + 0.3, d.rShin[1] + 0.2, depth, L, ({ shade, t }) => ({
      mat: rider.shorts ? M.skin : M.bottom,
      tone: quantize(shade) - (!rider.shorts && t > 0.9 ? 1 : 0),
    }));
    const shoe = P(ankle.x + side * 0.4, ankle.y - 0.6);
    buf.capsule(P(ankle.x, ankle.y), shoe, 1.9, 1.9, depth + 0.1, L, ({ shade, y }) => {
      if (y + 0.5 > shoe.y + 0.9) return { mat: M.sole, tone: 2 };
      return { mat: o.barefoot ? M.skin : M.shoe, tone: quantize(shade) };
    });
  }

  let hand: Vec = { x: 0, y: 0 };
  let raised: { hand: Vec; v: Vec } | null = null as { hand: Vec; v: Vec } | null;
  for (const side of [-1, 1]) {
    const swing = Math.max(-1, Math.min(1, side < 0 ? pose.armL : pose.armR));
    const fwd = Math.max(0, swing);
    const back = Math.max(0, -swing);
    const s0 = { x: side * sw, y: shY };
    const elbow = { x: s0.x + side * (1.2 + 0.8 * Math.abs(swing)), y: s0.y - d.upper * (1 - 0.3 * Math.abs(swing)) };
    // Forward: the forearm pumps up across the body. Back: it trails, foreshortened.
    const wrist = fwd
      ? { x: elbow.x - side * (0.5 + 2 * fwd), y: elbow.y - d.fore * (0.9 - 1.5 * fwd) }
      : { x: elbow.x + side * 0.6 * back, y: elbow.y - d.fore * (1 - 0.45 * back) };
    const lifted = raise?.side === side;
    if (lifted) {
      // Held straight from the shoulder.
      const r = (raise.angle * Math.PI) / 180;
      const v = { x: side * Math.sin(r), y: -Math.cos(r) };
      elbow.x = s0.x + v.x * d.upper;
      elbow.y = s0.y + v.y * d.upper;
      wrist.x = elbow.x + v.x * d.fore;
      wrist.y = elbow.y + v.y * d.fore;
      raised = { hand: P(wrist.x, wrist.y), v: D(v) };
    }
    const near = lifted || (front ? swing > 0.2 : swing < -0.2);
    const depth = near ? 5 : 2;
    const A = REAR_PART.arms;
    const long = o.sleeves === "long";
    const bare = o.sleeves === "none";
    buf.capsule(P(s0.x, s0.y), P(elbow.x, elbow.y), d.rUpper[0] + 0.4, d.rUpper[1] + 0.3, depth, A, ({ shade, t }) => {
      if (bare) return { mat: M.skin, tone: quantize(shade) };
      if (long) return { mat: M.top, tone: quantize(shade) };
      return { mat: t < 0.5 ? M.top : t < 0.6 ? M.trim : M.skin, tone: quantize(shade) };
    });
    buf.capsule(P(elbow.x, elbow.y), P(wrist.x, wrist.y), d.rFore[0] + 0.3, d.rFore[1] + 0.2, depth, A, ({ shade, t }) => {
      if (long) return { mat: t > 0.82 ? M.trim : M.top, tone: quantize(shade) };
      return { mat: M.skin, tone: quantize(shade) };
    });
    buf.disc(P(wrist.x, wrist.y), o.gloves ? 2 : 1.7, depth + 0.3, A, solid(o.gloves ? M.glove : M.skin));
    if (side === 1) hand = P(wrist.x, wrist.y);
  }

  buf.capsule(P(-2.6, hipY + 0.6), P(2.6, hipY + 0.6), d.rHip - 0.3, d.rHip - 0.3, 4.5, REAR_PART.hips, solid(M.bottom));
  const T = REAR_PART.torso;
  const waist = P(0, hipY + 2.6);
  const chest = P(0, neckY - 4.4);
  const span = waist.y - chest.y;
  const pattern = o.pattern ?? "plain";
  const patch = P(0, lerp(hipY + 2.6, neckY - 4.4, 0.62));
  const jacket: Painter = ({ shade, t, x, y }) => {
    const ox = x + 0.5 - waist.x;
    const up = waist.y - (y + 0.5);
    if (front && Math.abs(ox) < 0.6 && up > 0) return { mat: M.trim, tone: quantize(shade) - 1 };
    if (!front && rider.patch && Math.hypot(x + 0.5 - patch.x, y + 0.5 - patch.y) < 2.7) return { mat: M.accent, tone: quantize(shade) };
    const on = pattern !== "plain" && onPattern(pattern, up, ox, span);
    return { mat: on ? M.pattern : M.top, tone: quantize(shade) - (t < 0.1 ? 1 : 0) };
  };
  buf.capsule(waist, chest, d.rWaist + 1.3, d.rChest + 1.6, 4, T, jacket);
  buf.capsule(P(-sw + 2, shY), P(sw - 2, shY), 2.6, 2.6, 4.02, T, jacket);
  if (o.sleeves !== "none") buf.capsule(P(-1.6, neckY - 0.6), P(1.6, neckY - 0.6), 1.3, 1.3, 4.05, T, solid(M.trim));

  const hc = { x: 0, y: neckY + d.neck + d.headR - 1.6 };
  buf.capsule(P(0, neckY - 1), P(0, neckY + d.neck), 1.9, 1.9, front ? 4.2 : 2.9, REAR_PART.head, solid(M.skin, front ? -1 : 0));
  if (front) drawFrontHead(buf, P, rider, hc);
  else drawBackHead(buf, P, D, rider, hc, 0, 0);

  let anchor: Vec | null = null;
  if (raised) {
    hand = raised.hand;
    if (item)
      anchor = item.draw({
        buf,
        hand,
        // The side rig's convention: 0 = down the screen, 90 = +x.
        angle: (Math.atan2(raised.v.x, raised.v.y) * 180) / Math.PI,
        depth: 5.4,
        part: REAR_PART.item,
        mat: (i) => REAR_SLOTS + i,
      });
  }

  return {
    pixels: buf.resolve(),
    width: f.width * k,
    height: f.height * k,
    origin: { x: f.originX * k, y: f.groundY * k },
    item: anchor && { x: anchor.x * k, y: anchor.y * k },
    hand: { x: hand.x * k, y: hand.y * k },
  };
}
