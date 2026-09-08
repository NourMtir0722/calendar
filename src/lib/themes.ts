export interface Theme {
  id: string;
  name: string;
  /** Which four months wear it, as a label. */
  span: string;
  /** First month of the block, 0-indexed. */
  from: number;
  /** The page itself. */
  ground: string;
  /** The calendar sheet, and the type set on the ground. */
  paper: string;
  /** Plate number, live counter, selected-day ring. */
  accent: string;
  /** Weekend circles. */
  warm: string;
}

/**
 * The year runs black → violet → wine, and each block was chosen against the
 * paintings it has to carry:
 *
 *   INK      oysters, feathers, tulips, blossom: pale, cold, sharp subjects
 *            that cut hardest against near-black.
 *   VIOLET   peonies, strawberries, melon, figs: the ripe months, where the
 *            purple sits with the plums and the pink warm with the peonies.
 *   OXBLOOD  grapes, black grapes, mushrooms, pomegranate: the harvest, which
 *            is already oxblood; the ground agrees with the fruit for once.
 *
 * Every value is contrast-checked: paper on ground and ground on paper clear
 * 4.5:1, and accent on ground plus paper on warm clear 3:1 for large type.
 * Sampling colours out of the paintings instead fails badly: they are all warm
 * mid-tones, so eight of twelve sampled accents drop under 3:1 on a saturated
 * ground, and December's pomegranate red lands at 1.17:1.
 */
export const THEMES: Theme[] = [
  {
    id: 'ink',
    name: 'INK',
    span: 'JAN–APR',
    from: 0,
    ground: '#0e0e10',
    paper: '#f2ead8',
    accent: '#e8b84b',
    warm: '#c2703a',
  },
  {
    id: 'violet',
    name: 'VIOLET',
    span: 'MAY–AUG',
    from: 4,
    ground: '#4c1d95',
    paper: '#f2ecf8',
    accent: '#f9c846',
    warm: '#e8467c',
  },
  {
    id: 'oxblood',
    name: 'OXBLOOD',
    span: 'SEP–DEC',
    from: 8,
    ground: '#5e1622',
    paper: '#f4ead9',
    accent: '#e8b84b',
    warm: '#b86230',
  },
];

/** The month decides the palette, so there is one source of truth. */
export function themeForMonth(month: number): Theme {
  const wrapped = ((month % 12) + 12) % 12;
  return THEMES[Math.min(THEMES.length - 1, Math.floor(wrapped / 4))];
}
