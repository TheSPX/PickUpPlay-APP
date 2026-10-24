import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Animated,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, themed } from '../../lib/palette';

function ActionMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  if (visible) {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  const close = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.85, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const actions = [
    {
      icon: 'add-circle-outline' as const,
      label: 'Create a Game',
      sub: 'Set up your own match',
      color: C.primary,
      onPress: () => { close(); setTimeout(() => router.push('/(tabs)/create'), 200); },
    },
    {
      icon: 'trophy-outline' as const,
      label: 'Join a Tournament',
      sub: 'Compete for the top spot',
      color: C.amberFg,
      onPress: () => { close(); },
    },
    {
      icon: 'people-outline' as const,
      label: 'Join a Game',
      sub: 'Find an open match near you',
      color: C.greenFg,
      onPress: () => { close(); setTimeout(() => router.push('/(tabs)/search'), 200); },
    },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={menuStyles.backdrop} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[menuStyles.sheet, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
        pointerEvents="box-none"
      >
        <View style={menuStyles.handle} />
        <Text style={menuStyles.title}>What would you like to do?</Text>
        {actions.map((a, i) => (
          <TouchableOpacity key={i} style={menuStyles.row} activeOpacity={0.75} onPress={a.onPress}>
            <View style={[menuStyles.iconCircle, { backgroundColor: a.color + '18' }]}>
              <Ionicons name={a.icon} size={26} color={a.color} />
            </View>
            <View style={menuStyles.rowText}>
              <Text style={menuStyles.rowLabel}>{a.label}</Text>
              <Text style={menuStyles.rowSub}>{a.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.faint} />
          </TouchableOpacity>
        ))}
        <Pressable style={menuStyles.cancelBtn} onPress={close}>
          <Text style={menuStyles.cancelText}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'home' },
  search: { label: 'Explore', icon: 'compass' },
  'my-games': { label: 'My Games', icon: 'time' },
  profile: { label: 'Profile', icon: 'person' },
};

/* Floating pill tab bar — a soft highlight pill slides behind the active tab. */
function PillTabBar({ state, navigation, menuOpen, onCreate }: any) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const x = useRef(new Animated.Value(0)).current;
  const createIdx = state.routes.findIndex((r: any) => r.name === 'create');
  const onCreateTab = state.index === createIdx;

  useEffect(() => {
    if (!slot || onCreateTab) return;
    Animated.spring(x, { toValue: state.index * slot, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [state.index, slot]);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar} onLayout={(e) => setW(e.nativeEvent.layout.width - PAD * 2)}>
        {slot > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pill, { width: slot - 6, opacity: onCreateTab ? 0 : 1, transform: [{ translateX: x }] }]}
          />
        )}
        {state.routes.map((route: any, i: number) => {
          if (route.name === 'create') {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable
                  style={[styles.add, menuOpen && styles.addOpen]}
                  scaleTo={0.88}
                  haptic="medium"
                  onPress={onCreate}
                  accessibilityRole="button"
                  accessibilityLabel="Create"
                >
                  <Ionicons
                    name="add" size={28}
                    color={menuOpen ? C.onPrimary : C.onAccent}
                    style={{ transform: [{ rotate: menuOpen ? '45deg' : '0deg' }] }}
                  />
                </Pressable>
              </View>
            );
          }
          const meta = TABS[route.name] ?? { label: route.name, icon: 'ellipse' };
          const focused = state.index === i;
          const color = focused ? C.text : C.faint;
          return (
            <Pressable
              key={route.key}
              style={styles.slot}
              scaleTo={0.9}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <Ionicons name={(focused ? meta.icon : `${meta.icon}-outline`) as any} size={22} color={color} />
              <Text style={[styles.label, { color }, focused && styles.labelOn]} numberOfLines={1}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <PillTabBar {...props} menuOpen={menuOpen} onCreate={() => setMenuOpen(true)} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="create" />
        <Tabs.Screen name="my-games" />
        <Tabs.Screen name="profile" />
      </Tabs>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const BAR_H = 64;
const PAD = 6;
const ADD = 48;

const styles = themed(() => StyleSheet.create({
  wrap: { backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 6 },
  bar: {
    flexDirection: 'row',
    height: BAR_H,
    paddingHorizontal: PAD,
    borderRadius: BAR_H / 2,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  pill: {
    position: 'absolute',
    left: PAD + 3,
    top: 6,
    bottom: 6,
    borderRadius: (BAR_H - 12) / 2,
    backgroundColor: C.accentSoft,
  },
  slot: { flex: 1, height: BAR_H, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontWeight: '600' },
  labelOn: { fontWeight: '800' },
  add: {
    width: ADD,
    height: ADD,
    borderRadius: ADD / 2,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#001645',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  addOpen: { backgroundColor: C.primary },
}));


const menuStyles = themed(() => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: C.card,
    borderRadius: 24,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: C.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
    gap: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 13,
    color: C.muted,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.muted,
  },
}));
