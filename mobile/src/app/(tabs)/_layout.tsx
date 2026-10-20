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
  Pressable,
} from 'react-native';
import { useRef, useState } from 'react';
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

export default function TabsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: C.text,
          tabBarInactiveTintColor: C.faint,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        {/* 1 — Home */}
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
                {focused && <View style={styles.dot} />}
              </View>
            ),
          }}
        />

        {/* 2 — Search */}
        <Tabs.Screen
          name="search"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} />
                {focused && <View style={styles.dot} />}
              </View>
            ),
          }}
        />

        {/* 3 — Create: custom button lifted above bar */}
        <Tabs.Screen
          name="create"
          options={{
            tabBarIcon: () => null,
            tabBarButton: () => (
              <View style={styles.addTabOuter} pointerEvents="box-none">
                {/* white underlay ring — same colour as the bar, so the button looks cut into it */}
                <View style={styles.addRing} pointerEvents="box-none">
                  <TouchableOpacity
                    style={[styles.addCircle, menuOpen && styles.addCircleOpen]}
                    activeOpacity={0.85}
                    onPress={() => setMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Create"
                  >
                    <Ionicons
                      name="add"
                      size={30}
                      color={menuOpen ? C.onPrimary : C.onAccent}
                      style={{ transform: [{ rotate: menuOpen ? '45deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ),
          }}
        />

        {/* 4 — My Games */}
        <Tabs.Screen
          name="my-games"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
                {focused && <View style={styles.dot} />}
              </View>
            ),
          }}
        />

        {/* 5 — Profile */}
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrap}>
                <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
                {focused && <View style={styles.dot} />}
              </View>
            ),
          }}
        />
      </Tabs>

      <ActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const CIRCLE = 52;
const BAR_H = 60;
const RING = CIRCLE + 14; // white underlay around the button

const styles = themed(() => StyleSheet.create({
  tabBar: {
    backgroundColor: C.card,
    borderTopWidth: 0,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    height: BAR_H,
    paddingBottom: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
    overflow: 'visible',     // let the circle poke above
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: BAR_H,
    paddingVertical: 0,
    minWidth: 0,
    overflow: 'visible',
  },
  iconWrap: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -12,
  },
  dot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  // + slot: same flex as the other tabs; the ring floats centred above the bar top
  addTabOuter: {
    flex: 1,
    height: BAR_H,
    alignItems: 'center',
    overflow: 'visible',
  },
  addRing: {
    position: 'absolute',
    top: -RING / 2 + 6,              // centre sits just above the bar's top edge
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    backgroundColor: C.card,         // underlay matches the bar → seamless cut-out
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 6,
  },
  addCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#001645',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  addCircleOpen: {
    backgroundColor: C.primary,
  },
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
