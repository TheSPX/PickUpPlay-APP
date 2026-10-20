import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/themeContext';
import LoadingScreen from '../components/LoadingScreen';
import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';
import { registerForPush } from '../lib/push';

function Gate() {
  const { session, loading } = useAuth();
  const { mode, ready, C: pal } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  // Splash: show at least MIN_SPLASH_MS on app start, then fade out
  const MIN_SPLASH_MS = 1800;
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // Latest route segments without re-running the gate on every navigation
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // The user id we already routed for — never re-check for the same user
  const checkedForUser = useRef<string | null>(null);

  const uid = session?.user.id ?? null;

  useEffect(() => {
    if (loading) return;
    const seg = segmentsRef.current;
    const inAuthGroup = seg[0] === '(auth)';

    // Signed out → sign-in screen
    if (!uid) {
      checkedForUser.current = null;
      if (!inAuthGroup) router.replace('/sign-in');
      return;
    }

    // Signed in → check onboarding once per user, then route
    if (checkedForUser.current === uid) return;
    checkedForUser.current = uid;

    setCheckingOnboarding(true);
    supabase
      .from('profiles')
      .select('onboarding_done')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        setCheckingOnboarding(false);
        const nowSeg = segmentsRef.current;
        if (!data?.onboarding_done) {
          if (nowSeg[0] !== 'onboarding') router.replace('/onboarding');
        } else if (nowSeg[0] === '(auth)') {
          // just signed in / up → straight to home, no refresh needed
          router.replace('/');
        }
      });
  }, [uid, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register this phone for push once per signed-in user
  useEffect(() => {
    if (uid) registerForPush(uid);
  }, [uid]);

  // Tapping a notification opens its game
  useEffect(() => {
    const open = (n: Notifications.Notification | undefined) => {
      const gameId = (n?.request.content.data as any)?.gameId;
      if (gameId) router.push(`/game/${gameId}` as any);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => open(r?.notification));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showSplash = loading || checkingOnboarding || !ready || !minSplashDone;

  // Fade the splash out once everything is ready (first launch only)
  useEffect(() => {
    if (showSplash || splashGone) return;
    Animated.timing(splashOpacity, { toValue: 0, duration: 350, useNativeDriver: true })
      .start(() => setSplashGone(true));
  }, [showSplash]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Stack must stay mounted while we check — otherwise router.replace()
  // fires with no navigator and the user is stuck until a refresh.
  return (
    <View style={{ flex: 1, backgroundColor: pal.bg }}>
      <StatusBar barStyle={pal.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      {ready && (
        /* key={mode}: remount screens so every colour re-reads the new palette */
        <Stack key={mode} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: pal.bg } }} />
      )}
      {!splashGone && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]} pointerEvents={showSplash ? 'auto' : 'none'}>
          <LoadingScreen />
        </Animated.View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}
