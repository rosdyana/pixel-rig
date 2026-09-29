import { drawHead } from "./head.js";
import type { Look, ShirtPattern } from "./look.js";
import { BODY_SLOTS, bodyMaterials, M } from "./palette.js";
import { framePoses, type Anim, type Pose } from "./pose.js";
import { PixelBuffer, quantize, type Painter, type Vec } from "./raster.js";
import type { HeldItem } from "./items.js";

/** Canvas size and where the feet land inside it. */
export interface FrameSpec {
  width: number;
  height: number;
  /** Sole line (y) and body origin (x): use as the sprite anchor. */
  groundY: number;
  originX: number;
}

export const DEFAULT_FRAME: FrameSpec = { width: 112, height: 104, groundY: 100, originX: 56 };

export interface Frame {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Anchor point (feet) in frame pixels. */
  origin: Vec;
  /** The held item's anchor (e.g. racket head), or null without an item. */
  item: Vec | null;
  /** The item hand. */
  hand: Vec;
}

export interface RenderOptions {
  item?: HeldItem | null;
  frame?: FrameSpec;
}

interface Dims {
  thigh: number;
  shin: number;
  upper: number;
  fore: number;
  torso: number;
  neck: number;
  headR: number;
  foot: number;
  rThigh: [number, number];
  rShin: [number, number];
  rUpper: [number, number];
  rFore: [number, number];
  rHip: number;
  rWaist: number;
  rChest: number;
}

function dims(ap: Look): Dims {
  const f = ap.gender === "female";
  const hs = ap.height ?? { short: 0.93, average: 1, tall: 1.07 }[ap.stature];
  const bw = { slim: -0.35, athletic: 0, stocky: 0.55 }[ap.build];
  return {
    thigh: (f ? 12.6 : 13.2) * hs,
    shin: (f ? 12.4 : 13) * hs,
    upper: (f ? 9.4 : 10) * hs,
    fore: (f ? 8.6 : 9.2) * hs,
    torso: (f ? 15.4 : 16.6) * hs,
    neck: 2.2,
    headR: f ? 5.8 : 6.1,
    foot: f ? 6.2 : 6.8,
    rThigh: [3.3 + bw + (f ? 0.2 : 0), 2.4 + bw * 0.6],
    rShin: [2.3 + bw * 0.5, 1.6],
    rUpper: [2.1 + bw * 0.5 - (f ? 0.2 : 0), 1.7 + bw * 0.3],
    rFore: [1.75 + bw * 0.3, 1.35],
    rHip: 4.6 + bw + (f ? 0.5 : 0),
    rWaist: 4.1 + bw - (f ? 0.3 : 0),
    rChest: 5.3 + bw - (f ? 0.3 : 0),
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Unit vector for an absolute pose angle (0 = down, 90 = forward). */
export const dir = (deg: number): Vec => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });
export const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Draw-order parts. A nearer part casts a crease onto the one behind it. */
export const PART = { farArm: 1, farLeg: 2, torso: 3, nearLeg: 4, head: 5, nearArm: 6, item: 7 };

interface Rig {
  hip: Vec;
  shoulder: Vec;
  neckBase: Vec;
  head: Vec;
  arm: { elbow: Vec; wrist: Vec; hand: Vec };
  off: { elbow: Vec; wrist: Vec; hand: Vec };
  legN: { hip: Vec; knee: Vec; ankle: Vec; heel: Vec; toe: Vec };
  legF: { hip: Vec; knee: Vec; ankle: Vec; heel: Vec; toe: Vec };
}

function solve(d: Dims, p: Pose): Rig {
  const hip = { x: 0, y: 0 };
  const up = dir(180 - p.lean);
  const neckBase = add(hip, up, d.torso);
  const shoulder = add(hip, up, d.torso - 2.4);
  const head = add(neckBase, dir(180 - p.lean * 0.45 - p.head * 0.3), d.neck + d.headR - 0.8);
  const arm = (limb: Pose["arm"], sx: number) => {
    const s = add(shoulder, { x: sx, y: 0 });
    const elbow = add(s, dir(limb.a), d.upper);
    const wrist = add(elbow, dir(limb.b), d.fore);
    return { elbow, wrist, hand: add(wrist, dir(limb.b), 1.2) };
  };
  const leg = (limb: Pose["legN"], foot: number, hx: number) => {
    const h = add(hip, { x: hx, y: 0 });
    const knee = add(h, dir(limb.a), d.thigh);
    const ankle = add(knee, dir(limb.b), d.shin);
    const fwd = dir(90 - foot);
    const down = dir(-foot);
    return {
      hip: h,
      knee,
      ankle,
      heel: add(add(ankle, fwd, -1.3), down, 1.4),
      toe: add(add(ankle, fwd, d.foot - 1.6), down, 1.4),
    };
  };
  return {
    hip,
    shoulder,
    neckBase,
    head,
    arm: arm(p.arm, 0.6),
    off: arm(p.off, -0.8),
    legN: leg(p.legN, p.footN, 0.7),
    legF: leg(p.legF, p.footF, -0.7),
  };
}

