import type { HairStyle, Look } from "./look.js";
import { M } from "./palette.js";
import type { Pose } from "./pose.js";
import { lambert, quantize, type PixelBuffer, type Vec } from "./raster.js";

const PART_HEAD = 5;
const D_HEAD = 5;
const D_TAIL = 4.9;
const D_HAIR = 5.2;
const D_BAND = 5.25;
const D_FACE = 5.3;

interface HairShape {
  /** Extra radius over the skull. */
  thick: number;
  /** Front hairline height (head-local y; negative is up). */
  fringe: number;
  /** How low the hair reaches behind the ear. */
  back: number;
  /** Covers the ear and sides (bob, curly). */
  sides: number;
  texture: "strand" | "curl" | "fuzz";
}

const HAIR: Record<HairStyle, HairShape> = {
  buzz: { thick: 0.5, fringe: -2.8, back: 2.2, sides: -1.2, texture: "fuzz" },
  crop: { thick: 1.1, fringe: -2.3, back: 3.2, sides: -0.8, texture: "strand" },
  spiky: {
    thick: 1.2,
    fringe: -2.6,
    back: 3.0,
    sides: -0.8,
    texture: "strand",
  },
  bob: { thick: 1.6, fringe: -1.2, back: 5.8, sides: 4.2, texture: "strand" },
  ponytail: {
    thick: 1.1,
    fringe: -2.0,
    back: 2.6,
    sides: -0.6,
    texture: "strand",
  },
  bun: { thick: 1.1, fringe: -2.1, back: 2.6, sides: -0.6, texture: "strand" },
  curly: { thick: 2.5, fringe: -1.8, back: 4.2, sides: 1.0, texture: "curl" },
};

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 1000;
};

/**
 * Head in 3/4 profile facing +x. `c` is the skull centre in frame pixels.
 * Skull and jaw are shaded volumes; features are placed pixel by pixel.
 */
export function drawHead(buf: PixelBuffer, c: Vec, ap: Look, pose: Pose) {
  const female = ap.gender === "female";
  const R = female ? 5.8 : 6.1;
  const skin =
    (adj = 0) =>
    ({ shade }: { shade: number }) => ({
      mat: M.skin,
      tone: quantize(shade) + adj,
    });

  // Hair behind the head first (ponytail, bun) so the skull overlaps it.
  drawHairBack(buf, c, R, ap, pose);

  buf.disc(c, R, D_HEAD, PART_HEAD, skin());
  // Jaw and chin, pushed forward and down.
  const jawA = { x: c.x + 0.6, y: c.y + 1.2 };
  const jawB = { x: c.x + 2.7, y: c.y + (female ? 4.1 : 4.5) };
  buf.capsule(
    jawA,
    jawB,
    female ? 2.5 : 2.8,
    female ? 2.1 : 2.4,
    D_HEAD,
    PART_HEAD,
    skin(),
  );

  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  const look = pose.head < -8 ? -1 : pose.head > 10 ? 1 : 0;
  const px = (x: number, y: number, mat: number, tone: number) =>
    buf.put(cx + x, cy + y, mat, tone, D_FACE, PART_HEAD);

  // Ear.
  px(-1, 1, M.skin, 1);
  px(-1, 2, M.skin, 1);
  px(-2, 1, M.skin, 2);
  px(-2, 2, M.skin, 1);
  px(-1, 3, M.skin, 0);

  // Nose: one pixel proud of the face.
  const nx = Math.round(R);
  px(nx, 1, M.skin, 3);
  px(nx, 2, M.skin, 2);
  px(nx - 1, 2, M.skin, 1);

  // Eye (pupil forward, white behind it: looking where they face).
  const ey = look;
  if (ap.eyes === "narrow") {
    px(3, ey, M.eye, 2);
    px(2, ey, M.eyeWhite, 2);
    px(2, ey - 1, M.skin, 1);
    px(3, ey - 1, M.skin, 1);
  } else {
    px(3, ey - 1, M.eye, 2);
    px(3, ey, M.eye, 2);
    px(2, ey, M.eyeWhite, 2);
    if (ap.eyes === "round") px(2, ey - 1, M.eyeWhite, 2);
  }
  if (female) px(4, ey - 1, M.eye, 2);
  // Brow in the hair colour.
  for (const x of [2, 3, 4]) px(x, ey - 2, M.hair, x === 2 ? 1 : 0);
  // Cheek shading under the eye.
  px(2, 2, M.skin, 1);

  // Mouth.
  if (pose.mouth === "open") {
    px(4, 4, M.eye, 2);
    px(5, 4, M.eye, 2);
    px(4, 3, M.lip, 1);
    px(5, 5, M.lip, 2);
  } else if (pose.mouth === "grit") {
    px(4, 4, M.eyeWhite, 2);
    px(5, 4, M.eyeWhite, 2);
    px(4, 5, M.lip, 1);
  } else if (female) {
    px(4, 4, M.lip, 1);
    px(5, 4, M.lip, 2);
  } else {
    px(4, 4, M.skin, 0);
    px(5, 4, M.lip, 0);
  }

  if (ap.facialHair === "mustache") {
    px(4, 3, M.hair, 1);
    px(5, 3, M.hair, 1);
  } else if (ap.facialHair === "stubble") {
    for (let y = 3; y <= 6; y++)
      for (let x = 1; x <= 5; x++)
        if ((x + y) % 2 === 0 && buf.matAt(cx + x, cy + y) === M.skin)
          px(x, y, M.hair, 1);
  }

  drawHairFront(buf, c, R, ap);
}

