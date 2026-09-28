/**
 * Poses for a character facing +x. The "arm" is the item arm (near arm for
 * right-handers), "off" the other one. Angles are absolute degrees:
 * 0 = straight down, 90 = forward, 180 = straight up, 270 = backward.
 */
export interface Limb {
  /** Upper segment (upper arm / thigh). */
  a: number;
  /** Lower segment (forearm / shin). */
  b: number;
}

export type Mouth = "neutral" | "open" | "grit";

export interface Pose {
  lean: number;
  /** Head pitch: negative looks up. */
  head: number;
  arm: Limb;
  off: Limb;
  /** Near (front) and far legs, plus toe-down foot angles. */
  legN: Limb;
  legF: Limb;
  footN: number;
  footF: number;
  /** Direction the held item points. */
  item: number;
  /** Pixels above the ground (0 = feet planted). */
  air: number;
  /** Horizontal body shift inside the frame. */
  dx: number;
  mouth: Mouth;
  /** Ponytail / loose hair swing, degrees. */
  sway: number;
}

/** Athletic ready stance, item raised in front. */
export const BASE_POSE: Pose = {
  lean: 14,
  head: 0,
  arm: { a: 50, b: 140 },
  off: { a: 22, b: 72 },
  legN: { a: 28, b: -8 },
  legF: { a: -18, b: -30 },
  footN: 0,
  footF: 14,
  item: 172,
  air: 0,
  dx: 0,
  mouth: "neutral",
  sway: 0,
};

/** Build a pose from overrides on top of a base (default BASE_POSE). */
export const pose = (o: Partial<Pose>, base: Pose = BASE_POSE): Pose => ({ ...base, ...o });

/** General-purpose poses; games add their own action poses with pose(). */
export const POSES = {
  ready: pose({}),
  readyDip: pose({ lean: 16, legN: { a: 32, b: -14 }, legF: { a: -22, b: -38 }, arm: { a: 48, b: 136 }, item: 168, sway: 4 }),
  stand: pose({ lean: 4, legN: { a: 6, b: 0 }, legF: { a: -6, b: -4 }, footF: 0, arm: { a: 15, b: 40 }, item: 60, off: { a: 8, b: 12 } }),
  runA: pose({ lean: 20, legN: { a: 42, b: 18 }, legF: { a: -30, b: -80 }, footN: -8, footF: 40, off: { a: -30, b: 20 }, arm: { a: 60, b: 145 }, sway: -14 }),
  runPass1: pose({ lean: 18, legN: { a: 4, b: -45 }, legF: { a: 18, b: -5 }, footN: 30, footF: 0, off: { a: 5, b: 60 }, arm: { a: 56, b: 138 }, air: 2, sway: -6 }),
  runB: pose({ lean: 20, legN: { a: -30, b: -80 }, legF: { a: 42, b: 18 }, footN: 40, footF: -8, off: { a: 40, b: 110 }, arm: { a: 62, b: 150 }, sway: -14 }),
  runPass2: pose({ lean: 18, legN: { a: 18, b: -5 }, legF: { a: 4, b: -45 }, footN: 0, footF: 30, off: { a: 10, b: 70 }, arm: { a: 58, b: 140 }, air: 2, sway: -6 }),
  crouch: pose({ lean: 26, legN: { a: 55, b: -30 }, legF: { a: 0, b: -62 }, footF: 20, arm: { a: 90, b: 170 }, item: 200, off: { a: 70, b: 120 } }),
  jump: pose({ lean: 6, head: -8, legN: { a: 50, b: -20 }, legF: { a: 10, b: -60 }, footN: 35, footF: 45, arm: { a: 150, b: 170 }, item: 175, off: { a: 140, b: 160 }, air: 14, mouth: "open", sway: -10 }),
  lunge: pose({ lean: 34, head: -6, legN: { a: 78, b: 6 }, legF: { a: -58, b: -82 }, footN: -4, footF: 72, arm: { a: 88, b: 92 }, item: 104, off: { a: 245, b: 225 }, dx: 4, sway: 10 }),
  dive: pose({ lean: 72, head: -20, legN: { a: 95, b: 60 }, legF: { a: -45, b: -95 }, footN: 20, footF: 80, arm: { a: 98, b: 96 }, item: 98, off: { a: 150, b: 150 }, dx: -2, sway: 20 }),
  cheerA: pose({ lean: 0, head: -10, off: { a: 165, b: 182 }, arm: { a: 25, b: 60 }, item: 110, legN: { a: 8, b: 0 }, legF: { a: -8, b: -10 }, mouth: "open" }),
  cheerB: pose({ lean: -4, head: -14, off: { a: 175, b: 188 }, arm: { a: 30, b: 70 }, item: 120, legN: { a: 20, b: -30 }, legF: { a: -5, b: -40 }, footN: 30, footF: 30, air: 4, mouth: "open", sway: -12 }),
  slump: pose({ lean: 22, head: 16, arm: { a: 6, b: 2 }, item: 12, off: { a: 2, b: 0 }, legN: { a: 6, b: 0 }, legF: { a: -6, b: -6 }, footF: 0 }),
} satisfies Record<string, Pose>;

