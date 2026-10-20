import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppIcon from '../../components/AppIcon';

import { supabase } from '../../lib/supabase';
import { formatWhen, SPORT_LABEL, SKILL_COLOR, SKILL_ICON, Sport, Skill, fromDbSkill } from '../../lib/constants';
import { C, themed } from '../../lib/palette';

/* ─── Filter types ─────────────────────────────────────────── */
type GameType = 'all' | 'game' | 'tournament' | 'training';

const TYPE_OPTIONS: { key: GameType; label: string; icon: string; disabled?: boolean }[] = [
  { key: 'all',        label: 'All',         icon: 'grid-outline'     },
  { key: 'game',       label: 'Games',       icon: 'football-outline' },
  { key: 'tournament', label: 'Tournaments', icon: 'trophy-outline',  disabled: true },
  { key: 'training',   label: 'Training',    icon: 'barbell-outline', disabled: true },
];

const SPORT_OPTIONS: { key: Sport | 'all'; label: string; icon: string }[] = [
  { key: 'all',        label: 'All',        icon: 'apps-outline'       },
  { key: 'football',   label: 'Football',   icon: 'football-outline'   },
  { key: 'padel',      label: 'Padel',      icon: 'tennisball-outline' },
  { key: 'basketball', label: 'Basketball', icon: 'basketball-outline' },
  { key: 'badminton',  label: 'Badminton',  icon: 'medal-outline'      },
  { key: 'billiards',  label: 'Billiards',  icon: 'billiards-8' },
];

// App palette sport accents
const SPORT_ACCENT: Record<Sport, string> = themed(() => ({
  football:   C.blueFg,
  padel:      C.greenFg,
  basketball: C.amberFg,
  badminton:  C.purpleFg,
  billiards: C.tealFg,
}));

const SPORT_TINT: Record<Sport, string> = themed(() => ({
  football:   C.blueBg,
  padel:      C.greenBg,
  basketball: C.amberBg,
  badminton:  C.purpleBg,
  billiards: C.tealBg,
}));

type GameRow = {
  id: string;
  sport: Sport;
  starts_at: string;
  capacity: number;
  status: 'open' | 'cancelled';
  min_skill: Skill;
  max_skill: Skill;
  courts: { name: string } | null;
  player_count: number;
};

