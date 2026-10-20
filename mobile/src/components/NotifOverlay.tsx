import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, themed } from '../lib/palette';

/* ── Types ── */
export type NotifType = 'new_match' | 'player_activity' | 'reminder' | 'app_notice';

export type Notif = {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: string;       // display string e.g. "Just now", "2h ago"
  read: boolean;
  game_id?: string;   // if set, tapping opens that game
};

/* ── Mock data — replace with real fetch later ── */
export const MOCK_NOTIFS: Notif[] = [
  {
    id: '1',
    type: 'new_match',
    title: 'New Football game added',
    body: 'East Football Field · Today at 5:00 PM · 3 spots left',
    time: 'Just now',
    read: false,
    game_id: 'mock-game-1',   // replace with real game_id in production
  },
  {
    id: '2',
    type: 'player_activity',
    title: 'Ahmed joined your game',
    body: 'Your Padel match tomorrow at 4 PM now has 3 players. 2 spots left.',
    time: '14m ago',
    read: false,
    game_id: 'mock-game-2',
  },
  {
    id: '3',
    type: 'reminder',
    title: 'Your match starts in 1 hour',
    body: 'Basketball · East Court · Today at 3:00 PM. Don\'t be late!',
    time: '1h ago',
    read: true,
    game_id: 'mock-game-3',
  },
  {
    id: '4',
    type: 'player_activity',
    title: 'Your game is almost full',
    body: 'Only 1 spot left in your Football match at North Stadium.',
    time: '2h ago',
    read: true,
    game_id: 'mock-game-4',
  },
  {
    id: '5',
    type: 'app_notice',
    title: 'Training sessions coming soon',
    body: 'Book solo or group training slots directly in the app. Stay tuned!',
    time: 'Yesterday',
    read: true,
    // no game_id — app notices don't link to a game
  },
  {
    id: '6',
    type: 'app_notice',
    title: 'Tournaments feature in progress',
    body: 'Organized bracket tournaments for all sports are on the way.',
    time: '3 days ago',
    read: true,
  },
];

/* ── Config per type ── */
const TYPE_CONFIG: Record<NotifType, { icon: string; color: string; bg: string; label: string }> = themed(() => ({
  new_match:       { icon: 'add-circle-outline',   color: C.greenFg, bg: C.greenBg, label: 'New Match'   },
  player_activity: { icon: 'people-outline',        color: C.blueFg, bg: C.blueBg, label: 'Activity'    },
  reminder:        { icon: 'alarm-outline',          color: C.amberFg, bg: C.amberBg, label: 'Reminder'    },
  app_notice:      { icon: 'megaphone-outline',      color: C.primary, bg: C.surface, label: 'Notice'      },
}));

/* ── Props ── */
type Props = {
  visible: boolean;
  onClose: () => void;
  notifs: Notif[];
  onMarkRead?: (id: string) => void;
};

export default function NotifOverlay({ visible, onClose, notifs, onMarkRead }: Props) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(-40);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Notifications</Text>
            {unread > 0 && (
              <Text style={styles.panelSub}>{unread} unread</Text>
            )}
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={C.muted} />
          </Pressable>
        </View>

        <View style={styles.panelDivider} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {notifs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="notifications-off-outline" size={40} color={C.border2} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          ) : (
            notifs.map((n, i) => {
              const cfg = TYPE_CONFIG[n.type];
              const tappable = !!n.game_id;
              return (
                <View key={n.id}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.notifRow,
                      !n.read && styles.notifRowUnread,
                      tappable && pressed && styles.notifRowPressed,
                    ]}
                    onPress={() => {
                      if (!n.game_id) return;
                      onMarkRead?.(n.id);
                      onClose();
                      // small delay so the modal closes before pushing
                      setTimeout(() => router.push(`/game/${n.game_id}` as any), 180);
                    }}
                    disabled={!tappable}
                  >
                    {/* Icon */}
                    <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                    </View>

                    {/* Content */}
                    <View style={styles.notifContent}>
                      <View style={styles.notifTopRow}>
                        <View style={[styles.typePill, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.typePillText, { color: cfg.color }]}>
                            {cfg.label}
                          </Text>
                        </View>
                        <Text style={styles.notifTime}>{n.time}</Text>
                      </View>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                    </View>

                    {/* Right side */}
                    <View style={styles.notifRight}>
                      {!n.read && <View style={styles.unreadDot} />}
                      {tappable && (
                        <Ionicons name="chevron-forward" size={14} color={C.border2} style={{ marginTop: n.read ? 0 : 6 }} />
                      )}
                    </View>
                  </Pressable>
                  {i < notifs.length - 1 && <View style={styles.rowDivider} />}
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  panel: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    maxHeight: 480,
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#001645',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },

  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  panelTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  panelSub:   { fontSize: 12, color: C.faint, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  panelDivider: { height: 1, backgroundColor: C.surface },

  list: { paddingBottom: 8 },

  notifRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'flex-start',
    gap: 12,
  },
  notifRowUnread: { backgroundColor: C.surface2 },

  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  notifContent: { flex: 1 },
  notifTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },

  typePill: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8,
  },
  typePillText: { fontSize: 10, fontWeight: '700' },
  notifTime:    { fontSize: 11, color: C.faint },

  notifTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  notifBody:  { fontSize: 12, color: C.muted, lineHeight: 17 },

  notifRowPressed: { backgroundColor: C.surface },
  notifRight: { alignItems: 'center', gap: 4, flexShrink: 0 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.primary,
    flexShrink: 0,
  },

  rowDivider: { height: 1, backgroundColor: C.surface, marginLeft: 72 },

  emptyBox:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: C.faint, fontWeight: '600' },
}));
