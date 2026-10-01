/**
 * Rear-view rig for 2.5D games: a rider on a motorbike seen from behind and slightly
 * above (pseudo-3D racers). Same materials, shading and scale as the side-view rig, so a
 * character keeps its look when it gets off the bike.
 */
import { dims, onPattern, type Frame, type FrameSpec } from "./character.js";
import { ramp } from "./color.js";
import type { HeldItem } from "./items.js";
import { DEFAULT_LOOK, type Look } from "./look.js";
import { BODY_SLOTS, bodyMaterials, flat, M } from "./palette.js";
import { PixelBuffer, quantize, type Material, type Painter, type Vec } from "./raster.js";

export type BikeKind = "underbone" | "scooter" | "standard" | "sport" | "cruiser";

export const BIKE_KINDS: BikeKind[] = ["underbone", "scooter", "standard", "sport", "cruiser"];

/** Everything that decides how a bike is drawn. Plain JSON: safe to save. */
export interface Bike {
  kind: BikeKind;
  /** Bodywork and its stripe / shock-spring colour (hex). */
  body: string;
  accent: string;
  seat?: string;
  /** `racing`: a bigger, raised, chromed can. */
  exhaust?: "stock" | "racing";
  /** Number plate background (default black). */
  plate?: string;
  /** A delivery box on the tail in this colour. */
  cargo?: string;
}

export interface Rider {
  look: Look;
  /** Default `full`. `half` leaves the nape and hair showing, `none` is bare-headed. */
  helmet?: "full" | "half" | "none";
  helmetColor?: string;
  /** Centre stripe on the helmet (default: the outfit accent). */
  helmetTrim?: string;
  /** Emblem on the back of the jacket in the outfit accent colour. */
  patch?: boolean;
  /** Bare lower legs instead of trousers. */
  shorts?: boolean;
}

/**
 * One arm or leg. `hold` 1 keeps the hand on the grip (or the foot on the peg); at 0 the
 * limb follows its angles: 0 = straight down, 90 = out to its own side, 180 = straight up.
 */
export interface RearLimb {
  hold: number;
  a: number;
  b: number;
}

export interface RiderPose {
  /** Bike lean in degrees, positive to the right. Rotates about the tyre contact point. */
  roll: number;
  /** 0 upright to 1 flat on the tank. */
  tuck: number;
  /** Upper body shift off the bike's centre line, px (positive right). */
  shift: number;
  /** Head turn, -1 (left) to 1 (right). */
  head: number;
  /** Handlebar turn, -1 to 1; the front wheel peeks out on that side. */
  steer: number;
  armL: RearLimb;
  armR: RearLimb;
  legL: RearLimb;
  legR: RearLimb;
  /** Direction the held item points, same angle convention as the limbs. */
  item: number;
  /** Which hand holds the item: -1 left, 1 right. */
  itemSide: -1 | 1;
  /** Pixels above the ground. */
  air: number;
  /** Brake light on. */
  brake: boolean;
}

/** Canvas for a bike with rider: room for a kick, a raised weapon and ±25° of lean. */
export const REAR_FRAME: FrameSpec = { width: 128, height: 88, groundY: 84, originX: 64 };

/** Material slots after the body's. Held items append their own after REAR_SLOTS. */
export const RM = {
  body: BODY_SLOTS,
  accent: BODY_SLOTS + 1,
  seat: BODY_SLOTS + 2,
  tyre: BODY_SLOTS + 3,
  metal: BODY_SLOTS + 4,
  dark: BODY_SLOTS + 5,
  lamp: BODY_SLOTS + 6,
  signal: BODY_SLOTS + 7,
  plate: BODY_SLOTS + 8,
  helmet: BODY_SLOTS + 9,
  helmetTrim: BODY_SLOTS + 10,
  visor: BODY_SLOTS + 11,
  glass: BODY_SLOTS + 12,
  cargo: BODY_SLOTS + 13,
} as const;

export const REAR_SLOTS = BODY_SLOTS + 14;

/** Draw-order parts. A nearer part casts a crease onto the one behind it. */
export const REAR_PART = { front: 1, arms: 2, legs: 3, head: 4, torso: 5, hips: 6, wheel: 7, tail: 8, cargo: 9, item: 10 };

/** Proportions per bike kind, in px with the origin at the rear tyre's contact point, y up. */
interface Shape {
  wheelR: number;
  /** Tyre half-width. */
  tyre: number;
  seatY: number;
  seatW: number;
  tailW: number;
  tailH: number;
  tailY: number;
  barY: number;
  barW: number;
  pegY: number;
  pegW: number;
  /** How far the knees sit outside the pegs. */
  knee: number;
  exX: number;
  exY: number;
  exR: number;
  twin: boolean;
  shock: boolean;
  /** Half-width of a leg shield (0 = none) and of a front fairing with screen (0 = none). */
  shield: number;
  cowl: number;
  bags: boolean;
  /** Riding position: the least the rider is tucked on this bike. */
  tuck: number;
}

