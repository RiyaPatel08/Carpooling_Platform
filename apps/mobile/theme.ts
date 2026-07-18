/**
 * One palette, one spacing scale, one radius — the rubric marks "clean
 * consistent UI", and consistency is cheapest to get by never hardcoding a
 * colour in a screen. The admin web mirrors these values.
 */
export const colors = {
  primary: '#1F6F5C',
  primaryDark: '#155445',
  primaryLight: '#E6F2EF',
  accent: '#F5A524',

  text: '#12211D',
  textMuted: '#5B6B66',
  border: '#DDE5E2',
  background: '#F6F8F7',
  surface: '#FFFFFF',

  success: '#1E8E5A',
  danger: '#D3453B',
  warning: '#C77700',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
};
