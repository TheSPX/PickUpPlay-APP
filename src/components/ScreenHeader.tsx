import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from './PressableScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, themed } from '../lib/palette';

/* One fixed title bar for every screen — sits above the scrolling content,
   so it never scrolls away. Same back button colour everywhere. */
type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;      // default: router.back()
  hideBack?: boolean;
};

export default function ScreenHeader({ title, subtitle, right, onBack, hideBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      {!hideBack && (
        <Pressable
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
          onPress={onBack ?? (() => router.back())}
          hitSlop={8}
          scaleTo={0.88}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </Pressable>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: C.bg,
    borderBottomWidth: 1, borderBottomColor: C.border,
    zIndex: 10,
  },
  back: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  sub:   { fontSize: 13, color: C.muted, marginTop: 1 },
}));