const SHAPES: Record<BikeKind, Shape> = {
  underbone: { wheelR: 10, tyre: 2.2, seatY: 25, seatW: 5, tailW: 5.4, tailH: 2.5, tailY: 22.5, barY: 36, barW: 12, pegY: 9, pegW: 7.5, knee: 2.2, exX: 6.6, exY: 10, exR: 2, twin: false, shock: true, shield: 7.5, cowl: 0, bags: false, tuck: 0 },
  scooter: { wheelR: 8, tyre: 2.9, seatY: 25, seatW: 6.5, tailW: 7.6, tailH: 3.8, tailY: 20.5, barY: 37, barW: 11.5, pegY: 10, pegW: 5.6, knee: 1.6, exX: 7.8, exY: 8, exR: 2.6, twin: false, shock: false, shield: 10.5, cowl: 0, bags: false, tuck: 0 },
  standard: { wheelR: 11, tyre: 2.7, seatY: 26, seatW: 5.5, tailW: 5, tailH: 2.4, tailY: 24.5, barY: 37, barW: 13, pegY: 10, pegW: 8, knee: 2.4, exX: 7.2, exY: 11, exR: 2.2, twin: false, shock: true, shield: 0, cowl: 0, bags: false, tuck: 0.05 },
  sport: { wheelR: 11, tyre: 3.7, seatY: 27, seatW: 5, tailW: 4.6, tailH: 2.9, tailY: 27.5, barY: 33.5, barW: 11, pegY: 13.5, pegW: 7.2, knee: 2.8, exX: 7, exY: 15, exR: 2.8, twin: false, shock: false, shield: 0, cowl: 12.5, bags: false, tuck: 0.45 },
  cruiser: { wheelR: 11, tyre: 4.6, seatY: 22.5, seatW: 7, tailW: 8, tailH: 3.5, tailY: 20, barY: 36.5, barW: 15.5, pegY: 9, pegW: 10, knee: 1.8, exX: 9.4, exY: 7, exR: 2.6, twin: true, shock: true, shield: 0, cowl: 0, bags: true, tuck: 0 },
};

const HOLD: RearLimb = { hold: 1, a: 20, b: 10 };
const PEG: RearLimb = { hold: 1, a: 40, b: 0 };

export const RIDE_POSE: RiderPose = {
  roll: 0,
  tuck: 0,
  shift: 0,
  head: 0,
  steer: 0,
  armL: HOLD,
  armR: HOLD,
  legL: PEG,
  legR: PEG,
  item: 150,
  itemSide: 1,
  air: 0,
  brake: false,
};

/** Build a pose from overrides on top of a base (default RIDE_POSE). */
export const riderPose = (o: Partial<RiderPose>, base: RiderPose = RIDE_POSE): RiderPose => ({ ...base, ...o });

/** Swap left and right: every action pose below is authored to the right. */
export const mirrorRider = (p: RiderPose): RiderPose => ({
  ...p,
  roll: -p.roll,
  shift: -p.shift,
  head: -p.head,
  steer: -p.steer,
  armL: p.armR,
  armR: p.armL,
  legL: p.legR,
  legR: p.legL,
  itemSide: p.itemSide === 1 ? -1 : 1,
});

/** Riding and fighting poses, all to the rider's right; mirrorRider() gives the left. */
export const RIDER_POSES = {
  ride: RIDE_POSE,
  tuck: riderPose({ tuck: 1 }),
  brake: riderPose({ brake: true, tuck: 0 }),
  punchWind: riderPose({ armR: { hold: 0, a: 35, b: 150 }, head: 0.5, shift: -0.5 }),
  punch: riderPose({ armR: { hold: 0, a: 86, b: 92 }, head: 1, shift: 2 }),
  kickWind: riderPose({ legR: { hold: 0, a: 70, b: -20 }, head: 0.5, shift: -1.5 }),
  kick: riderPose({ legR: { hold: 0, a: 82, b: 86 }, head: 0.8, shift: -3 }),
  swingWind: riderPose({ armR: { hold: 0, a: 150, b: 185 }, item: 205, head: 0.5, shift: -1 }),
  swing: riderPose({ armR: { hold: 0, a: 80, b: 95 }, item: 100, head: 1, shift: 2 }),
  /** Struck from the right: thrown left, bars half let go. */
  hit: riderPose({ armR: { hold: 0.4, a: 60, b: 30 }, head: -0.8, shift: -5, roll: -6 }),
  footDown: riderPose({ legR: { hold: 0, a: 38, b: 8 } }),
  cheer: riderPose({ armR: { hold: 0, a: 165, b: 178 }, item: 180 }),
} satisfies Record<string, RiderPose>;

