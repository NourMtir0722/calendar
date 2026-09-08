export interface MonthPlate {
  name: string;
  short: string;
  /** Plate number in roman, as printed beside the subject. */
  plate: string;
  src: string;
  /** The subject line printed beside the plate number. */
  subject: string;
  /** What the scanner guesses it is looking at. */
  labels: string[];
  alt: string;
}

const MACHINE = ['CONF:0.41', 'ID??', 'SCANNING...', 'NO_MATCH', 'TXT_??'];

export const MONTHS: MonthPlate[] = [
  {
    name: 'January',
    short: 'JAN',
    plate: 'I',
    src: '/plates/01-january.jpg',
    subject: 'OYSTERS, LEMON, PARING KNIFE',
    labels: ['OSTREA?', 'SHELL_04', 'CITRUS??', ...MACHINE],
    alt: 'Still life of five opened oysters on a pewter plate beside a halved lemon and a bone-handled knife, on a stone ledge in near darkness.',
  },
  {
    name: 'February',
    short: 'FEB',
    plate: 'II',
    src: '/plates/02-february.jpg',
    subject: 'GAME FEATHERS, BOUND WITH TWINE',
    labels: ['PLUMA?', 'BARB_11', 'KNOT??', ...MACHINE],
    alt: 'Still life of a fan of barred pheasant feathers tied at the quills with coarse twine, standing on a stone ledge.',
  },
  {
    name: 'March',
    short: 'MAR',
    plate: 'III',
    src: '/plates/03-march.jpg',
    subject: 'BROKEN TULIPS IN A WATER GLASS',
    labels: ['TULIPA?', 'STEM_02', 'FLAME??', ...MACHINE],
    alt: 'Still life of red and white streaked tulips in a plain water glass, one bloom drooping over the edge of a stone ledge and a fallen petal beside it.',
  },
  {
    name: 'April',
    short: 'APR',
    plate: 'IV',
    src: '/plates/04-april.jpg',
    subject: 'BLOSSOM BRANCH, NEST, FOUR EGGS',
    labels: ['NIDUS?', 'OVA_04', 'FLOS??', ...MACHINE],
    alt: 'Still life of a flowering apple branch laid beside a twig nest holding four speckled eggs, on a stone ledge.',
  },
  {
    name: 'May',
    short: 'MAY',
    plate: 'V',
    src: '/plates/05-may.jpg',
    subject: 'PEONIES IN A BROWN VASE',
    labels: ['PAEONIA?', 'PETAL_07', 'FALL??', ...MACHINE],
    alt: 'Still life of pink and crimson peonies crowded into a squat brown vase, with loose petals fallen across the stone ledge.',
  },
  {
    name: 'June',
    short: 'JUN',
    plate: 'VI',
    src: '/plates/06-june.jpg',
    subject: 'WILD STRAWBERRIES AND CHERRIES',
    labels: ['FRAGARIA?', 'STEM_19', 'COUNT:??', ...MACHINE],
    alt: 'Still life of a blue and white porcelain bowl heaped with wild strawberries and cherries, several spilled across the stone ledge.',
  },
  {
    name: 'July',
    short: 'JUL',
    plate: 'VII',
    src: '/plates/07-july.jpg',
    subject: 'CUT MELON WITH PLUMS',
    labels: ['CUCUMIS?', 'RIND_01', 'SEED??', ...MACHINE],
    alt: 'Still life of a netted cantaloupe with a wedge cut away to show the seeds, beside a small heap of dusty purple plums on a stone ledge.',
  },
  {
    name: 'August',
    short: 'AUG',
    plate: 'VIII',
    src: '/plates/08-august.jpg',
    subject: 'FIGS, PLUMS, APRICOTS ON THE BRANCH',
    labels: ['FICUS?', 'PULP_03', 'SPLIT??', ...MACHINE],
    alt: 'Still life of split figs, purple plums and golden apricots piled on a stone ledge with a leafy branch laid across the back.',
  },
  {
    name: 'September',
    short: 'SEP',
    plate: 'IX',
    src: '/plates/09-september.jpg',
    subject: 'GRAPES AND PEACH ON PEWTER',
    labels: ['VITIS?', 'PRUNUS??', 'STONE_01', ...MACHINE],
    alt: 'Still life of green and purple grapes with a whole and a halved peach on a pewter plate, vine leaves behind, on a stone ledge.',
  },
  {
    name: 'October',
    short: 'OCT',
    plate: 'X',
    src: '/plates/10-october.jpg',
    subject: 'BLACK GRAPES AND VINE LEAVES',
    labels: ['VITIS?', 'TENDRIL_06', 'BLOOM??', ...MACHINE],
    alt: 'Still life of a bunch of dark purple grapes lying on broad vine leaves with a curling tendril, on a stone ledge.',
  },
  {
    name: 'November',
    short: 'NOV',
    plate: 'XI',
    src: '/plates/11-november.jpg',
    subject: 'MUSHROOMS, WALNUTS, CHESTNUTS',
    labels: ['BOLETUS?', 'SHELL_22', 'CAP??', ...MACHINE],
    alt: 'Still life of a heap of boletus mushrooms above scattered walnuts, some cracked open, and glossy chestnuts on a stone ledge.',
  },
  {
    name: 'December',
    short: 'DEC',
    plate: 'XII',
    src: '/plates/12-december.jpg',
    subject: 'SPLIT POMEGRANATE, DRIED FIGS, BAY',
    labels: ['PUNICA?', 'ARIL_??', 'DRY_08', ...MACHINE],
    alt: 'Still life of a pomegranate broken open to show its seeds, ringed by dried figs, with a bay branch laid to the left on a stone ledge.',
  },
];

export function monthPlate(month: number): MonthPlate {
  return MONTHS[((month % 12) + 12) % 12];
}
