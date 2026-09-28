export type Gender = "male" | "female";
export type Build = "slim" | "athletic" | "stocky";
export type Stature = "short" | "average" | "tall";
export type HairStyle = "buzz" | "crop" | "spiky" | "bob" | "ponytail" | "bun" | "curly";
export type EyeStyle = "normal" | "narrow" | "round";
export type FacialHair = "none" | "stubble" | "mustache";
export type BottomStyle = "shorts" | "skort";

/** Clothing colours (hex). */
export interface Outfit {
  top: string;
  trim: string;
  bottom: string;
  shoes: string;
  accent: string;
  /** Defaults to shorts for male looks, a flared skort for female looks. */
  bottomStyle?: BottomStyle;
  /** Shirt pattern in `patternColor` (default: trim colour). */
  pattern?: "plain" | "stripes" | "hoops" | "halves" | "sash";
  patternColor?: string;
  /** Sock colour (default: the current off-white sock) and knee-high football socks. */
  socks?: string;
  highSocks?: boolean;
  /** Long sleeves reach the wrist (goalkeepers, winter kits). */
  sleeves?: "short" | "long";
  /** Goalkeeper gloves on both hands in this colour (slightly bigger hands). */
  gloves?: string;
}

export type ShirtPattern = NonNullable<Outfit["pattern"]>;

export const SHIRT_PATTERNS: ShirtPattern[] = ["plain", "stripes", "hoops", "halves", "sash"];

/** Everything that decides how a character is drawn. Plain JSON: safe to save. */
export interface Look {
  gender: Gender;
  build: Build;
  stature: Stature;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  eyes: EyeStyle;
  facialHair: FacialHair;
  /** Left-handed characters hold their item in the far hand. */
  lefty: boolean;
  /** Headband plus matching wristband, in the outfit accent colour. */
  headband: boolean;
  outfit: Outfit;
  /** Main colour of the held item (racket frame, sword grip, …). */
  itemColor: string;
}

export const SKIN_TONES = ["#f6d2b4", "#eab98f", "#d69a6b", "#b8764a", "#8e5433", "#5e3620"];

export const HAIR_COLORS = [
  "#1d1a24",
  "#3b2a22",
  "#6a4228",
  "#a8743d",
  "#d9b56a",
  "#9c3b24",
  "#8f8e98",
  "#3d5fd6",
];

export const HAIR_STYLES: HairStyle[] = ["buzz", "crop", "spiky", "bob", "ponytail", "bun", "curly"];

export const ITEM_COLORS = ["#e53b3b", "#f2c230", "#2d7be0", "#1d1d26", "#34c46a"];

export const DEFAULT_OUTFIT: Outfit = {
  top: "#d8262f",
  trim: "#f4f1ea",
  bottom: "#f4f1ea",
  shoes: "#f4f1ea",
  accent: "#d8262f",
};

export const DEFAULT_LOOK: Look = {
  gender: "male",
  build: "athletic",
  stature: "average",
  skin: SKIN_TONES[2],
  hair: "crop",
  hairColor: HAIR_COLORS[0],
  eyes: "normal",
  facialHair: "none",
  lefty: false,
  headband: false,
  outfit: DEFAULT_OUTFIT,
  itemColor: ITEM_COLORS[0],
};

const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

export interface RandomLookOptions {
  gender?: Gender;
  outfit?: Outfit;
  /** Restrict skin tones (indices into SKIN_TONES). */
  skins?: number[];
  hairColors?: string[];
}

/** A plausible random look. Pass any seeded rng for reproducible casts. */
export function randomLook(rng: () => number = Math.random, o: RandomLookOptions = {}): Look {
  const gender = o.gender ?? (rng() < 0.5 ? "male" : "female");
  const hair =
    gender === "female"
      ? pick(rng, ["bob", "ponytail", "ponytail", "bun", "crop", "curly"] as HairStyle[])
      : pick(rng, ["buzz", "crop", "crop", "spiky", "curly"] as HairStyle[]);
  return {
    gender,
    build: pick(rng, ["slim", "athletic", "athletic", "stocky"] as Build[]),
    stature: pick(rng, ["short", "average", "average", "tall"] as Stature[]),
    skin: SKIN_TONES[o.skins ? pick(rng, o.skins) : Math.floor(rng() * SKIN_TONES.length)],
    hair,
    hairColor: pick(rng, o.hairColors ?? HAIR_COLORS.slice(0, 6)),
    eyes: pick(rng, ["normal", "narrow", "round"] as EyeStyle[]),
    facialHair: gender === "male" && rng() < 0.2 ? pick(rng, ["stubble", "mustache"] as FacialHair[]) : "none",
    lefty: rng() < 0.12,
    headband: rng() < 0.2,
    outfit: o.outfit ?? DEFAULT_OUTFIT,
    itemColor: pick(rng, ITEM_COLORS),
  };
}
