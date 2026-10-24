/* ─────────────────────────────────────────────────────────────
   App palette — Light · Dark · PickUp
   Every colour in the app reads from `C`. Switching theme swaps
   the values in place and bumps a version so cached styles rebuild.
   ───────────────────────────────────────────────────────────── */

export type ThemeMode = 'light' | 'dark' | 'pickup';

const light = {
  bg:        '#ffffff',
  card:      '#ffffff',
  surface:   '#f3f4f6',
  surface2:  '#f9fafb',
  border:    '#e5e7eb',
  border2:   '#d1d5db',
  text:      '#111827',
  text2:     '#374151',
  muted:     '#6b7280',
  faint:     '#9ca3af',
  primary:   '#001645',
  onPrimary: '#ffffff',
  accent:    '#001645',
  onAccent:  '#ffffff',
  accentSoft:'#eef2ff',
  dangerBg:  '#fde8e8',

  blueFg: '#1e40af',  blueBg: '#eff6ff',  blueBd: '#93c5fd',
  greenFg: '#166534', greenBg: '#f0fdf4', greenBd: '#86efac',
  amberFg: '#92400e', amberBg: '#fffbeb', amberBd: '#fcd34d',
  purpleFg: '#6b21a8', purpleBg: '#faf5ff', purpleBd: '#d8b4fe',
  tealFg: '#0f766e', tealBg: '#f0fdfa', tealBd: '#5eead4',

  statusBar: 'dark' as 'dark' | 'light',
};

export type Palette = typeof light;

const dark: Palette = {
  bg:        '#0b1220',
  card:      '#121b2e',
  surface:   '#1a2438',
  surface2:  '#151f33',
  border:    '#253049',
  border2:   '#34415e',
  text:      '#f1f5f9',
  text2:     '#cbd5e1',
  muted:     '#94a3b8',
  faint:     '#64748b',
  primary:   '#5b8cff',
  onPrimary: '#ffffff',
  accent:    '#5b8cff',
  onAccent:  '#ffffff',
  accentSoft:'#1c2a4d',
  dangerBg:  '#3b1219',

  blueFg: '#93c5fd',  blueBg: '#172554',  blueBd: '#1e40af',
  greenFg: '#86efac', greenBg: '#052e16', greenBd: '#166534',
  amberFg: '#fcd34d', amberBg: '#3a2304', amberBd: '#92400e',
  purpleFg: '#d8b4fe', purpleBg: '#2e0a4f', purpleBd: '#6b21a8',
  tealFg: '#5eead4', tealBg: '#042f2e', tealBd: '#0f766e',

  statusBar: 'light',
};

const pickup: Palette = {
  bg:        '#ffffff',
  card:      '#ffffff',
  surface:   '#f2f5e8',
  surface2:  '#f8faf1',
  border:    '#e3e9cf',
  border2:   '#cdd6b0',
  text:      '#0b1b3f',
  text2:     '#24345a',
  muted:     '#5b6785',
  faint:     '#8e98ae',
  primary:   '#001645',
  onPrimary: '#ffffff',
  accent:    '#afd43a',
  onAccent:  '#001645',
  accentSoft:'#eef6d4',
  dangerBg:  '#fde8e8',

  blueFg: '#1e40af',  blueBg: '#eff6ff',  blueBd: '#93c5fd',
  greenFg: '#4d6b0f', greenBg: '#f1f8dc', greenBd: '#afd43a',
  amberFg: '#92400e', amberBg: '#fffbeb', amberBd: '#fcd34d',
  purpleFg: '#6b21a8', purpleBg: '#faf5ff', purpleBd: '#d8b4fe',
  tealFg: '#0f766e', tealBg: '#f0fdfa', tealBd: '#5eead4',

  statusBar: 'dark',
};

export const PALETTES: Record<ThemeMode, Palette> = { light, dark, pickup };

/** Live palette — read at render time, never copy into module constants. */
export const C: Palette = { ...light };

let version = 0;
let currentMode: ThemeMode = 'light';

export function applyPalette(mode: ThemeMode) {
  Object.assign(C, PALETTES[mode]);
  currentMode = mode;
  version++;
}
export const getMode = () => currentMode;

/**
 * Wrap anything built from `C` at module level (StyleSheets, colour maps).
 * Rebuilt lazily the first time it's read after a theme change.
 */
export function themed<T extends object>(build: () => T): T {
  let cache: T | null = null;
  let v = -1;
  const get = (): T => {
    if (v !== version || !cache) { cache = applyFonts(build()); v = version; }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, k) => (get() as any)[k],
    has: (_t, k) => k in (get() as any),
    ownKeys: () => Reflect.ownKeys(get() as any),
    getOwnPropertyDescriptor: (_t, k) => {
      const obj = get() as any;
      return k in obj ? { enumerable: true, configurable: true, writable: false, value: obj[k] } : undefined;
    },
  });
}


/* ─────────────────────────────────────────────────────────────
   Typography — Inter for UI, Saira Condensed for scores & headlines.
   Applied automatically to every themed StyleSheet: each text style's
   fontWeight is turned into the matching font file (custom fonts on
   Android ignore fontWeight, so the weight must be in the family name).
   ───────────────────────────────────────────────────────────── */

export const FONTS = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold', extrabold: 'Inter_800ExtraBold', black: 'Inter_900Black',
  display: 'SairaCondensed_800ExtraBold', displayBold: 'SairaCondensed_700Bold', displayBlack: 'SairaCondensed_900Black',
} as const;

const INTER: Record<string, string> = {
  '100': FONTS.regular, '200': FONTS.regular, '300': FONTS.regular, '400': FONTS.regular, normal: FONTS.regular,
  '500': FONTS.medium, '600': FONTS.semibold, '700': FONTS.bold, bold: FONTS.bold,
  '800': FONTS.extrabold, '900': FONTS.black,
};
const SAIRA: Record<string, string> = {
  '700': FONTS.displayBold, bold: FONTS.displayBold, '800': FONTS.display, '900': FONTS.displayBlack,
};

/** Style keys that always use the display face (scores, timers, ranks, big results). */
const DISPLAY_KEYS = /^(boardScore|boardClock|boardSep|score|snScore|scoreText|rankText|rankBig(Text)?|resultTier|levelText|streakNum|bigTitle|stepTitle|qTitle|tierBadgeText|countText|bannerPlayersCount|bannerTitle|title404|d)$/;

function fontFor(key: string, st: any) {
  const w = String(st.fontWeight ?? '400');
  const size = Number(st.fontSize ?? 14);
  const display = DISPLAY_KEYS.test(key) || (size >= 30 && (w === '800' || w === '900' || w === 'bold'));
  if (display) return { family: SAIRA[w] ?? FONTS.display, display: true };
  return { family: INTER[w] ?? FONTS.regular, display: false };
}

function applyFonts<T>(sheet: T): T {
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return sheet;
  const out: any = {};
  for (const [k, st] of Object.entries(sheet as any)) {
    if (st && typeof st === 'object' && !Array.isArray(st) && ('fontSize' in st || 'fontWeight' in st) && !('fontFamily' in st)) {
      const { family, display } = fontFor(k, st);
      const { fontWeight, ...rest } = st as any;
      out[k] = {
        ...rest,
        fontFamily: family,
        ...(display ? { fontVariant: ['tabular-nums'], letterSpacing: (rest.letterSpacing ?? 0) + 0.2 } : {}),
      };
    } else {
      out[k] = st;
    }
  }
  return out;
}