function translate(rig: Rig, dx: number, dy: number): Rig {
  const mv = (v: unknown): unknown => {
    if (v && typeof v === "object" && "x" in v && "y" in v) {
      const p = v as Vec;
      return { x: p.x + dx, y: p.y + dy };
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mv(x)]));
    return v;
  };
  return mv(rig) as Rig;
}

const SHOE_R = 1.75;

/** Draw one pose. Deterministic: same look + pose = same pixels. */
export function renderPose(look: Look, pose: Pose, opts: RenderOptions = {}): Frame {
  const f = opts.frame ?? DEFAULT_FRAME;
  const item = opts.item ?? null;
  const d = dims(look);
  let rig = solve(d, pose);
  const soleY = Math.max(rig.legN.heel.y, rig.legN.toe.y, rig.legF.heel.y, rig.legF.toe.y) + SHOE_R;
  rig = translate(rig, f.originX - 4 + pose.dx, f.groundY - pose.air - soleY);

  const materials = [...bodyMaterials(look), ...(item?.materials(look) ?? [])];
  const buf = new PixelBuffer(f.width, f.height, materials);
  // Lefties hold the item in the far hand.
  const itemNear = !look.lefty;
  const armDepth = itemNear ? 6 : 1;
  const offDepth = itemNear ? 1 : 6;

  drawArm(buf, d, rig.shoulder, rig.off, offDepth, offDepth === 1 ? -1 : 0, look, false);
  drawLeg(buf, d, rig.legF, 2, PART.farLeg, -1, look);
  drawTorso(buf, d, rig, look);
  drawLeg(buf, d, rig.legN, 4, PART.nearLeg, 0, look);
  drawHead(buf, rig.head, look, pose);
  const anchor = item
    ? item.draw({
        buf,
        hand: rig.arm.hand,
        angle: pose.item,
        depth: itemNear ? 6.2 : 3.6,
        part: PART.item,
        mat: (i) => BODY_SLOTS + i,
      })
    : null;
  drawArm(buf, d, rig.shoulder, rig.arm, armDepth, armDepth === 1 ? -1 : 0, look, true);
  return {
    pixels: buf.resolve(),
    width: f.width,
    height: f.height,
    origin: { x: f.originX, y: f.groundY },
    item: anchor,
    hand: rig.arm.hand,
  };
}

function drawLeg(buf: PixelBuffer, d: Dims, leg: Rig["legN"], depth: number, part: number, adj: number, ap: Look) {
  const bottom = ap.outfit.bottomStyle ?? (ap.gender === "female" ? "skort" : "shorts");
  const skort = bottom === "skort";
  const long = bottom === "long";
  // Ankle socks, crew socks to mid-calf, or knee-high football socks reaching just below the knee.
  const bare = !!ap.outfit.barefoot;
  const height = ap.outfit.sockHeight ?? (ap.outfit.highSocks ? "knee" : "ankle");
  const high = !bare && height === "knee";
  const crew = !bare && height === "crew";
  const sockTop = bare ? 2 : high ? 0.12 : crew ? 0.45 : 0.74;
  buf.capsule(leg.hip, leg.knee, d.rThigh[0], d.rThigh[1], depth, part, ({ shade }) => ({
    mat: M.skin,
    tone: quantize(shade) + adj,
  }));
  buf.capsule(leg.knee, leg.ankle, d.rShin[0], d.rShin[1], depth, part, ({ shade, t }) => {
    if (t > sockTop) {
      const stripe = high ? t > 0.14 && t < 0.21 : crew ? t > 0.47 && t < 0.54 : t > 0.76 && t < 0.83;
      return { mat: stripe ? M.accent : M.sock, tone: quantize(shade) + adj };
    }
    return { mat: M.skin, tone: quantize(shade) + adj };
  });
  // Shorts (a slightly flared skort, or baggy knee-length basketball shorts) over the thigh.
  const len = skort ? 0.42 : long ? 0.9 : 0.5;
  const end = add(leg.hip, { x: leg.knee.x - leg.hip.x, y: leg.knee.y - leg.hip.y }, len);
  const flare = skort ? 1.0 : long ? 0.8 : 0.45;
  buf.capsule(leg.hip, end, d.rThigh[0] + 0.5, d.rThigh[0] + flare, depth + 0.05, part, ({ shade, t }) => ({
    mat: M.bottom,
    tone: quantize(shade) + adj - (t > 0.86 ? 1 : 0),
  }));
  if (bare) {
    // A bare foot: a slimmer skin capsule, heel slightly darker.
    buf.capsule(leg.heel, leg.toe, SHOE_R - 0.35, SHOE_R - 0.55, depth + 0.1, part, ({ shade, t }) => ({
      mat: M.skin,
      tone: quantize(shade) + adj - (t < 0.12 ? 1 : 0),
    }));
    return;
  }
  // Shoe: rounded, with sole and an accent swoosh.
  buf.capsule(leg.heel, leg.toe, SHOE_R, SHOE_R - 0.15, depth + 0.1, part, ({ shade, s, t }) => {
    if (s > 0.42) return { mat: M.sole, tone: 2 + adj };
    if (Math.abs(s + 0.05) < 0.3 && t > 0.3 && t < 0.62) return { mat: M.accent, tone: 2 + adj };
    return { mat: M.shoe, tone: quantize(shade) + adj - (t < 0.12 ? 1 : 0) };
  });
}