export interface RiderAnim {
  keys: RiderPose[];
  /** Frames generated between consecutive keys (1 = keys only). */
  steps: number;
  fps: number;
  loop: boolean;
}

export const riderAnim = (keys: RiderPose[], o: Partial<Omit<RiderAnim, "keys">> = {}): RiderAnim => ({
  keys,
  steps: o.steps ?? 2,
  fps: o.fps ?? 14,
  loop: o.loop ?? false,
});

const P_ = RIDER_POSES;

export const RIDER_ANIMS = {
  ride: riderAnim([P_.ride], { steps: 1, fps: 1 }),
  punch: riderAnim([P_.ride, P_.punchWind, P_.punch, P_.ride], { fps: 18 }),
  kick: riderAnim([P_.ride, P_.kickWind, P_.kick, P_.ride], { fps: 16 }),
  swing: riderAnim([P_.ride, P_.swingWind, P_.swing, P_.ride], { fps: 18 }),
  hit: riderAnim([P_.ride, P_.hit, P_.ride], { fps: 12 }),
  cheer: riderAnim([P_.ride, P_.cheer], { fps: 6, loop: true }),
} satisfies Record<string, RiderAnim>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const lerpLimb = (a: RearLimb, b: RearLimb, t: number): RearLimb => ({
  hold: lerp(a.hold, b.hold, t),
  a: lerp(a.a, b.a, t),
  b: lerp(a.b, b.b, t),
});
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function blendRider(p: RiderPose, q: RiderPose, t: number): RiderPose {
  return {
    roll: lerp(p.roll, q.roll, t),
    tuck: lerp(p.tuck, q.tuck, t),
    shift: lerp(p.shift, q.shift, t),
    head: lerp(p.head, q.head, t),
    steer: lerp(p.steer, q.steer, t),
    armL: lerpLimb(p.armL, q.armL, t),
    armR: lerpLimb(p.armR, q.armR, t),
    legL: lerpLimb(p.legL, q.legL, t),
    legR: lerpLimb(p.legR, q.legR, t),
    item: lerp(p.item, q.item, t),
    itemSide: t < 0.5 ? p.itemSide : q.itemSide,
    air: lerp(p.air, q.air, t),
    brake: t < 0.5 ? p.brake : q.brake,
  };
}

/** Expand an animation's key poses into its frame poses. */
export function riderFramePoses(a: RiderAnim): RiderPose[] {
  const keys = a.keys;
  if (keys.length === 1) return [...keys];
  const out: RiderPose[] = [];
  const segs = a.loop ? keys.length : keys.length - 1;
  for (let i = 0; i < segs; i++) {
    const p = keys[i];
    const q = keys[(i + 1) % keys.length];
    for (let s = 0; s < a.steps; s++) out.push(blendRider(p, q, s / a.steps));
  }
  if (!a.loop) out.push(keys[keys.length - 1]);
  return out;
}

export interface RearOptions {
  item?: HeldItem | null;
  frame?: FrameSpec;
  /** Pixels per rig unit (default 1): see RenderOptions.scale. */
  scale?: number;
}

export function rearMaterials(bike: Bike, rider: Rider | null): Material[] {
  const m = (hex: string): Material => ({ ramp: ramp(hex), outline: true });
  return [
    m(bike.body),
    m(bike.accent),
    m(bike.seat ?? "#2a2630"),
    m("#34333d"),
    m("#b9bcc8"),
    m("#3d3b47"),
    m("#e0262c"),
    { ramp: flat("#f2a23a"), outline: true },
    m(bike.plate ?? "#1d1d26"),
    m(rider?.helmetColor ?? "#e9e6dd"),
    m(rider?.helmetTrim ?? rider?.look.outfit.accent ?? "#d8262f"),
    m("#262a3a"),
    m("#9fc4d8"),
    m(bike.cargo ?? "#2f9e44"),
  ];
}

const solid =
  (mat: number, off = 0): Painter =>
  ({ shade }) => ({ mat, tone: quantize(shade) + off });

const tyre =
  (off = 0): Painter =>
  ({ shade, t, s }) => ({
    mat: RM.tyre,
    tone: quantize(shade) + off - (Math.abs(s) < 0.7 && Math.floor(t * 9) % 2 === 0 ? 1 : 0),
  });

/** Local (origin at the tyre contact, y up) to frame pixels. */
export type Place = (x: number, y: number) => Vec;

