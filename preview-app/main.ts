import {
  ANIMS,
  DEFAULT_FRAME,
  framePoses,
  racket,
  randomLook,
  renderAnim,
  renderPose,
  SHIRT_PATTERNS,
  sword,
  toScaledCanvas,
  toSheet,
  type HeldItem,
  type Look,
  type Outfit,
  type ShirtPattern,
} from "../src/index.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = $("root");

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

const crop: [number, number, number, number] = [10, 6, DEFAULT_FRAME.width - 20, DEFAULT_FRAME.height - 6];
let timers: number[] = [];

function section(title: string) {
  const h = document.createElement("h2");
  h.textContent = title;
  const row = document.createElement("div");
  row.className = "row";
  root.append(h, row);
  return row;
}

function fig(row: HTMLElement, el: HTMLElement, caption: string) {
  const f = document.createElement("figure");
  const c = document.createElement("figcaption");
  c.textContent = caption;
  f.append(el, c);
  row.append(f);
}

const patternSel = $<HTMLSelectElement>("pattern");
for (const p of SHIRT_PATTERNS) patternSel.append(new Option(p, p));
patternSel.value = "stripes";

/** Football kit overrides from the kit controls (null when the Kit toggle is off). */
function kitControls(): Partial<Outfit> | null {
  if (!$<HTMLInputElement>("kit").checked) return null;
  const val = (id: string) => $<HTMLInputElement>(id).value;
  return {
    top: val("top"),
    pattern: patternSel.value as ShirtPattern,
    patternColor: val("patternColor"),
    socks: val("socks"),
    highSocks: $<HTMLInputElement>("highSocks").checked,
    sleeves: $<HTMLSelectElement>("sleeves").value as Outfit["sleeves"],
    gloves: $<HTMLInputElement>("gloves").checked ? val("gloveColor") : undefined,
  };
}

function draw() {
  timers.forEach(clearInterval);
  timers = [];
  root.replaceChildren();
  const seed = Number($<HTMLInputElement>("seed").value);
  const zoom = Number($<HTMLSelectElement>("zoom").value);
  const which = $<HTMLSelectElement>("item").value;
  const item: HeldItem | null = which === "racket" ? racket() : which === "sword" ? sword() : null;
  const rng = mulberry32(seed);
  const kit = kitControls();
  const cast: Look[] = Array.from({ length: 8 }, () => randomLook(rng)).map((l) =>
    kit ? { ...l, outfit: { ...l.outfit, ...kit } } : l,
  );

  const lineup = section("Cast (random looks)");
  for (const look of cast) fig(lineup, toScaledCanvas(renderPose(look, ANIMS.idle.keys[0], { item }), { crop, scale: zoom }), `${look.gender} ${look.hair}`);

  if (kit) {
    const pats = section("Shirt patterns (kit colours)");
    for (const pattern of SHIRT_PATTERNS) {
      const look = { ...cast[0], outfit: { ...cast[0].outfit, pattern } };
      fig(pats, toScaledCanvas(renderPose(look, ANIMS.run.keys[0], { item }), { crop, scale: zoom }), pattern);
    }
  }

  const play = section("Animations (playing)");
  for (const [name, a] of Object.entries(ANIMS)) {
    const frames = renderAnim(cast[0], a, { item }).map((f) => toScaledCanvas(f, { crop, scale: zoom }));
    const holder = document.createElement("div");
    holder.append(frames[0]);
    let i = 0;
    timers.push(window.setInterval(() => holder.replaceChildren(frames[(i = (i + 1) % frames.length)]), 1000 / a.fps));
    fig(play, holder, `${name} (${framePoses(a).length}f)`);
  }

  $("png").onclick = () => {
    const sheet = toSheet(renderAnim(cast[0], ANIMS.idle, { item }));
    const a = document.createElement("a");
    a.href = sheet.toDataURL("image/png");
    a.download = "idle-sheet.png";
    a.click();
  };
}

for (const id of ["seed", "item", "zoom", "kit", "top", "pattern", "patternColor", "socks", "highSocks", "sleeves", "gloves", "gloveColor"])
  $(id).addEventListener("change", draw);
draw();
