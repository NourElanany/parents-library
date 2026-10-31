export type ThemeId = 'sepia' | 'softWhite' | 'mint' | 'candle' | 'dark' | 'lavender';

export interface ReaderTheme {
  id: ThemeId;
  name: string;
  badge: string;
  bg: string;
  paperBg: string;
  headerBg: string;
  textColor: string;
  subTextColor: string;
  buttonBg: string;
  buttonText: string;
  accent: string;
  canvasFilter: string;
}

export const THEMES: Record<ThemeId, ReaderTheme> = {
  sepia: {
    id: 'sepia',
    name: 'ورق دافئ (سيبيا كلاسيكي)',
    badge: 'الأفضل نهاراً',
    bg: '#f4ecd8',
    paperBg: '#fcf8ec',
    headerBg: '#eae0c8',
    textColor: '#292524',
    subTextColor: '#78716c',
    buttonBg: '#854d0e',
    buttonText: '#fef08a',
    accent: '#b45309',
    canvasFilter: 'sepia(35%) contrast(95%) brightness(96%)',
  },
  softWhite: {
    id: 'softWhite',
    name: 'أبيض هادئ (مخفف السطوع)',
    badge: 'طبيعي ومريح',
    bg: '#f5f5f4',
    paperBg: '#ffffff',
    headerBg: '#e7e5e4',
    textColor: '#1c1917',
    subTextColor: '#57534e',
    buttonBg: '#2563eb',
    buttonText: '#ffffff',
    accent: '#1d4ed8',
    canvasFilter: 'brightness(96%) contrast(97%)',
  },
  mint: {
    id: 'mint',
    name: 'نعناع طبي ومريح',
    badge: 'يقلل إجهاد العين',
    bg: '#e8f5e9',
    paperBg: '#f1f8e9',
    headerBg: '#c8e6c9',
    textColor: '#14532d',
    subTextColor: '#166534',
    buttonBg: '#15803d',
    buttonText: '#dcfce7',
    accent: '#047857',
    canvasFilter: 'hue-rotate(50deg) sepia(20%) brightness(96%)',
  },
  candle: {
    id: 'candle',
    name: 'ضوء الشمعة (أصفر مسائي)',
    badge: 'حماية من الضوء الأزرق',
    bg: '#fef3c7',
    paperBg: '#fffbeb',
    headerBg: '#fde68a',
    textColor: '#451a03',
    subTextColor: '#92400e',
    buttonBg: '#b45309',
    buttonText: '#ffffff',
    accent: '#d97706',
    canvasFilter: 'sepia(65%) saturate(130%) brightness(92%)',
  },
  lavender: {
    id: 'lavender',
    name: 'لافندر ناعم (بنفسجي)',
    badge: 'استرخاء وهدوء',
    bg: '#f3e8ff',
    paperBg: '#faf5ff',
    headerBg: '#e9d5ff',
    textColor: '#3b0764',
    subTextColor: '#6b21a8',
    buttonBg: '#7e22ce',
    buttonText: '#ffffff',
    accent: '#9333ea',
    canvasFilter: 'hue-rotate(240deg) sepia(20%) brightness(96%)',
  },
  dark: {
    id: 'dark',
    name: 'ليلي مهدئ (رمادي غامق)',
    badge: 'للقراءة في الظلام',
    bg: '#18181b',
    paperBg: '#27272a',
    headerBg: '#27272a',
    textColor: '#f4f4f5',
    subTextColor: '#a1a1aa',
    buttonBg: '#3f3f46',
    buttonText: '#ffffff',
    accent: '#f59e0b',
    canvasFilter: 'invert(90%) hue-rotate(180deg) brightness(85%) contrast(90%)',
  },
};