const mod2 = (n: number) => ((Math.floor(n) % 2) + 2) % 2;

/**
 * Is this torso pixel part of the shirt pattern? `along` is px up the torso axis from the
 * waist, `across` px towards the front (+) from the centre line, `len` the waist→chest span.
 */
function onPattern(p: ShirtPattern, along: number, across: number, len: number): boolean {
  switch (p) {
    case "stripes":
      return mod2((across + 1) / 2) === 1;
    case "hoops":
      return along < len + 1.5 && mod2((along + 5) / 3) === 1;
    case "halves":
      return across > 0.5;
    case "sash":
      return Math.abs(along - len * 0.45 - across * 0.95) < 1.7;
    default:
      return false;
  }
}

function drawTorso(buf: PixelBuffer, d: Dims, rig: Rig, ap: Look) {
  const up = { x: rig.neckBase.x - rig.hip.x, y: rig.neckBase.y - rig.hip.y };
  const len = Math.hypot(up.x, up.y);
  const u = { x: up.x / len, y: up.y / len };
  const fwd = { x: -u.y, y: u.x };
  const T = PART.torso;
  const pelvisTop = add(rig.hip, u, 3.2);
  buf.capsule(rig.hip, pelvisTop, d.rHip, d.rHip - 0.2, 3, T, ({ shade }) => ({ mat: M.bottom, tone: quantize(shade) }));
  // Neck sits under the collar.
  buf.capsule(rig.neckBase, add(rig.head, u, -2), 1.9, 1.9, 3.05, T, ({ shade }) => ({ mat: M.skin, tone: quantize(shade) }));
  const waist = add(rig.hip, u, 2.2);
  const chest = add(rig.hip, u, d.torso - 4.2);
  const pattern = ap.outfit.pattern ?? "plain";
  const span = d.torso - 6.4;
  // Shirt body colour at a pixel: the base top, or the pattern in torso space.
  const shirt = (x: number, y: number): number => {
    if (pattern === "plain") return M.top;
    const ox = x + 0.5 - waist.x;
    const oy = y + 0.5 - waist.y;
    return onPattern(pattern, ox * u.x + oy * u.y, ox * fwd.x + oy * fwd.y, span) ? M.pattern : M.top;
  };
  buf.capsule(waist, chest, d.rWaist, d.rChest, 3.1, T, ({ shade, t, s, x, y }) => {
    if (t > 0.97 && s > -0.5) return { mat: M.trim, tone: quantize(shade) };
    // Side panel stripe in the trim colour.
    if (Math.abs(s - 0.1) < 0.14 && t > 0.08 && t < 0.9) return { mat: M.trim, tone: quantize(shade) - 1 };
    return { mat: shirt(x, y), tone: quantize(shade) - (t < 0.07 ? 1 : 0) };
  });
  // Collar ring around the neck base.
  buf.capsule(add(rig.neckBase, u, -1.2), add(rig.neckBase, fwd, 1.2), 1.3, 1.1, 3.12, T, ({ shade }) => ({
    mat: M.trim,
    tone: quantize(shade),
  }));
  if (ap.gender === "female") {
    buf.disc(add(add(rig.hip, u, d.torso * 0.66), fwd, d.rChest - 1.6), 2.3, 3.11, T, ({ shade, x, y }) => ({
      mat: shirt(x, y),
      tone: quantize(shade),
    }));
  }
}