/** Where the grips are for a handlebar turn, local coordinates. */
function grips(sh: Shape, steer: number): [Vec, Vec] {
  // Turning right swings the left grip away from the camera (up the screen).
  const tilt = steer * 1.6;
  return [
    { x: -sh.barW + Math.abs(steer) * 1.2, y: sh.barY + tilt },
    { x: sh.barW - Math.abs(steer) * 1.2, y: sh.barY - tilt },
  ];
}

function drawBike(buf: PixelBuffer, P: Place, sh: Shape, bike: Bike, pose: RiderPose) {
  const { front: F, wheel: W, tail: T } = REAR_PART;
  const top = 2 * sh.wheelR;

  // Front wheel and mudguard, hidden behind the rear wheel until the bars turn.
  const fx = pose.steer * 4.5;
  const fr = sh.tyre * 0.8;
  buf.capsule(P(fx, fr), P(fx, top - 3), fr, fr, 0.3, F, tyre(-1));
  buf.capsule(P(fx, top - 3), P(fx, top), fr + 0.8, fr + 0.8, 0.35, F, solid(RM.body, -1));

  // Steering stem, then a tank or (on step-through bikes) the headlamp nacelle.
  buf.capsule(P(0, sh.wheelR + 4), P(0, sh.barY), 1.6, 1.6, 0.7, F, solid(RM.dark));
  if (sh.shield) buf.capsule(P(-3.6, sh.barY), P(3.6, sh.barY), 2.4, 2.4, 0.95, F, solid(RM.body, -1));
  else buf.capsule(P(0, sh.seatY + 1), P(0, sh.seatY + 5), 4.4, 3.8, 0.85, F, solid(RM.body));

  if (sh.shield) {
    buf.box(P(0, sh.wheelR + 3), P(0, sh.barY - 5), sh.shield, 0.8, F, ({ shade, s }) => ({
      mat: Math.abs(s) > 0.82 ? RM.accent : RM.body,
      tone: quantize(shade) - 1,
    }));
  }
  if (sh.cowl) {
    buf.capsule(P(-sh.cowl + 3.2, sh.barY + 0.5), P(sh.cowl - 3.2, sh.barY + 0.5), 3.2, 3.2, 0.5, F, solid(RM.body, -1));
    buf.disc(P(0, sh.barY + 4.5), 4.6, 0.45, F, solid(RM.visor, 1));
  }

  const [gl, gr] = grips(sh, pose.steer);
  buf.capsule(P(gl.x, gl.y), P(gr.x, gr.y), 0.9, 0.9, 1, F, solid(RM.metal));
  buf.capsule(P(gl.x, gl.y), P(gl.x + 2.4, gl.y), 1.25, 1.25, 1.1, F, solid(RM.dark, -1));
  buf.capsule(P(gr.x - 2.4, gr.y), P(gr.x, gr.y), 1.25, 1.25, 1.1, F, solid(RM.dark, -1));
  for (const [side, g] of [
    [-1, gl],
    [1, gr],
  ] as const) {
    // Mirrors sit on bar stalks, or on the fairing of a faired bike.
    const base = sh.cowl ? { x: side * (sh.cowl - 2.5), y: sh.barY + 2 } : { x: g.x - side * 3.2, y: g.y };
    const head = sh.cowl ? { x: side * (sh.cowl + 1), y: sh.barY + 5 } : { x: g.x - side * 0.6, y: g.y + 6.5 };
    buf.capsule(P(base.x, base.y), P(head.x, head.y), 0.6, 0.6, 0.9, F, solid(RM.dark));
    buf.capsule(P(head.x - 1.1, head.y), P(head.x + 1.1, head.y), 1.9, 1.9, 0.95, F, ({ shade, y }) => ({
      mat: shade > 0.1 ? RM.glass : RM.dark,
      tone: quantize(shade) + (Math.floor(y) % 2 ? 0 : 1),
    }));
  }

  // Engine block and foot pegs.
  buf.box(P(-(sh.pegW - 1.5), sh.wheelR + 1.5), P(sh.pegW - 1.5, sh.wheelR + 1.5), 3.4, 1.5, F, solid(RM.dark));
  buf.capsule(P(-sh.pegW - 1.2, sh.pegY), P(sh.pegW + 1.2, sh.pegY), 0.8, 0.8, 1.6, F, solid(RM.metal, -1));

  // Rear wheel, axle, shocks.
  buf.capsule(P(-sh.tyre - 2.4, sh.wheelR), P(sh.tyre + 2.4, sh.wheelR), 1.1, 1.1, 4.8, W, solid(RM.metal, -1));
  buf.capsule(P(0, sh.tyre), P(0, top - sh.tyre), sh.tyre, sh.tyre, 5, W, tyre());
  // Chain guard on the left of the wheel, brake disc on the right.
  buf.box(P(-(sh.tyre + 1.7), sh.wheelR - 2.5), P(-(sh.tyre + 1.7), sh.wheelR + 4.5), 0.9, 4.7, W, solid(RM.dark));
  buf.disc(P(sh.tyre + 1.5, sh.wheelR), 2.3, 4.75, W, ({ shade }) => ({ mat: RM.metal, tone: shade > 0.2 ? 4 : 2 }));
  buf.disc(P(sh.tyre + 1.5, sh.wheelR), 0.9, 4.76, W, () => ({ mat: RM.dark, tone: 1 }));
  if (sh.shock) {
    for (const side of [-1, 1]) {
      buf.capsule(P(side * (sh.tyre + 2.2), sh.wheelR + 0.5), P(side * (sh.tailW - 0.8), sh.tailY - 0.5), 0.9, 0.9, 4.6, W, ({ t }) => ({
        mat: t > 0.25 && t < 0.85 ? RM.accent : RM.metal,
        tone: 2,
      }));
    }
  }

  // Exhaust: seen end-on.
  const racing = bike.exhaust === "racing";
  const er = sh.exR + (racing ? 0.8 : 0);
  const ey = sh.exY + (racing ? 3 : 0);
  for (const side of sh.twin ? [-1, 1] : [1]) {
    const c = P(side * sh.exX, ey);
    buf.disc(c, er, 5.6, T, solid(RM.metal, racing ? 0 : -1));
    buf.disc(c, er - 1.1, 5.7, T, () => ({ mat: RM.dark, tone: 0 }));
  }

  // Mudguard, plate, tail unit, lamps.
  buf.capsule(P(0, top - 2.5), P(0, sh.tailY), sh.tyre + 1.1, sh.tyre + 1.4, 5.5, T, solid(RM.dark));
  const plateY = sh.tailY - sh.tailH - 2.4;
  // Lettering is a broken line in the plate's own lightest or darkest tone.
  const [pr, pg, pb] = buf.materials[RM.plate].ramp[2];
  const ink = pr * 0.3 + pg * 0.59 + pb * 0.11 < 128 ? 4 : 0;
  buf.box(P(-3.6, plateY), P(3.6, plateY), 1.9, 6.3, T, ({ t, s }) => {
    const col = Math.floor(t * 7);
    return { mat: RM.plate, tone: Math.abs(s) < 0.3 && col !== 0 && col !== 3 && col !== 6 ? ink : 2 };
  });
  if (sh.bags) {
    for (const side of [-1, 1]) {
      const x = side * (sh.tailW + 3);
      buf.box(P(x, sh.tailY - 6.5), P(x, sh.tailY + 0.5), 2.8, 5.8, T, ({ shade, t }) => ({
        mat: RM.seat,
        tone: quantize(shade) + (t > 0.8 ? 1 : 0),
      }));
    }
  }
  buf.capsule(P(-(sh.seatW - 2.2), sh.seatY - 1.2), P(sh.seatW - 2.2, sh.seatY - 1.2), 2.2, 2.2, 5.2, T, solid(RM.seat));
  // A grab rail behind the seat on everything but the sport bike.
  if (!sh.cowl) buf.capsule(P(-sh.seatW + 0.5, sh.seatY + 0.4), P(sh.seatW - 0.5, sh.seatY + 0.4), 0.6, 0.6, 5.25, T, solid(RM.metal, 1));
  buf.capsule(P(-(sh.tailW - sh.tailH), sh.tailY), P(sh.tailW - sh.tailH, sh.tailY), sh.tailH, sh.tailH, 6, T, ({ shade, s }) => ({
    mat: s > 0.45 ? RM.accent : RM.body,
    tone: quantize(shade),
  }));
  for (const side of [-1, 1]) buf.disc(P(side * (sh.tailW + 1), sh.tailY + 0.2), 1.15, 6.1, T, () => ({ mat: RM.signal, tone: 2 }));
  const lw = pose.brake ? 2.9 : 2.2;
  buf.box(P(-lw, sh.tailY + 0.4), P(lw, sh.tailY + 0.4), 1.3, 6.2, T, ({ s }) => ({
    mat: RM.lamp,
    tone: pose.brake ? 4 : Math.abs(s) < 0.5 ? 3 : 2,
  }));

  if (bike.cargo) {
    buf.box(P(0, sh.seatY + 0.5), P(0, sh.seatY + 12.5), 7.5, 6.6, REAR_PART.cargo, ({ shade, t, s }) => ({
      mat: RM.cargo,
      tone: quantize(shade) + (t > 0.86 ? 1 : 0) - (Math.abs(s) > 0.88 ? 1 : 0),
    }));
  }
}

