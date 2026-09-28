// Optional PixiJS v8 adapter: `import { bakeCharacter } from "@taipeistudio/pixel-rig/pixi"`.
import { Texture } from "pixi.js";
import { toCanvas, type Pixels } from "../canvas.js";
import { DEFAULT_FRAME, renderAnims, type Frame, type RenderOptions } from "../character.js";
import type { Look } from "../look.js";
import type { Anim } from "../pose.js";
import type { PropSprite } from "../props.js";

export function toTexture(p: Pixels): Texture {
  const tex = Texture.from(toCanvas(p));
  tex.source.scaleMode = "nearest";
  return tex;
}

export interface CharacterSheet<K extends string> {
  textures: Record<K, Texture[]>;
  frames: Record<K, Frame[]>;
  /** Normalised anchor for Sprite.anchor (the feet). */
  anchor: { x: number; y: number };
}

const cache = new Map<string, CharacterSheet<string>>();

/**
 * Render and upload every animation for a look. Results are cached per
 * (look, anims, item, frame) key; pass a stable `cacheKey` for custom items.
 */
export function bakeCharacter<K extends string>(
  look: Look,
  anims: Record<K, Anim>,
  opts: RenderOptions & { cacheKey?: string } = {},
): CharacterSheet<K> {
  const key = `${opts.cacheKey ?? ""}|${JSON.stringify(look)}|${Object.keys(anims).join(",")}|${JSON.stringify(opts.frame ?? null)}`;
  const hit = cache.get(key);
  if (hit) return hit as CharacterSheet<K>;
  const frames = renderAnims(look, anims, opts);
  const textures = {} as Record<K, Texture[]>;
  for (const k of Object.keys(frames) as K[]) textures[k] = frames[k].map(toTexture);
  const f = opts.frame ?? DEFAULT_FRAME;
  const sheet: CharacterSheet<K> = { textures, frames, anchor: { x: f.originX / f.width, y: f.groundY / f.height } };
  if (cache.size > 64) {
    for (const s of cache.values()) for (const list of Object.values<Texture[]>(s.textures)) list.forEach((t) => t.destroy(true));
    cache.clear();
  }
  cache.set(key, sheet as CharacterSheet<string>);
  return sheet;
}

export const bakeProps = (sprites: PropSprite[]): Texture[] => sprites.map(toTexture);
