import { describe, expect, it } from "vitest";
import {
  ANIMS,
  BODY_SLOTS,
  bodyMaterials,
  DEFAULT_FRAME,
  DEFAULT_LOOK,
  framePoses,
  POSES,
  racket,
  renderAnims,
  renderPose,
  SHIRT_PATTERNS,
  type HeldItem,
  type Look,
  type Outfit,
} from "../src/index.js";

const { width: W, height: H, groundY } = DEFAULT_FRAME;
const alpha = (px: Uint8ClampedArray, x: number, y: number) => px[(y * W + x) * 4 + 3];
function lowestRow(px: Uint8ClampedArray): number {
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (alpha(px, x, y)) return y;
  return -1;
}
const kit = (o: Partial<Outfit>, base: Look = DEFAULT_LOOK): Look => ({ ...base, outfit: { ...base.outfit, ...o } });
const px = (look: Look, pose = POSES.runA, item: HeldItem | null = null) => Array.from(renderPose(look, pose, { item }).pixels);

const KEEPER = kit({ top: "#f2c230", trim: "#1d1d26", sleeves: "long", gloves: "#34c46a", socks: "#f2c230", highSocks: true });
const kits: Look[] = [
  ...SHIRT_PATTERNS.map((pattern) => kit({ pattern, patternColor: "#2d4fd6", socks: "#1d1d26", highSocks: true })),
  KEEPER,
  kit({ pattern: "hoops", sleeves: "long", gloves: "#e53b3b" }, { ...DEFAULT_LOOK, gender: "female", lefty: true, headband: true }),
  kit({ pattern: "stripes", highSocks: true }, { ...DEFAULT_LOOK, build: "stocky", stature: "tall" }),
  kit({ barefoot: true }),
  kit({ barefoot: true, highSocks: true }, { ...DEFAULT_LOOK, gender: "female", stature: "short" }),
  // Basketball: vest, long shorts, crew socks, shooting sleeve; a tall centre.
  kit({ sleeves: "none", bottomStyle: "long", sockHeight: "crew", armSleeve: true }, { ...DEFAULT_LOOK, headband: true }),
  kit({ sleeves: "none", bottomStyle: "long", armSleeve: true }, { ...DEFAULT_LOOK, lefty: true, height: 1.1, build: "slim" }),
];

describe("football kits", () => {
  it("adds pattern and glove material slots", () => {
    expect(BODY_SLOTS).toBe(14);
    expect(bodyMaterials(DEFAULT_LOOK)).toHaveLength(BODY_SLOTS);
    expect(SHIRT_PATTERNS).toEqual(["plain", "stripes", "hoops", "halves", "sash"]);
  });

  it("explicit defaults render exactly like an unset outfit", () => {
    const plain = kit({ pattern: "plain", sleeves: "short", highSocks: false, sockHeight: "ankle", armSleeve: false, socks: "#eceae3", bottomStyle: "shorts" });
    for (const p of [POSES.ready, POSES.runA, POSES.lunge]) expect(px(plain, p, racket())).toEqual(px(DEFAULT_LOOK, p, racket()));
    // highSocks and sockHeight "knee" are the same thing; height 1 is average stature.
    expect(px(kit({ sockHeight: "knee" }))).toEqual(px(kit({ highSocks: true })));
    expect(px({ ...DEFAULT_LOOK, height: 1 })).toEqual(px(DEFAULT_LOOK));
  });

  it("every new option changes pixels", () => {
    const base = px(DEFAULT_LOOK);
    const options: [string, Partial<Outfit>][] = [
      ...SHIRT_PATTERNS.filter((p) => p !== "plain").map((pattern) => [pattern, { pattern }] as [string, Partial<Outfit>]),
      ["socks", { socks: "#1d1d26" }],
      ["highSocks", { highSocks: true }],
      ["sleeves", { sleeves: "long" }],
      ["gloves", { gloves: "#34c46a" }],
      ["barefoot", { barefoot: true }],
      ["sleeveless", { sleeves: "none" }],
      ["long shorts", { bottomStyle: "long" }],
      ["crew socks", { sockHeight: "crew" }],
      ["arm sleeve", { armSleeve: true, accent: "#1d1d26" }],
    ];
    for (const [name, o] of options) expect(px(kit(o)), name).not.toEqual(base);
    // patternColor recolours the pattern (default: trim colour).
    expect(px(kit({ pattern: "hoops", patternColor: "#2d4fd6" }))).not.toEqual(px(kit({ pattern: "hoops" })));
    // Patterns differ from each other.
    const pats = SHIRT_PATTERNS.map((pattern) => JSON.stringify(px(kit({ pattern, patternColor: "#2d4fd6" }))));
    expect(new Set(pats).size).toBe(SHIRT_PATTERNS.length);
  });

  it("bare feet ignore shoe and sock colours", () => {
    const bare = kit({ barefoot: true });
    for (const p of [POSES.ready, POSES.runA, POSES.lunge]) {
      expect(px(kit({ barefoot: true, shoes: "#e53b3b", socks: "#1d1d26", highSocks: true }), p)).toEqual(px(bare, p));
      expect(px(kit({ shoes: "#e53b3b" }), p)).not.toEqual(px(kit({ shoes: "#2d7be0" }), p));
    }
  });

  it("height scales the body", () => {
    const top = (l: Look) => {
      const p = renderPose(l, POSES.stand).pixels;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha(p, x, y)) return y;
      return H;
    };
    expect(top({ ...DEFAULT_LOOK, height: 1.12 })).toBeLessThan(top(DEFAULT_LOOK) - 3);
  });

  it("keeps feet planted in kit looks", () => {
    for (const look of kits) {
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

  it("never clips the frame edges (gloves make hands bigger)", () => {
    for (const look of kits.filter((l) => (l.height ?? 1) <= 1.07)) {
      for (const item of [null, racket()]) {
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

  it("fits very tall looks in a taller frame", () => {
    const frame = { width: W, height: 128, groundY: 124, originX: DEFAULT_FRAME.originX };
    const look = { ...DEFAULT_LOOK, height: 1.15, outfit: { ...DEFAULT_LOOK.outfit, sleeves: "none" as const } };
    for (const [name, frames] of Object.entries(renderAnims(look, ANIMS, { frame }))) {
      frames.forEach((f, i) => {
        for (let x = 0; x < W; x++) expect(f.pixels[x * 4 + 3], `${name}[${i}] top`).toBe(0);
      });
    }
  });

  it("is deterministic and keeps held items working", () => {
    for (const look of kits) {
      const a = renderPose(look, POSES.lunge, { item: racket() });
      const b = renderPose(look, POSES.lunge, { item: racket() });
      expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
      expect(a.item).not.toBeNull();
    }
  });
});