/** Unit vector in local space for a limb angle on one side (-1 left, 1 right). */
const limbDir = (side: number, deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: side * Math.sin(r), y: -Math.cos(r) };
};

/**
 * The back of a head (helmet, half helmet or hair) centred on `hc`, local coordinates.
 * Shared with the on-foot rig.
 */
export function drawBackHead(buf: PixelBuffer, P: Place, D: (v: Vec) => Vec, rider: Rider, hc: Vec, turn: number, roll: number) {
  const look = rider.look;
  const d = dims(look);
  const H = REAR_PART.head;
  const up = D({ x: 0, y: 1 });
  const right = D({ x: 1, y: 0 });
  const C = P(hc.x, hc.y);
  /** Pixel position relative to the head centre, in the rolled frame: [across, up]. */
  const rel = (x: number, y: number): [number, number] => {
    const px = x + 0.5 - C.x;
    const py = y + 0.5 - C.y;
    return [px * right.x + py * right.y, px * up.x + py * up.y];
  };
  const helmet = rider.helmet ?? "full";
  if (helmet === "full") {
    const r = d.headR + 1.5;
    buf.capsule(P(hc.x, hc.y - 1.4), P(hc.x, hc.y + 0.8), r, r, 3, H, ({ shade, x, y }) => {
      const [ac, v] = rel(x, y);
      if (turn && ac * Math.sign(turn) > r - 0.6 - Math.abs(turn) * 2.6 && v > -1.5 && v < 2.6) return { mat: RM.visor, tone: v > 1.4 ? 3 : 2 };
      if (v < -r + 0.2) return { mat: RM.dark, tone: 1 };
      if (Math.abs(ac + turn * 1.5) < 1.15) return { mat: RM.helmetTrim, tone: quantize(shade) };
      return { mat: RM.helmet, tone: quantize(shade) };
    });
  } else {
    const r = d.headR;
    const big = helmet === "none" && look.hair === "curly" ? 1.1 : 0;
    buf.disc(C, r + big, 3, H, ({ shade, x, y }) => {
      const v = rel(x, y)[1];
      const nape = look.hair === "buzz" ? -r * 0.35 : -r * 0.6;
      if (v < nape) return { mat: M.skin, tone: quantize(shade) };
      return { mat: M.hair, tone: quantize(shade) };
    });
    for (const side of [-1, 1]) buf.disc(P(hc.x + side * (r - 0.2), hc.y - 0.8), 1.3, 2.95, H, solid(M.skin, -1));
    if (look.hair === "ponytail") {
      buf.capsule(P(hc.x, hc.y - 2), P(hc.x - roll * 0.08, hc.y - 10), 1.7, 1.1, 4.2, H, solid(M.hair));
    } else if (look.hair === "bob") {
      buf.capsule(P(hc.x - 3.2, hc.y - 3.2), P(hc.x + 3.2, hc.y - 3.2), 3.2, 3.2, 3.05, H, solid(M.hair));
    }
    if (helmet === "none") {
      if (look.hair === "bun") buf.disc(P(hc.x, hc.y + r), 2.4, 3.05, H, solid(M.hair));
      if (look.hair === "spiky") {
        for (const k of [-1, 0, 1]) buf.capsule(P(hc.x + k * 2.6, hc.y + r - 1.5), P(hc.x + k * 3.6, hc.y + r + 1.6), 1.2, 0.5, 3.05, H, solid(M.hair));
      }
    } else {
      const rr = r + 1.2;
      buf.disc(C, rr, 3.1, H, ({ shade, x, y }) => {
        const [ac, v] = rel(x, y);
        if (v < -1.2) return null;
        if (v < -0.1) return { mat: RM.dark, tone: 1 };
        if (Math.abs(ac + turn * 1.5) < 1.15) return { mat: RM.helmetTrim, tone: quantize(shade) };
        return { mat: RM.helmet, tone: quantize(shade) };
      });
    }
  }
}