export interface Anim {
  keys: Pose[];
  /** Frames generated between consecutive keys (1 = keys only). */
  steps: number;
  fps: number;
  loop: boolean;
}

export const anim = (keys: Pose[], o: Partial<Omit<Anim, "keys">> = {}): Anim => ({
  keys,
  steps: o.steps ?? 2,
  fps: o.fps ?? 12,
  loop: o.loop ?? false,
});

/** Ready-made loops and one-shots built from POSES. */
export const ANIMS = {
  idle: anim([POSES.ready, POSES.readyDip], { fps: 5, loop: true }),
  run: anim([POSES.runA, POSES.runPass1, POSES.runB, POSES.runPass2], { fps: 14, loop: true }),
  jump: anim([POSES.crouch, POSES.jump, POSES.crouch], { fps: 12 }),
  lunge: anim([POSES.ready, POSES.lunge], { steps: 3, fps: 16 }),
  dive: anim([POSES.ready, POSES.dive], { fps: 14 }),
  cheer: anim([POSES.cheerA, POSES.cheerB], { fps: 6, loop: true }),
  slump: anim([POSES.slump], { steps: 1, fps: 1 }),
} satisfies Record<string, Anim>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLimb = (a: Limb, b: Limb, t: number): Limb => ({ a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) });

export function blend(p: Pose, q: Pose, t: number): Pose {
  return {
    lean: lerp(p.lean, q.lean, t),
    head: lerp(p.head, q.head, t),
    arm: lerpLimb(p.arm, q.arm, t),
    off: lerpLimb(p.off, q.off, t),
    legN: lerpLimb(p.legN, q.legN, t),
    legF: lerpLimb(p.legF, q.legF, t),
    footN: lerp(p.footN, q.footN, t),
    footF: lerp(p.footF, q.footF, t),
    item: lerp(p.item, q.item, t),
    air: lerp(p.air, q.air, t),
    dx: lerp(p.dx, q.dx, t),
    mouth: t < 0.5 ? p.mouth : q.mouth,
    sway: lerp(p.sway, q.sway, t),
  };
}

/** Expand an animation's key poses into its frame poses. */
export function framePoses(a: Anim): Pose[] {
  const keys = a.keys;
  if (keys.length === 1) return [...keys];
  const out: Pose[] = [];
  const segs = a.loop ? keys.length : keys.length - 1;
  for (let i = 0; i < segs; i++) {
    const p = keys[i];
    const q = keys[(i + 1) % keys.length];
    for (let s = 0; s < a.steps; s++) out.push(blend(p, q, s / a.steps));
  }
  if (!a.loop) out.push(keys[keys.length - 1]);
  return out;
}
