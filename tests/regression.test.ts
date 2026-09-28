import { describe, expect, it } from "vitest";
import { ANIMS, DEFAULT_LOOK, racket, randomLook, renderAnims, type HeldItem, type Look } from "../src/index.js";

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

/** FNV-1a over every frame's pixels plus the reported anchors. */
function hashAnims(look: Look, item: HeldItem | null): string {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const frames = renderAnims(look, ANIMS, { item });
  for (const k of Object.keys(frames).sort()) {
    for (const f of frames[k as keyof typeof frames]) {
      for (let i = 0; i < f.pixels.length; i++) byte(f.pixels[i]);
      for (const v of [f.hand.x, f.hand.y, f.item?.x ?? -1, f.item?.y ?? -1]) byte(Math.round(v * 16));
    }
  }
  return h.toString(16).padStart(8, "0");
}

const rng = mulberry32(2024);
const cases: [string, Look, HeldItem | null][] = [
  ["default", DEFAULT_LOOK, null],
  ["default+racket", DEFAULT_LOOK, racket()],
  ["random1", randomLook(rng), null],
  ["random2+racket", randomLook(rng), racket()],
  ["random3+racket", randomLook(rng), racket()],
  ["female-lefty-headband+racket", { ...randomLook(rng, { gender: "female" }), lefty: true, headband: true }, racket()],
];

// Pixels are part of the API: looks without the 0.2 kit fields must stay pixel-identical.
const EXPECTED: Record<string, string> = {
  default: "e387b555",
  "default+racket": "f127266a",
  random1: "e8e042cd",
  "random2+racket": "e44e554a",
  "random3+racket": "4b8467be",
  "female-lefty-headband+racket": "c148a770",
};

describe("pixel regression", () => {
  for (const [name, look, item] of cases) {
    it(`${name} renders unchanged`, () => {
      expect(hashAnims(look, item)).toBe(EXPECTED[name]);
    });
  }
});
