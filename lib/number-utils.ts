import type { DifficultyTier } from './database.types';

// ── Numbers ───────────────────────────────────────────────────────────────────

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    return rest === 0 ? `${ONES[h]} hundred` : `${ONES[h]} hundred ${numberToWords(rest)}`;
  }
  if (n < 10000) {
    const k = Math.floor(n / 1000), rest = n % 1000;
    const base = `${ONES[k] || numberToWords(k)} thousand`;
    return rest === 0 ? base : `${base} ${numberToWords(rest)}`;
  }
  return n.toLocaleString();
}

const NUMBER_RANGES: Record<DifficultyTier, [number, number]> = {
  beginner:          [1,   20],
  elementary:        [1,  100],
  'pre-intermediate':[1, 1000],
  intermediate:      [1, 9999],
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateNumbers(count: number, level: DifficultyTier): number[] {
  const [min, max] = NUMBER_RANGES[level] ?? [1, 20];
  const seen = new Set<number>();
  const result: number[] = [];
  for (let i = 0; i < count * 20 && result.length < count; i++) {
    const n = randomInt(min, max);
    if (!seen.has(n)) { seen.add(n); result.push(n); }
  }
  return result;
}

export function numeralUri(n: number): string { return `numeral://${n}`; }
export function parseNumeralUri(uri: string): number | null {
  if (!uri.startsWith('numeral://')) return null;
  const n = parseInt(uri.replace('numeral://', ''), 10);
  return isNaN(n) ? null : n;
}

// ── Colors ────────────────────────────────────────────────────────────────────

export interface ColorEntry { name: string; hex: string; textColor: string; definition: string; }

// All colors ordered from most basic → most advanced
export const ALL_COLORS: ColorEntry[] = [
  // Beginner tier (absolute basics)
  { name: 'red',        hex: '#E53935', textColor: '#fff', definition: 'A warm, bright color like a fire truck or apple.' },
  { name: 'blue',       hex: '#1E88E5', textColor: '#fff', definition: 'A cool color like the sky or ocean.' },
  { name: 'green',      hex: '#43A047', textColor: '#fff', definition: 'The color of grass and leaves.' },
  { name: 'yellow',     hex: '#FDD835', textColor: '#333', definition: 'A bright color like the sun or a banana.' },
  { name: 'orange',     hex: '#FB8C00', textColor: '#fff', definition: 'A warm color between red and yellow, like an orange fruit.' },
  { name: 'purple',     hex: '#8E24AA', textColor: '#fff', definition: 'A deep color made by mixing red and blue.' },
  { name: 'pink',       hex: '#E91E8C', textColor: '#fff', definition: 'A light, soft color like roses.' },
  { name: 'black',      hex: '#212121', textColor: '#fff', definition: 'The darkest color, like night or coal.' },
  { name: 'white',      hex: '#F5F5F5', textColor: '#555', definition: 'The lightest color, like snow or clouds.' },
  { name: 'brown',      hex: '#6D4C41', textColor: '#fff', definition: 'An earthy color like wood or soil.' },
  // Elementary tier
  { name: 'gray',       hex: '#757575', textColor: '#fff', definition: 'A neutral color between black and white.' },
  { name: 'navy',       hex: '#1A237E', textColor: '#fff', definition: 'A very dark shade of blue, like a navy uniform.' },
  { name: 'lime',       hex: '#8BC34A', textColor: '#333', definition: 'A very bright, vivid green.' },
  { name: 'teal',       hex: '#00796B', textColor: '#fff', definition: 'A blue-green color like sea water.' },
  { name: 'gold',       hex: '#FFB300', textColor: '#333', definition: 'A shiny yellow color like a gold medal.' },
  { name: 'silver',     hex: '#90A4AE', textColor: '#333', definition: 'A shiny gray color like coins or metal.' },
  { name: 'beige',      hex: '#D7CCC8', textColor: '#555', definition: 'A pale sandy color, slightly off-white.' },
  { name: 'maroon',     hex: '#880E4F', textColor: '#fff', definition: 'A dark brownish-red color.' },
  // Pre-intermediate tier
  { name: 'turquoise',  hex: '#00897B', textColor: '#fff', definition: 'A blue-green color like tropical water.' },
  { name: 'crimson',    hex: '#C62828', textColor: '#fff', definition: 'A deep, rich red color.' },
  { name: 'magenta',    hex: '#AD1457', textColor: '#fff', definition: 'A vivid pinkish-red color.' },
  { name: 'indigo',     hex: '#3949AB', textColor: '#fff', definition: 'A deep blue-purple color, like the night sky.' },
  { name: 'violet',     hex: '#7B1FA2', textColor: '#fff', definition: 'A light purple color, part of the rainbow.' },
  { name: 'coral',      hex: '#FF5722', textColor: '#fff', definition: 'A warm pinkish-orange color like coral reefs.' },
  { name: 'ivory',      hex: '#FFF9E6', textColor: '#555', definition: 'A creamy off-white color like elephant tusks.' },
  { name: 'lavender',   hex: '#CE93D8', textColor: '#555', definition: 'A pale purple color like lavender flowers.' },
  // Intermediate tier
  { name: 'chartreuse', hex: '#7CB342', textColor: '#fff', definition: 'A sharp yellow-green color.' },
  { name: 'fuchsia',    hex: '#E040FB', textColor: '#fff', definition: 'A bright mix of pink and purple.' },
  { name: 'amber',      hex: '#FFB300', textColor: '#333', definition: 'A warm golden-yellow color like tree resin.' },
  { name: 'scarlet',    hex: '#C0392B', textColor: '#fff', definition: 'A vivid bright red with a slight orange tint.' },
  { name: 'cerulean',   hex: '#2980B9', textColor: '#fff', definition: 'A bright sky-blue color.' },
  { name: 'mauve',      hex: '#CE93A8', textColor: '#555', definition: 'A pale pinkish-purple color.' },
  { name: 'ochre',      hex: '#C8860A', textColor: '#fff', definition: 'A dark yellowish-brown color from natural earth.' },
  { name: 'taupe',      hex: '#8B7765', textColor: '#fff', definition: 'A dark brownish-gray color.' },
];

const COLOR_TIERS: Record<DifficultyTier, number> = {
  beginner: 10, elementary: 18, 'pre-intermediate': 26, intermediate: ALL_COLORS.length,
};

export function getColorPool(level: DifficultyTier): ColorEntry[] {
  return ALL_COLORS.slice(0, COLOR_TIERS[level] ?? ALL_COLORS.length);
}

export function colorUri(hex: string): string { return `color://${hex.replace('#', '')}`; }
export function parseColorUri(uri: string): string | null {
  if (!uri.startsWith('color://')) return null;
  return `#${uri.replace('color://', '')}`;
}
