import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { applyPalette, C, ThemeMode } from './palette';

const KEY = 'app_theme_mode';

type Ctx = { mode: ThemeMode; setMode: (m: ThemeMode) => void; ready: boolean };
const ThemeCtx = createContext<Ctx>({ mode: 'light', setMode: () => {}, ready: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(KEY)) as ThemeMode | null;
        if (saved === 'light' || saved === 'dark' || saved === 'pickup') {
          applyPalette(saved);
          setModeState(saved);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    applyPalette(m);
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  return <ThemeCtx.Provider value={{ mode, setMode, ready }}>{children}</ThemeCtx.Provider>;
}

/** `mode` changes trigger a re-render; colours live in `C`. */
export function useTheme() {
  const ctx = useContext(ThemeCtx);
  return { ...ctx, C };
}
