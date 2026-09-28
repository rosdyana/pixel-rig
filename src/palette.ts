import { hexToRgb, hslToRgb, mix, ramp, rgbToHsl, type RGB } from "./color";
import type { Look } from "./look";
import type { Material } from "./raster";

/** Body material slots. Held items append their own after BODY_SLOTS. */
export const M = {
  skin: 0,
  top: 1,
  trim: 2,
  bottom: 3,
  sock: 4,
  shoe: 5,
  sole: 6,
  accent: 7,
  hair: 8,
  eyeWhite: 9,
  eye: 10,
  lip: 11,
  /** Shirt pattern (stripes, hoops, …); defaults to the trim colour. */
  pattern: 12,
  /** Goalkeeper gloves. */
  glove: 13,
} as const;

export const BODY_SLOTS = 14;

export const flat = (hex: string): RGB[] => {
  const c = hexToRgb(hex);
  return [c, c, c, c, c];
};

/** Skin stays warm in shadow (a cool shift turns it grey or sickly). */
export function skinRamp(hex: string): RGB[] {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return [
    hslToRgb(h - 6, Math.min(0.58, s * 0.75 + 0.06), l * 0.62),
    hslToRgb(h - 3, Math.min(0.64, s * 0.85 + 0.03), l * 0.82),
    hexToRgb(hex),
    hslToRgb(h + 3, s * 0.95, l + (1 - l) * 0.25),
    hslToRgb(h + 6, s * 0.85, l + (1 - l) * 0.5),
  ];
}

function lipColor(skin: string): string {
  const [h, s, l] = rgbToHsl(hexToRgb(skin));
  const [r, g, b] = hslToRgb(h - 12, Math.min(1, s + 0.15), l * 0.72);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function bodyMaterials(look: Look): Material[] {
  const o = look.outfit;
  // Hair sheen stays subtle, otherwise dark hair reads as grey.
  const hair = ramp(look.hairColor);
  hair[3] = mix(hair[2], hair[3], 0.55);
  hair[4] = mix(hair[2], hair[4], 0.45);
  return [
    { ramp: skinRamp(look.skin), outline: true },
    { ramp: ramp(o.top), outline: true },
    { ramp: ramp(o.trim), outline: true },
    { ramp: ramp(o.bottom), outline: true },
    { ramp: ramp(o.socks ?? "#eceae3"), outline: true },
    { ramp: ramp(o.shoes), outline: true },
    { ramp: ramp("#cfc8b8"), outline: true },
    { ramp: ramp(o.accent), outline: true },
    { ramp: hair, outline: true },
    { ramp: flat("#f3efe8"), outline: true },
    { ramp: flat("#1b1326"), outline: true },
    { ramp: ramp(lipColor(look.skin)), outline: true },
    { ramp: ramp(o.patternColor ?? o.trim), outline: true },
    { ramp: ramp(o.gloves ?? o.trim), outline: true },
  ];
}
