/**
 * Design tokens. Dark, green-accented palette: near-black canvas, charcoal
 * surfaces, one vivid green accent and off-white type.
 *   #0F0F0F  #202020  #5DD62C  #337418  #F8F8F8
 */
export const colors = {
  bg: '#0F0F0F',
  surface: '#202020',
  surfaceStrong: '#2B2B2B',
  text: '#F8F8F8',
  textMuted: '#A6A6A6',
  textFaint: '#808080',
  border: '#2C2C2C',
  accent: '#5DD62C',
  /** Green used for text on dark surfaces. */
  accentDark: '#5DD62C',
  /** Deep green for fills, badges and borders. */
  accentDeep: '#337418',
  accentSoft: '#17280F',
  danger: '#FF6B63',
  dangerSoft: '#3A1B19',
  warn: '#F2B84B',
  warnSoft: '#33290F',
  /** "Ink": text/shapes that sit on top of the green accent. */
  black: '#0F0F0F',
  white: '#F8F8F8',
  glass: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.18)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const type = {
  hero: { fontSize: 56, fontWeight: '800', letterSpacing: -1.5 },
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '500' },
  bodyStrong: { fontSize: 16, fontWeight: '700' },
  caption: { fontSize: 13, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
} as const;
