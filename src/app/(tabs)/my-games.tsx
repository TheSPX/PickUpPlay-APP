import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader';
import AppIcon from '../../components/AppIcon';
import { useAuth } from '../../lib/auth';
import { GAME_VISIBLE_MS, formatWhen, Skill, Sport, SPORT_LABEL, SKILL_ICON, SKILL_COLOR, fromDbSkill } from '../../lib/constants';

const SPORT_ICON: Record<Sport, string> = {
  football: 'football-outline',
  padel: 'tennisball-outline',
  basketball: 'basketball-outline',
  badminton: 'medal-outline',
  billiards: 'billiards-8',
};
import { supabase } from '../../lib/supabase';
import { unreadCounts } from '../../lib/chatSeen';
import { theme } from '../../lib/theme';
import { C, themed } from '../../lib/palette';

type MyGame = {
  id: string;
  sport: Sport;
  starts_at: string;
  min_skill: Skill;
  max_skill: Skill;
  capacity: number;
  players?: number;
  status: string;
  host_id: string;
  courts: { name: string } | null;
};

// App palette sport accents
const SPORT_ACCENT: Record<Sport, string> = themed(() => ({
  football:   C.blueFg,
  padel:      C.greenFg,
  basketball: C.amberFg,
  badminton:  C.purpleFg,
  billiards: C.tealFg,
}));

// Muted light tints derived from palette
const SPORT_TINT: Record<Sport, string> = themed(() => ({
  football:   C.blueBg,
  padel:      C.greenBg,
  basketball: C.amberBg,
  badminton:  C.purpleBg,
  billiards: C.tealBg,
}));