function drawArm(
  buf: PixelBuffer,
  d: Dims,
  shoulder: Vec,
  arm: Rig["arm"],
  depth: number,
  adj: number,
  ap: Look,
  itemArm: boolean,
) {
  const part = depth > 3 ? PART.nearArm : PART.farArm;
  const o = ap.outfit;
  const long = o.sleeves === "long";
  const bare = o.sleeves === "none";
  const wristband = itemArm && ap.headband;
  // A compression sleeve covers the item arm (under any shirt sleeve).
  const comp = itemArm && !!o.armSleeve && !long;
  const skinP: Painter = ({ shade }) => ({ mat: comp ? M.accent : M.skin, tone: quantize(shade) + adj });
  const topP: Painter = ({ shade }) => ({ mat: M.top, tone: quantize(shade) + adj });
  buf.capsule(shoulder, arm.elbow, d.rUpper[0], d.rUpper[1], depth, part, long ? topP : skinP);
  buf.capsule(arm.elbow, arm.wrist, d.rFore[0], d.rFore[1], depth, part, ({ shade, t }) => {
    if (long) {
      // Long sleeve down to a trim cuff (the wristband sits on the cuff).
      if (t > 0.8) return { mat: wristband ? M.accent : M.trim, tone: quantize(shade) + adj };
      return { mat: M.top, tone: quantize(shade) + adj };
    }
    if (wristband && t > 0.78) return { mat: M.accent, tone: quantize(shade) + adj };
    if (comp && t < 0.88) return { mat: M.accent, tone: quantize(shade) + adj - (t > 0.82 ? 1 : 0) };
    return { mat: M.skin, tone: quantize(shade) + adj };
  });
  if (bare) {
    // Sleeveless: only a trim-edged armhole cap over the shoulder joint.
    const capEnd = add(shoulder, { x: arm.elbow.x - shoulder.x, y: arm.elbow.y - shoulder.y }, 0.14);
    buf.capsule(shoulder, capEnd, d.rUpper[0] + 0.5, d.rUpper[0] + 0.2, depth + 0.05, part, ({ shade, t }) => ({
      mat: t > 0.55 ? M.trim : M.top,
      tone: quantize(shade) + adj,
    }));
  } else {
    // Short sleeve with trim cuff (a plain shoulder over a long sleeve).
    const sleeveEnd = add(shoulder, { x: arm.elbow.x - shoulder.x, y: arm.elbow.y - shoulder.y }, 0.46);
    buf.capsule(shoulder, sleeveEnd, d.rUpper[0] + 0.9, d.rUpper[0] + 0.6, depth + 0.05, part, ({ shade, t }) => ({
      mat: t > 0.78 && !long ? M.trim : M.top,
      tone: quantize(shade) + adj,
    }));
  }
  if (o.gloves) {
    // Padded goalkeeper glove: a bigger disc with a darker cuff side.
    const back = { x: arm.wrist.x - arm.hand.x, y: arm.wrist.y - arm.hand.y };
    const bl = Math.hypot(back.x, back.y) || 1;
    buf.disc(arm.hand, 2.1, depth + 0.3, part, ({ shade, x, y }) => {
      const cuff = ((x + 0.5 - arm.hand.x) * back.x + (y + 0.5 - arm.hand.y) * back.y) / bl > 1.1;
      return { mat: M.glove, tone: quantize(shade) + adj - (cuff ? 1 : 0) };
    });
  } else {
    buf.disc(arm.hand, 1.6, depth + 0.3, part, skinP);
  }
}

export function renderAnim(look: Look, a: Anim, opts?: RenderOptions): Frame[] {
  return framePoses(a).map((p) => renderPose(look, p, opts));
}

/** Render a whole set of animations, e.g. renderAnims(look, ANIMS, { item }). */
export function renderAnims<K extends string>(
  look: Look,
  anims: Record<K, Anim>,
  opts?: RenderOptions,
): Record<K, Frame[]> {
  const out = {} as Record<K, Frame[]>;
  for (const k of Object.keys(anims) as K[]) out[k] = renderAnim(look, anims[k], opts);
  return out;
}
