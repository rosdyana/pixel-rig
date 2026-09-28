export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Rotate hue `h` toward `target` by up to `amount` degrees. */
function shiftHue(h: number, target: number, amount: number): number {
  const diff = ((target - h + 540) % 360) - 180;
  return h + Math.sign(diff) * Math.min(Math.abs(diff), amount);
}

/**
 * 5-tone pixel-art ramp: [deep shadow, shadow, base, light, highlight].
 * Shadows drift cool (blue/purple) and gain saturation, highlights drift
 * warm and desaturate. This hue shifting is what keeps it from looking muddy.
 */
export function ramp(base: string): RGB[] {
  const [h, s, l] = rgbToHsl(hexToRgb(base));
  const tone = (dl: number, hueTo: number, hueAmt: number, ds: number) =>
    hslToRgb(
      shiftHue(h, hueTo, hueAmt),
      clamp01(Math.max(s + ds, ds > 0 ? 0.14 : 0)),
      clamp01(dl),
    );
  return [
    tone(l * 0.52, 255, 26, 0.12),
    tone(l * 0.76, 250, 14, 0.07),
    hexToRgb(base),
    tone(l + (1 - l) * 0.28, 50, 8, -0.06),
    tone(l + (1 - l) * 0.6, 55, 14, -0.14),
  ];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