export default function MyGames() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();

  const [games, setGames]       = useState<MyGame[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [unread, setUnread]     = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!uid) return;
    const { data, error: err } = await supabase
      .from('game_players')
      .select('games(id, sport, starts_at, min_skill, max_skill, capacity, status, host_id, courts(name))')
      .eq('user_id', uid);

    if (err) { setError(err.message); return; }
    setError(null);
    const now = Date.now();
    const list = (data ?? [])
      .map((r: any) => {
        const g = r.games as any;
        return g ? { ...g, min_skill: fromDbSkill(g.min_skill), max_skill: fromDbSkill(g.max_skill) } as MyGame : null;
      })
      .filter((g): g is MyGame => !!g && g.status === 'open' && new Date(g.starts_at).getTime() > now - GAME_VISIBLE_MS)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    setGames(list);
    setUnread(await unreadCounts(list.map((g) => g.id), uid));
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  async function run(fn: 'leave_game' | 'cancel_game', id: string) {
    setBusyId(id);
    const { error: err } = await supabase.rpc(fn, { p_game_id: id });
    setBusyId(null);
    if (err) Alert.alert('Something went wrong', err.message);
    await load();
  }

  function confirm(g: MyGame) {
    const hosting = g.host_id === uid;
    Alert.alert(
      hosting ? 'Cancel this game?' : 'Leave this game?',
      hosting ? 'It will disappear for everyone.' : 'Your spot will open up for others.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => run(hosting ? 'cancel_game' : 'leave_game', g.id) },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
    <ScreenHeader title="My Games" />
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={games}
      keyExtractor={(g) => g.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          colors={[C.primary]}
          tintColor={C.primary}
        />
      }
      ListHeaderComponent={
        <View>
          {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Ionicons name="flag-outline" size={48} color={C.border2} />
          <Text style={styles.emptyTitle}>No upcoming games</Text>
          <Text style={styles.emptyHint}>Join a game to see it here.</Text>
        </View>
      }
      renderItem={({ item: g }) => {
        const hosting = g.host_id === uid;
        const accent  = SPORT_ACCENT[g.sport];
        const tint    = SPORT_TINT[g.sport];

        return (
          <Pressable style={styles.card} onPress={() => router.push(`/game/${g.id}` as any)}>
            {/* Left sport color bar */}
            <View style={[styles.colorBar, { backgroundColor: accent }]} />

            <View style={styles.cardBody}>
              {/* Top row: title + sport badge */}
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{SPORT_LABEL[g.sport]} Match</Text>
                <View style={styles.iconBadges}>
                  <View style={[styles.sportBadge, { backgroundColor: tint }]}>
                    <AppIcon name={SPORT_ICON[g.sport] as any} size={16} color={accent} />
                  </View>
                  <View style={[styles.sportBadge, { backgroundColor: SKILL_COLOR[g.min_skill].bg, borderWidth: 1, borderColor: SKILL_COLOR[g.min_skill].border, flexDirection: 'row', gap: 3 }]}>
                    <Ionicons name={SKILL_ICON[g.min_skill] as any} size={14} color={SKILL_COLOR[g.min_skill].text} />
                    {g.min_skill !== g.max_skill && (
                      <>
                        <Ionicons name="arrow-forward-outline" size={10} color={SKILL_COLOR[g.min_skill].text} />
                        <Ionicons name={SKILL_ICON[g.max_skill] as any} size={14} color={SKILL_COLOR[g.max_skill].text} />
                      </>
                    )}
                  </View>
                </View>
              </View>

              {/* Venue */}
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color={C.faint} style={{ marginRight: 4 }} />
                <Text style={styles.metaText}>{g.courts?.name ?? 'NJUPT'}</Text>
              </View>

              {/* Time */}
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={13} color={C.faint} style={{ marginRight: 4 }} />
                <Text style={styles.metaText}>{formatWhen(g.starts_at)}</Text>
              </View>

              <View style={styles.divider} />

              {/* Bottom row: host badge + action */}
              <View style={styles.cardBottomRow}>
                {(unread[g.id] ?? 0) > 0 && (
                  <View style={styles.chatBadge}>
                    <Ionicons name="chatbubble" size={11} color={C.onPrimary} style={{ marginRight: 4 }} />
                    <Text style={styles.chatBadgeText}>{unread[g.id] > 9 ? '9+' : unread[g.id]} new</Text>
                  </View>
                )}
                {hosting && (
                  <View style={styles.hostBadge}>
                    <Ionicons name="star" size={11} color={C.primary} style={{ marginRight: 3 }} />
                    <Text style={styles.hostBadgeText}>Host</Text>
                  </View>
                )}
                <Pressable
                  style={[styles.actionBtn, hosting ? styles.cancelBtn : styles.leaveBtn]}
                  disabled={busyId === g.id}
                  onPress={(e) => { e.stopPropagation?.(); confirm(g); }}
                >
                  {busyId === g.id ? (
                    <ActivityIndicator color={hosting ? C.onPrimary : C.text} size="small" />
                  ) : (
                    <Text style={[styles.actionBtnText, hosting && { color: C.onPrimary }]}>
                      {hosting ? 'Cancel' : 'Leave'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.surface },
  content: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 40 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface },

  headerBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  errorText:   { color: theme.colors.danger, marginBottom: 12, fontSize: 14 },

  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#001645',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  colorBar: { width: 5 },
  cardBody: { flex: 1, padding: 14 },

  cardTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  iconBadges: { flexDirection: 'row', gap: 6 },
  sportBadge: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  sportBadgeText: { fontSize: 11, fontWeight: '700' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  metaText: { fontSize: 13, color: C.muted },

  divider: { height: 1, backgroundColor: C.surface, marginVertical: 10 },

  cardBottomRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 8,
  },
  hostBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, marginRight: 'auto',
  },
  chatBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  chatBadgeText: { fontSize: 11, fontWeight: '800', color: C.onPrimary },
  hostBadgeText: { fontSize: 11, fontWeight: '700', color: C.primary },

  actionBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, alignItems: 'center',
  },
  leaveBtn:      { backgroundColor: C.surface },
  cancelBtn:     { backgroundColor: C.primary },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: C.text },

  emptyBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 12 },
  emptyHint:  { fontSize: 14, color: C.faint, textAlign: 'center' },
}));