function hairTone(
  shape: HairShape,
  shade: number,
  x: number,
  y: number,
): number {
  // Hair texture is a per-pixel pattern: keep it on the unscaled grid.
  x = Math.floor(x);
  y = Math.floor(y);
  let t = quantize(shade - 0.12);
  if (shape.texture === "strand" && (x + (y >> 1)) % 3 === 0 && t >= 2) t--;
  if (shape.texture === "curl") t += (hash(x, y) % 3) - 1;
  if (shape.texture === "fuzz" && hash(x, y) % 4 === 0) t--;
  return t;
}

function drawHairFront(buf: PixelBuffer, c: Vec, R: number, ap: Look) {
  const shape = HAIR[ap.hair];
  const hc = { x: c.x - 0.5, y: c.y - 0.7 };
  const outer = R + shape.thick;
  const x0 = Math.floor(hc.x - outer - 1);
  const y0 = Math.floor(hc.y - outer - 1);
  for (let y = y0; y <= Math.ceil(c.y + 8); y++) {
    for (let x = x0; x <= Math.ceil(hc.x + outer + 1); x++) {
      const u = x + 0.5 - c.x;
      const v = y + 0.5 - c.y;
      const du = x + 0.5 - hc.x;
      const dv = y + 0.5 - hc.y;
      const d = Math.hypot(du, dv);
      // Long styles fall straight down past the skull outline.
      const drop = shape.sides > 2 && u < 1.5 && v > 0 && Math.abs(du) <= outer;
      if (d > outer && !drop) continue;
      let covered: boolean;
      if (u >= 1.2) covered = v < shape.fringe - (u - 1.2) * 0.35;
      else if (u >= -1.8)
        covered = v < Math.max(shape.sides, shape.fringe + 0.4);
      else covered = v < shape.back;
      // Short styles keep a sideburn in front of the ear.
      if (
        !covered &&
        shape.sides < 0 &&
        u > -0.6 &&
        u < 0.8 &&
        v < 1.4 &&
        ap.gender === "male"
      )
        covered = true;
      if (!covered) continue;
      const nx = du / outer;
      const ny = dv / outer;
      const shade = lambert(
        Math.max(-1, Math.min(1, nx)),
        Math.max(-1, Math.min(1, ny)),
      );
      buf.put(x, y, M.hair, hairTone(shape, shade, x, y), D_HAIR, PART_HEAD);
    }
  }

  if (ap.hair === "spiky") {
    for (const ang of [-150, -120, -90, -60, -35]) {
      const a = (ang * Math.PI) / 180;
      const base = {
        x: hc.x + Math.cos(a) * (outer - 0.8),
        y: hc.y + Math.sin(a) * (outer - 0.8),
      };
      const tipA = a - 0.35;
      const tip = {
        x: base.x + Math.cos(tipA) * 3,
        y: base.y + Math.sin(tipA) * 3,
      };
      buf.capsule(
        base,
        tip,
        1.3,
        0.3,
        D_HAIR,
        PART_HEAD,
        ({ shade, x, y }) => ({
          mat: M.hair,
          tone: hairTone(shape, shade + 0.1, x, y),
        }),
      );
    }
  }

  if (ap.headband) {
    for (let y = Math.floor(c.y - R - 2); y <= c.y + 1; y++) {
      for (let x = Math.floor(c.x - R - 2); x <= c.x + R + 2; x++) {
        const u = x + 0.5 - c.x;
        const v = y + 0.5 - c.y;
        const band = v - u * 0.12;
        const m = buf.matAt(x, y);
        if (band > -3.9 && band < -2.5 && (m === M.hair || m === M.skin)) {
          const shade = lambert(u / (R + 1), v / (R + 1));
          buf.put(x, y, M.accent, quantize(shade), D_BAND, PART_HEAD);
        }
      }
    }
  }
}

function drawHairBack(
  buf: PixelBuffer,
  c: Vec,
  R: number,
  ap: Look,
  pose: Pose,
) {
  const shape = HAIR[ap.hair];
  const paint = ({ shade, x, y }: { shade: number; x: number; y: number }) => ({
    mat: M.hair,
    tone: hairTone(shape, shade, x, y),
  });
  const dirv = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.sin(r), y: Math.cos(r) };
  };
  if (ap.hair === "ponytail") {
    const tie = { x: c.x - R + 0.4, y: c.y - 2.4 };
    const d1 = dirv(292 + pose.sway);
    const mid = { x: tie.x + d1.x * 4.2, y: tie.y + d1.y * 4.2 };
    const d2 = dirv(330 + pose.sway * 1.6);
    const end = { x: mid.x + d2.x * 4.5, y: mid.y + d2.y * 4.5 };
    buf.capsule(tie, mid, 2.0, 1.7, D_TAIL, PART_HEAD, paint);
    buf.capsule(mid, end, 1.7, 0.8, D_TAIL, PART_HEAD, paint);
    buf.disc(tie, 1.2, D_TAIL + 0.01, PART_HEAD, ({ shade }) => ({
      mat: M.accent,
      tone: quantize(shade),
    }));
  } else if (ap.hair === "bun") {
    const bun = { x: c.x - R + 1.2, y: c.y - R + 0.6 };
    buf.disc(bun, 2.6, D_TAIL, PART_HEAD, paint);
  }
}