export default function SearchScreen() {
  const router = useRouter();
  const [games, setGames]             = useState<GameRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [typeFilter, setTypeFilter]   = useState<GameType>('all');
  const [sportFilter, setSportFilter] = useState<Sport | 'all'>('all');
  const [search, setSearch]           = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data } = await supabase
      .from('games')
      .select('id, sport, starts_at, capacity, status, min_skill, max_skill, courts(name)')
      .eq('status', 'open')
      .order('starts_at', { ascending: true });

    if (!data) { setLoading(false); setRefreshing(false); return; }

    const ids = data.map((g: any) => g.id);
    const { data: counts } = await supabase
      .from('game_players')
      .select('game_id')
      .in('game_id', ids);

    const countMap: Record<string, number> = {};
    (counts ?? []).forEach((r: any) => {
      countMap[r.game_id] = (countMap[r.game_id] ?? 0) + 1;
    });

    setGames(
      (data as any[]).map((g) => ({
        ...g,
        min_skill: fromDbSkill(g.min_skill),
        max_skill: fromDbSkill(g.max_skill),
        player_count: countMap[g.id] ?? 0,
      }))
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /* ── Filters ── */
  const filtered = games.filter((g) => {
    if (sportFilter !== 'all' && g.sport !== sportFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const court = g.courts?.name?.toLowerCase() ?? '';
      if (!court.includes(q) && !SPORT_LABEL[g.sport].toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ── Render row ── */
  const renderItem = ({ item }: { item: GameRow }) => {
    const startDate = new Date(item.starts_at);
    const isToday   = startDate.toDateString() === new Date().toDateString();
    const timeStr   = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateLabel = isToday ? `Today · ${timeStr}` : formatWhen(item.starts_at);
    const accent    = SPORT_ACCENT[item.sport] ?? C.primary;
    const tint      = SPORT_TINT[item.sport]   ?? C.surface;
    const spotsLeft = item.capacity - item.player_count;
    const isSingle  = item.min_skill === item.max_skill;
    const skillCol  = SKILL_COLOR[item.min_skill];

    // spots color — stays within palette feel
    const spotsColor = spotsLeft === 0 ? '#b91c1c' : spotsLeft <= 2 ? C.amberFg : C.greenFg;

    return (
      <Pressable style={styles.row} onPress={() => router.push(`/game/${item.id}` as any)}>
        {/* Sport color bar */}
        <View style={[styles.rowBar, { backgroundColor: accent }]} />

        {/* Sport icon circle */}
        <View style={[styles.sportCircle, { backgroundColor: tint }]}>
          <AppIcon
            name={SPORT_OPTIONS.find(s => s.key === item.sport)?.icon as any ?? 'apps-outline'}
            size={20}
            color={accent}
          />
        </View>

        {/* Middle: title + meta */}
        <View style={styles.rowLeft}>
          <Text style={[styles.rowTitle, { color: accent }]}>
            {SPORT_LABEL[item.sport]} Match
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={C.faint} style={{ marginRight: 3 }} />
            <Text style={styles.metaText} numberOfLines={1}>{item.courts?.name ?? 'NJUPT'}</Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={C.faint} style={{ marginRight: 3 }} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>

          {/* Skill badge */}
          <View style={[styles.skillPill, { backgroundColor: skillCol.bg, borderColor: skillCol.border }]}>
            <Ionicons name={SKILL_ICON[item.min_skill] as any} size={14} color={skillCol.text} />
            {!isSingle && (
              <>
                <Ionicons name="arrow-forward-outline" size={8} color={skillCol.text} style={{ opacity: 0.6 }} />
                <Ionicons name={SKILL_ICON[item.max_skill] as any} size={14} color={SKILL_COLOR[item.max_skill].text} />
              </>
            )}
          </View>
        </View>

        {/* Right: player count + spots */}
        <View style={styles.rowRight}>
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{String(item.player_count).padStart(2, '0')}</Text>
            <Text style={styles.countDivider}>/</Text>
            <Text style={styles.countCap}>{String(item.capacity).padStart(2, '0')}</Text>
          </View>
          <Text style={[styles.spotsLabel, { color: spotsColor }]}>
            {spotsLeft === 0 ? 'Full' : `${spotsLeft} left`}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.backCircle} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={C.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Find a Game</Text>
          <Text style={styles.headerSub}>
            {filtered.length} {filtered.length === 1 ? 'match' : 'matches'} available
          </Text>
        </View>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.faint} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by sport or location…"
          placeholderTextColor={C.faint}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} style={styles.searchClear}>
            <Ionicons name="close-circle" size={16} color={C.faint} />
          </Pressable>
        )}
      </View>

      {/* ── Type filter ── */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {TYPE_OPTIONS.map((opt) => {
            const on       = typeFilter === opt.key || (opt.key === 'game' && typeFilter === 'all');
            const disabled = opt.disabled;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.filterChip,
                  on && !disabled && styles.filterChipOn,
                  disabled && styles.filterChipDisabled,
                ]}
                onPress={() => { if (disabled) return; setTypeFilter(opt.key === typeFilter ? 'all' : opt.key); }}
              >
                <AppIcon
                  name={opt.icon as any}
                  size={13}
                  color={disabled ? C.faint : on ? C.onPrimary : C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[
                  styles.filterChipText,
                  on && !disabled && styles.filterChipTextOn,
                  disabled && styles.filterChipTextDisabled,
                ]}>
                  {opt.label}
                </Text>
                {disabled && (
                  <View style={styles.soonPill}>
                    <Text style={styles.soonText}>Soon</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Sport filter ── */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Sport</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {SPORT_OPTIONS.map((opt) => {
            const on     = sportFilter === opt.key;
            const accent = opt.key !== 'all' ? SPORT_ACCENT[opt.key as Sport] : C.primary;
            return (
              <Pressable
                key={opt.key}
                style={[styles.filterChip, on && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setSportFilter(opt.key as Sport | 'all')}
              >
                <AppIcon
                  name={opt.icon as any}
                  size={13}
                  color={on ? C.onPrimary : C.muted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.divider} />

      {/* ── Results ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={C.border2} />
          <Text style={styles.emptyTitle}>
            {search.trim() ? `No results for "${search.trim()}"` : 'No matches found'}
          </Text>
          <Text style={styles.emptyHint}>
            {search.trim() ? 'Try a different search term' : 'Try changing the filters above'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(g) => g.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[C.primary]}
              tintColor={C.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.card, paddingTop: 56 },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12, gap: 12,
  },
  backCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 13, color: C.faint, marginTop: 1 },

  /* Search bar */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 12, height: 44,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 0 },
  searchClear: { padding: 4 },

  /* Filter rows */
  filterSection: { paddingHorizontal: 20, marginBottom: 10 },
  filterLabel: {
    fontSize: 11, fontWeight: '700', color: C.faint,
    marginBottom: 8, letterSpacing: 0.6, textTransform: 'uppercase',
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.surface2,
  },
  filterChipOn:           { backgroundColor: C.primary, borderColor: C.primary },
  filterChipDisabled:     { backgroundColor: C.surface2, borderColor: C.border, opacity: 0.55 },
  filterChipText:         { fontSize: 13, fontWeight: '600', color: C.muted },
  filterChipTextOn:       { color: C.onPrimary },
  filterChipTextDisabled: { color: C.faint },

  soonPill: {
    marginLeft: 5, paddingHorizontal: 5, paddingVertical: 1,
    backgroundColor: C.surface, borderRadius: 6,
  },
  soonText: { fontSize: 9, fontWeight: '700', color: C.muted },

  divider: { height: 1, backgroundColor: C.surface, marginBottom: 4 },

  /* Game row */
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingRight: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.surface,
  },
  rowBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', marginLeft: 16, marginRight: 10 },
  sportCircle: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  rowLeft:  { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  metaRow:  { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, color: C.muted },

  skillPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, marginTop: 4,
  },
  skillPillText: { fontSize: 10, fontWeight: '700' },

  rowRight:     { alignItems: 'center', justifyContent: 'center', paddingLeft: 8, minWidth: 52 },
  countBubble:  { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  countText:    { fontSize: 18, fontWeight: '800', color: C.text },
  countDivider: { fontSize: 12, color: C.border2, marginHorizontal: 1 },
  countCap:     { fontSize: 12, color: C.faint, fontWeight: '600' },
  spotsLabel:   { fontSize: 11, fontWeight: '700', marginTop: 2 },

  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 12 },
  emptyHint:  { fontSize: 13, color: C.faint },
}));