function drawRider(
  buf: PixelBuffer,
  P: Place,
  /** Rotates a local direction into frame space. */
  D: (v: Vec) => Vec,
  sh: Shape,
  rider: Rider,
  pose: RiderPose,
  item: HeldItem | null,
): { hand: Vec; anchor: Vec | null } {
  const look = rider.look;
  const o = look.outfit;
  const d = dims(look);
  const tuck = clamp01(sh.tuck + pose.tuck * (1 - sh.tuck));
  const torso = d.torso * (0.92 - 0.4 * tuck);
  const hx = pose.shift * 0.35;
  const hy = sh.seatY + 2.4;
  const cx = pose.shift;
  const neckY = hy + torso;
  const sw = d.rChest + 1.7;
  const shY = neckY - 2.4;
  const right = D({ x: 1, y: 0 });

  // Legs first: they are the farthest part of the rider from the camera.
  for (const side of [-1, 1]) {
    const limb = side < 0 ? pose.legL : pose.legR;
    const h = clamp01(limb.hold);
    const hip = { x: hx + side * 3.4, y: hy - 0.6 };
    const v1 = limbDir(side, limb.a);
    const v2 = limbDir(side, limb.b);
    const freeK = { x: hip.x + v1.x * d.thigh * 0.92, y: hip.y + v1.y * d.thigh * 0.92 };
    const freeA = { x: freeK.x + v2.x * d.shin, y: freeK.y + v2.y * d.shin };
    const K = lerpV(freeK, { x: side * (sh.pegW + sh.knee), y: sh.seatY - 3.5 }, h);
    const A = lerpV(freeA, { x: side * sh.pegW, y: sh.pegY + 3 }, h);
    const len = Math.hypot(A.x - K.x, A.y - K.y) || 1;
    const toe = { x: A.x + ((A.x - K.x) / len) * 2.6, y: A.y + ((A.y - K.y) / len) * 2.6 };
    const L = REAR_PART.legs;
    buf.capsule(P(hip.x, hip.y), P(K.x, K.y), d.rThigh[0], d.rThigh[1] + 0.3, 2.5, L, ({ shade, t }) => ({
      mat: rider.shorts && t > 0.78 ? M.skin : M.bottom,
      tone: quantize(shade),
    }));
    buf.capsule(P(K.x, K.y), P(A.x, A.y), d.rShin[0] + 0.3, d.rShin[1] + 0.2, 2.5, L, ({ shade, t }) => ({
      mat: rider.shorts ? M.skin : M.bottom,
      tone: quantize(shade) - (!rider.shorts && t > 0.9 ? 1 : 0),
    }));
    buf.capsule(P(A.x, A.y), P(toe.x, toe.y), 1.9, 1.8, 2.6, L, ({ shade, t }) => {
      if (t > 0.72) return { mat: M.sole, tone: 2 };
      return { mat: o.barefoot ? M.skin : M.shoe, tone: quantize(shade) };
    });
  }

  // Arms.
  const [gl, gr] = grips(sh, pose.steer);
  let hand: Vec = { x: 0, y: 0 };
  let handDir: Vec = { x: 0, y: -1 };
  for (const side of [-1, 1]) {
    const limb = side < 0 ? pose.armL : pose.armR;
    const h = clamp01(limb.hold);
    const g = side < 0 ? gl : gr;
    const s0 = { x: cx + side * sw, y: shY };
    const v1 = limbDir(side, limb.a);
    const v2 = limbDir(side, limb.b);
    const freeE = { x: s0.x + v1.x * d.upper, y: s0.y + v1.y * d.upper };
    const freeW = { x: freeE.x + v2.x * d.fore, y: freeE.y + v2.y * d.fore };
    const E = lerpV(freeE, { x: (s0.x + g.x) / 2 + side * 3.2, y: (s0.y + g.y) / 2 - 2.6 }, h);
    const Wr = lerpV(freeW, g, h);
    const len = Math.hypot(Wr.x - E.x, Wr.y - E.y) || 1;
    const fwd = { x: (Wr.x - E.x) / len, y: (Wr.y - E.y) / len };
    const fist = { x: Wr.x + fwd.x * 1.2, y: Wr.y + fwd.y * 1.2 };
    const A = REAR_PART.arms;
    const long = o.sleeves === "long";
    const bare = o.sleeves === "none";
    buf.capsule(P(s0.x, s0.y), P(E.x, E.y), d.rUpper[0] + 0.4, d.rUpper[1] + 0.3, 2, A, ({ shade, t }) => {
      if (bare) return { mat: M.skin, tone: quantize(shade) };
      if (long) return { mat: M.top, tone: quantize(shade) };
      return { mat: t < 0.5 ? M.top : t < 0.6 ? M.trim : M.skin, tone: quantize(shade) };
    });
    buf.capsule(P(E.x, E.y), P(Wr.x, Wr.y), d.rFore[0] + 0.3, d.rFore[1] + 0.2, 2, A, ({ shade, t }) => {
      if (long) return { mat: t > 0.82 ? M.trim : M.top, tone: quantize(shade) };
      return { mat: M.skin, tone: quantize(shade) };
    });
    buf.disc(P(fist.x, fist.y), o.gloves ? 2 : 1.7, 2.3, A, solid(o.gloves ? M.glove : M.skin));
    if (side === pose.itemSide) {
      hand = P(fist.x, fist.y);
      handDir = limbDir(side, pose.item);
    }
  }

  // Hips, then the back and shoulders.
  buf.capsule(P(hx - 2.6, hy), P(hx + 2.6, hy), d.rHip - 0.3, d.rHip - 0.3, 4.5, REAR_PART.hips, solid(M.bottom));
  const T = REAR_PART.torso;
  const waist = P(hx, hy + 2);
  const chest = P(cx, neckY - 4.4);
  const axis = { x: chest.x - waist.x, y: chest.y - waist.y };
  const span = Math.hypot(axis.x, axis.y) || 1;
  const u = { x: axis.x / span, y: axis.y / span };
  const pattern = o.pattern ?? "plain";
  const patchC = P(lerp(hx, cx, 0.62), lerp(hy + 2, neckY - 4.4, 0.62));
  const jacket: Painter = ({ shade, t, x, y }) => {
    const ox = x + 0.5 - waist.x;
    const oy = y + 0.5 - waist.y;
    if (rider.patch && Math.hypot(x + 0.5 - patchC.x, y + 0.5 - patchC.y) < 2.7) return { mat: M.accent, tone: quantize(shade) };
    const on = pattern !== "plain" && onPattern(pattern, ox * u.x + oy * u.y, ox * right.x + oy * right.y, span);
    // A hem band, and a seam down the spine under any patch.
    if (t < 0.12 && o.sleeves === "long") return { mat: M.trim, tone: quantize(shade) - 1 };
    const across = ox * right.x + oy * right.y;
    if (!on && Math.abs(across) < 0.5 && t > 0.14 && t < 0.5) return { mat: M.top, tone: quantize(shade) - 1 };
    return { mat: on ? M.pattern : M.top, tone: quantize(shade) - (t < 0.1 ? 1 : 0) };
  };
  buf.capsule(waist, chest, d.rWaist + 1.3, d.rChest + 1.6, 4, T, jacket);
  buf.capsule(P(cx - sw + 2, shY), P(cx + sw - 2, shY), 2.6, 2.6, 4.02, T, jacket);
  if (o.sleeves !== "none") buf.capsule(P(cx - 1.6, neckY - 0.6), P(cx + 1.6, neckY - 0.6), 1.3, 1.3, 4.05, T, solid(M.trim));

  // Neck and head.
  const hc = { x: cx + pose.head * 1.3, y: neckY + d.neck + d.headR - 1.6 - tuck * 2.5 };
  const H = REAR_PART.head;
  buf.capsule(P(cx, neckY - 1), P(lerp(cx, hc.x, 0.5), neckY + d.neck), 1.9, 1.9, 2.9, H, solid(M.skin));
  drawBackHead(buf, P, D, rider, hc, pose.head, pose.roll);

  let anchor: Vec | null = null;
  if (item) {
    const v = D(handDir);
    anchor = item.draw({
      buf,
      hand,
      // Back into the side rig's convention: 0 = down the screen, 90 = +x.
      angle: (Math.atan2(v.x, v.y) * 180) / Math.PI,
      depth: 2.4,
      part: REAR_PART.item,
      mat: (i) => REAR_SLOTS + i,
    });
  }
  return { hand, anchor };
}

