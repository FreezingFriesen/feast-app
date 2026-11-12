// WCAG 2.x contrast, used by the tests that keep the colour roles readable.

// The minimum ratio for each kind of pair: normal-size text, and UI graphics
// (icons, control edges, markers).
export const MIN_CONTRAST = Object.freeze({ text: 4.5, ui: 3 });

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Relative luminance of a "#RRGGBB" colour, from 0 (black) to 1 (white).
export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`Expected a #RRGGBB colour, got "${hex}"`);
  }
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// From 1 (no contrast) to 21 (black on white). The order of the two colours doesn't matter.
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
