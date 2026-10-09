/**
 * How readable one colour is on another: the WCAG contrast ratio, from 1 (the same) to 21 (black on
 * white). 4.5 is the usual bar for text. Only plain hex colours (`#1f4fd8`, `#fff`) are measured,
 * which is what the palettes and a colour picker give; anything else is `null`.
 */
export const READABLE = 4.5;

function channels(colour: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as [number, number, number];
}

function luminance(colour: string): number | null {
  const rgb = channels(colour);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number | null {
  const [la, lb] = [luminance(a), luminance(b)];
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Of the given text colours, the one that reads best on `background`: what the Appearance screen
 * puts on buttons in a client's own brand colour. White or near-black unless told otherwise.
 */
export function textOn(background: string, choices: string[] = ['#ffffff', '#111111']): string {
  let best = choices[0];
  let bestRatio = -1;
  for (const choice of choices) {
    const ratio = contrast(choice, background) ?? -1;
    if (ratio > bestRatio) [best, bestRatio] = [choice, ratio];
  }
  return best;
}
