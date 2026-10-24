import { useColorScheme } from 'react-native';

export const theme = {
  colors: {
    navy: '#001A4D',
    navyDark: '#001033',
    primary: '#1E2022',
    primaryDark: '#ffffff',
    background: '#ffffff',
    backgroundDark: '#121212',
    card: '#ffffff',
    cardDark: '#1e1e1e',
    text: '#111827',
    textDark: '#f9fafb',
    subtext: '#6b7280',
    subtextDark: '#9ca3af',
    border: '#e5e7eb',
    borderDark: '#374151',
    danger: '#b00020',
    success: '#2b580c',
    successBg: '#e2f0cb',
    errorBg: '#fde8e8',
    tint: '#001A4D',
    inputBg: '#f9fafb',
    badgeRed: '#e63946',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 20,
    xl: 24,
  },
  fontSizes: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 24,
    xxl: 28,
  },
  borderRadius: {
    sm: 10,
    md: 16,
    lg: 24,
    pill: 30,
  },
};

export function useThemeColors() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    isDark,
    background: isDark ? theme.colors.backgroundDark : theme.colors.background,
    card: isDark ? theme.colors.cardDark : theme.colors.card,
    text: isDark ? theme.colors.textDark : theme.colors.text,
    subtext: isDark ? theme.colors.subtextDark : theme.colors.subtext,
    border: isDark ? theme.colors.borderDark : theme.colors.border,
    primary: isDark ? theme.colors.primaryDark : theme.colors.primary,
    navy: theme.colors.navy,
  };
}