/**
 * Draw a bike from behind, with its rider (or `null` for a parked or riderless bike).
 * Deterministic: same rider + bike + pose = same pixels. `frame.origin` is the rear tyre's
 * contact point; a roll of ±85 lays the bike on its side.
 */
export function renderRider(rider: Rider | null, bike: Bike, pose: RiderPose = RIDE_POSE, opts: RearOptions = {}): Frame {
  const f = opts.frame ?? REAR_FRAME;
  const item = rider ? (opts.item ?? null) : null;
  const look = rider?.look ?? DEFAULT_LOOK;
  const sh = SHAPES[bike.kind];
  const materials = [...bodyMaterials(look), ...rearMaterials(bike, rider), ...(item?.materials(look) ?? [])];
  const k = opts.scale ?? 1;
  const buf = new PixelBuffer(f.width * k, f.height * k, materials, k);
  const th = (pose.roll * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const D = (v: Vec): Vec => ({ x: v.x * c + v.y * s, y: v.x * s - v.y * c });
  const P: Place = (x, y) => ({ x: f.originX + x * c + y * s, y: f.groundY - pose.air + x * s - y * c });

  drawBike(buf, P, sh, bike, pose);
  const drawn = rider ? drawRider(buf, P, D, sh, rider, pose, item) : { hand: P(sh.barW, sh.barY), anchor: null };
  return {
    pixels: buf.resolve(),
    width: f.width * k,
    height: f.height * k,
    origin: { x: f.originX * k, y: f.groundY * k },
    item: drawn.anchor && { x: drawn.anchor.x * k, y: drawn.anchor.y * k },
    hand: { x: drawn.hand.x * k, y: drawn.hand.y * k },
  };
}

export function renderRiderAnim(rider: Rider | null, bike: Bike, a: RiderAnim, opts?: RearOptions): Frame[] {
  return riderFramePoses(a).map((p) => renderRider(rider, bike, p, opts));
}
