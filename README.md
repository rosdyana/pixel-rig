<div align="center">

# pixel-rig

**Procedural, animated pixel-art characters from a pose rig.**

No image files, no AI services: every frame is drawn by code.

[![npm version](https://img.shields.io/npm/v/@taipeistudio/pixel-rig.svg)](https://www.npmjs.com/package/@taipeistudio/pixel-rig)
[![license](https://img.shields.io/badge/license-MIT%20with%20attribution-blue.svg)](LICENSE)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![PixiJS v8](https://img.shields.io/badge/PixiJS-v8-e72264.svg)](https://pixijs.com/)

</div>

---

pixel-rig renders side-view humanoid sprites from two plain-JSON inputs: a **look** (what the
character looks like) and a **pose** (joint angles). Because every frame comes from the same
rig, any combination of looks and animations stays visually consistent, and the same input
always produces the same pixels.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Football kits](#football-kits)
- [Custom poses and animations](#custom-poses-and-animations)
- [Custom held items](#custom-held-items)
- [Rear view: bikes and riders](#rear-view-bikes-and-riders)
- [On foot, front and back](#on-foot-front-and-back)
- [Finer pixels](#finer-pixels)
- [Props and low-level drawing](#props-and-low-level-drawing)
- [Frame size](#frame-size)
- [Versioning policy](#versioning-policy)
- [Development](#development)
- [License](#license)

## Features

- **Consistent shading**: 5-tone hue-shifted colour ramps, lambert shading, crease shadows and selective outlines
- **Configurable humanoid rig**: gender, build, stature, skin, 7 hair styles, eyes, facial hair, handedness, headband and outfit colours (top, trim, bottom, shoes, accent, shorts/skort/trousers)
- **Football kits**: shirt patterns (stripes, hoops, halves, sash), sock colours, knee-high socks, long sleeves and goalkeeper gloves
- **Basketball kits**: sleeveless jerseys, knee-length shorts, crew socks, a shooting sleeve, and a free `height` scale for very tall players
- **Pose system**: pose blending and animations, with a generic set included (idle, run, jump, lunge, dive, cheer, slump)
- **Rear-view rig for 2.5D games**: a rider on a motorbike seen from behind (five bike kinds, lean, steering, punches, kicks, weapon swings, helmets), in the same style and scale as the side view
- **On-foot front and back views** of the same riders, with a run cycle
- **Finer pixels on request**: `scale: 2` renders any rig with four times the detail
- **Pluggable held items**: `racket()` and `sword()` included, or write your own
- **Props**: pre-rendered rotations for small sprites such as projectiles, balls and shuttlecocks
- **Deterministic and save-friendly**: looks are plain JSON; the same input always yields the same pixels
- **Integrations**: canvas helpers (portraits, sprite-sheet PNG export) and an optional PixiJS v8 adapter
- **Zero runtime dependencies**, ESM only, fully typed

## Installation

```bash
npm install @taipeistudio/pixel-rig
```

pixel-rig ships as ES modules and is intended to be used with a bundler (Vite, webpack,
esbuild, etc.). `pixi.js` is an **optional** peer dependency, needed only for the
`@taipeistudio/pixel-rig/pixi` entry point:

```bash
npm install pixi.js
```

## Quick start

### Canvas

```ts
import { ANIMS, DEFAULT_LOOK, racket, renderAnims, toScaledCanvas } from "@taipeistudio/pixel-rig";

const look = { ...DEFAULT_LOOK, hair: "ponytail", gender: "female" } as const;
const frames = renderAnims(look, ANIMS, { item: racket() });

document.body.append(toScaledCanvas(frames.idle[0], { scale: 4 }));
```

### PixiJS v8

```ts
import { AnimatedSprite } from "pixi.js";
import { ANIMS, randomLook, sword } from "@taipeistudio/pixel-rig";
import { bakeCharacter } from "@taipeistudio/pixel-rig/pixi";

const sheet = bakeCharacter(randomLook(), ANIMS, { item: sword(), cacheKey: "sword" });

const hero = new AnimatedSprite(sheet.textures.run);
hero.anchor.set(sheet.anchor.x, sheet.anchor.y); // anchored at the feet
hero.animationSpeed = ANIMS.run.fps / 60;
hero.play();

// Characters face +x; mirror with hero.scale.x = -1.
```

## Core concepts

| Concept | Description |
| --- | --- |
| **Look** | The character's appearance. Plain JSON, safe to store in save files. `randomLook(rng, { gender, outfit, skins, hairColors })` generates casts; pass a seeded `rng` for reproducible crowds. |
| **Pose** | Absolute joint angles in degrees (0 = down, 90 = forward, 180 = up, 270 = back) for lean, head, item arm (`arm`), off arm, near/far legs, feet, held-item direction, height off the ground, mouth and hair sway. Feet are planted automatically unless `air > 0`. |
| **Anim** | Key poses plus `steps` (in-between frames per segment), `fps` and `loop`. |
| **Frame** | RGBA pixels plus anchors: `origin` (feet), `hand`, and `item` (the point a held item returns, e.g. a racket head). Use these to line up hits, muzzle flashes or pick-ups. |
| **HeldItem** | An object that declares its materials and draws itself at the hand. |

## Sports kits

Kit fields are optional properties of `Outfit`. When omitted, a look renders exactly as it
did before kits were introduced (0.1).

| Field | Values | Effect |
| --- | --- | --- |
| `pattern` | `"plain"` (default), `"stripes"`, `"hoops"`, `"halves"`, `"sash"` | Painted on the torso; collar and side seam stay in `trim` |
| `patternColor` | hex (default: `trim`) | Colour of the stripes, hoops, front half or sash |
| `socks` | hex (default: off-white) | Sock colour; the stripe near the sock top stays `accent` |
| `highSocks` | boolean | Knee-high football socks (same as `sockHeight: "knee"`) |
| `sockHeight` | `"ankle"` (default), `"crew"`, `"knee"` | Sock length; crew socks reach mid-calf |
| `sleeves` | `"short"` (default), `"long"`, `"none"` | Long sleeves in `top` with a `trim` cuff at the wrist; `none` is a sleeveless jersey with a trimmed armhole |
| `bottomStyle` | `"shorts"`, `"skort"`, `"long"` | `long`: baggy knee-length basketball shorts |
| `armSleeve` | boolean | Compression sleeve on the item arm, in `accent` |
| `gloves` | hex | Goalkeeper gloves on both hands (slightly larger hands) |
| `barefoot` | boolean | Bare feet: skin to the toes, `shoes` and `socks` ignored |

```ts
import { DEFAULT_LOOK, type Look } from "@taipeistudio/pixel-rig";

const striker: Look = {
  ...DEFAULT_LOOK,
  outfit: {
    ...DEFAULT_LOOK.outfit,
    top: "#f4f1ea", pattern: "stripes", patternColor: "#1d1d26",
    bottom: "#1d1d26", socks: "#1d1d26", highSocks: true,
  },
};

const keeper: Look = {
  ...striker,
  outfit: { ...striker.outfit, top: "#f2c230", pattern: "plain", sleeves: "long", gloves: "#34c46a" },
};
```

`Look.height` (optional number) scales limbs and torso and overrides `stature` (short 0.93,
average 1, tall 1.07). Above about 1.07, jumping poses need a taller frame than
`DEFAULT_FRAME`, e.g. `{ width: 112, height: 128, groundY: 124, originX: 56 }`.

```ts
const centre: Look = {
  ...DEFAULT_LOOK,
  height: 1.12,
  build: "slim",
  outfit: { ...DEFAULT_LOOK.outfit, sleeves: "none", bottomStyle: "long", sockHeight: "crew", armSleeve: true },
};
```

Stripes are ~2 px bands and hoops ~3 px; in side view, `"halves"` splits the shirt front and
back. Kits add two body material slots (`M.pattern`, `M.glove`), so `BODY_SLOTS` is 14
(previously 12). Held items use `BODY_SLOTS + i` and are unaffected.

## Custom poses and animations

```ts
import { anim, pose, POSES } from "@taipeistudio/pixel-rig";

const overheadWind = pose({ lean: -10, head: -14, arm: { a: 205, b: 262 }, item: 330 });
const overheadHit = pose({ lean: 8, arm: { a: 162, b: 150 }, item: 135, mouth: "open" });

const smash = anim([overheadWind, overheadHit, POSES.ready], { fps: 18 });
```

## Custom held items

```ts
import { add, dir, ramp, type HeldItem } from "@taipeistudio/pixel-rig";

export const torch: HeldItem = {
  materials: () => [
    { ramp: ramp("#6b4a2b"), outline: true },
    { ramp: ramp("#ffb030"), outline: false },
  ],
  draw({ buf, hand, angle, depth, part, mat }) {
    const v = dir(angle);
    const top = add(hand, v, 9);
    buf.capsule(hand, top, 1, 1, depth, part, () => ({ mat: mat(0), tone: 2 }));
    buf.disc(add(top, v, 2), 2.2, depth + 0.1, part, ({ shade }) => ({ mat: mat(1), tone: shade > 0 ? 4 : 3 }));
    return top; // becomes frame.item
  },
};
```

## Rear view: bikes and riders

For pseudo-3D racers and other 2.5D games, `renderRider` draws a bike from behind with the
same materials, shading and scale as the side-view rig, so a character keeps its look when
it gets off the bike.

```ts
import { DEFAULT_LOOK, mirrorRider, renderRider, riderPose, RIDER_POSES, type Bike, type Rider } from "@taipeistudio/pixel-rig";

const rider: Rider = {
  look: { ...DEFAULT_LOOK, outfit: { ...DEFAULT_LOOK.outfit, top: "#2b2d42", sleeves: "long" } },
  helmet: "full", // or "half", "none"
  helmetColor: "#d8262f",
  patch: true, // emblem on the back in the outfit accent colour
};
const bike: Bike = { kind: "underbone", body: "#d8262f", accent: "#f4f1ea", exhaust: "racing" };

renderRider(rider, bike); // riding straight
renderRider(rider, bike, riderPose({ roll: 14, steer: 0.7 })); // leaning into a right-hander
renderRider(rider, bike, RIDER_POSES.kick); // kick to the right
renderRider(rider, bike, mirrorRider(RIDER_POSES.kick)); // and to the left
renderRider(null, bike, riderPose({ roll: 85, air: 6 })); // riderless, lying on its side
```

- **Bikes**: `underbone`, `scooter`, `standard`, `sport`, `cruiser` (`BIKE_KINDS`), with body
  and accent colours, optional seat and plate colours, a `racing` exhaust and a `cargo` box.
- **Poses**: `roll` (degrees, about the tyre contact point), `tuck`, `shift`, `head`,
  `steer`, `air`, `brake`, and four limbs. A limb with `hold: 1` stays on its grip or peg;
  at `hold: 0` it follows its angles (0 = down, 90 = out to its own side, 180 = up).
  `RIDER_POSES` has ride, tuck, brake, punch, kick, swing, hit, footDown and cheer, all to
  the right; `mirrorRider` flips any pose. `blendRider`, `riderAnim`, `riderFramePoses`,
  `renderRiderAnim` and `RIDER_ANIMS` mirror the side rig's animation helpers.
- **Held items** work unchanged: pass `{ item }` and set `pose.item` / `pose.itemSide`.
- **Frame**: `REAR_FRAME` is 128 × 88 px with the rear tyre's contact point at (64, 84).
- Bikes add material slots after the body's (`RM`, `REAR_SLOTS`); held items follow them.

## On foot, front and back

`renderWalker` draws the same `Rider` off the bike, seen from the front or from behind:
for a rider running back to a crashed bike, or anyone walking toward or away from the
camera in a 2.5D scene.

```ts
import { renderWalker, runCycle, STAND_POSE } from "@taipeistudio/pixel-rig";

renderWalker(rider, STAND_POSE, { facing: "front" }); // standing, looking at the camera
runCycle().map((pose) => renderWalker(rider, pose, { facing: "back" })); // 8-frame run, from behind
```

A `WalkPose` is each leg's lift (0 planted to 1 knee high), each arm's swing (-1 back to 1
forward) and a `bob`. `raise: { side, angle }` holds one arm straight instead (waving a
flag, pointing); pass `{ item }` to put a held item in that hand. It uses the default frame, with the origin on the ground between the
feet.

## Finer pixels

Every renderer takes `scale` (default 1): the same drawing with `scale` pixels per rig unit.
`{ scale: 2 }` returns a frame twice as wide and tall with four times the detail; outlines
and creases stay one pixel wide. The frame's size, origin and anchors are in the finer
pixels. `PixelBuffer` takes the same factor as its fourth argument, with coordinates and
radii left in unscaled units, so custom props and items scale without changes.

## Props and low-level drawing

- **Props**: `renderRotations(size, count, materials, draw)` pre-renders a small sprite at
  `count` headings; `rotationIndex(radians, count)` selects the right one each frame.
- **Low level**: `PixelBuffer` (`capsule`, `disc`, `box`, `line`, `put`; depth, parts, and
  `resolve()` for creases, cleanup and outlines) and `ramp()` are exported for drawing
  anything else in the same style.

## Frame size

The default frame is 112 × 104 px with the feet at (56, 100): room for a ~62 px tall adult
plus held items and jumps. Override it per render:

```ts
renderPose(look, pose, { frame: { width, height, groundY, originX } });
```

## Versioning policy

pixel-rig follows [Semantic Versioning](https://semver.org/), with one addition: **pixels
are part of the API**. Changes to ramps, shading or rig proportions alter every consumer's
art, so visual changes bump the **minor** version and API changes bump the **major** version.
Pin a minor range (e.g. `~0.2.0`) if your art must not shift.

## Development

```bash
git clone https://github.com/rosdyana/pixel-rig.git
cd pixel-rig
npm install

npm run dev     # preview app: cast, all animations, item switcher, PNG sheet export
npm test        # feet planted, no frame clipping, determinism, pixel-hash regression, props, rear rig
npm run check   # typecheck + tests
npm run build   # dist/ (ESM + .d.ts)
```

Issues and pull requests are welcome at
[github.com/rosdyana/pixel-rig/issues](https://github.com/rosdyana/pixel-rig/issues).

## License

Released under the **MIT License with an attribution requirement**. See [LICENSE](LICENSE).

You may use, modify, distribute and sell software that includes pixel-rig, including in
commercial games, provided that:

1. the copyright notice and license are kept in all copies and modified versions, and
2. your product visibly credits the author (credits screen, About page, documentation or
   store listing), for example:

   > pixel-rig by Rosdyana Kusuma - https://github.com/rosdyana/pixel-rig

Copyright © 2026 [Rosdyana Kusuma](https://github.com/rosdyana).
