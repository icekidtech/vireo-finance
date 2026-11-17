/**
 * Design tokens. Visual language borrowed from Cash App: a white canvas, black
 * type, one saturated green accent, oversized numerals and pill-shaped actions.
 */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F4F4F5',
  surfaceStrong: '#E9E9EB',
  text: '#000000',
  textMuted: '#6B6B70',
  textFaint: '#A1A1A6',
  border: '#E5E5E7',
  accent: '#00D64F',
  accentDark: '#00A23C',
  accentSoft: '#E3FBEB',
  danger: '#E5322D',
  dangerSoft: '#FDE9E8',
  warn: '#B26A00',
  warnSoft: '#FFF3DC',
  black: '#000000',
  white: '#FFFFFF',
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
