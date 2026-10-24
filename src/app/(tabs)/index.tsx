import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import CampusMap, { CampusMapHandle, MapPin } from '../../components/CampusMap';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AppIcon from '../../components/AppIcon';
import { GameCard } from '../../components/GameCard';
import DailyQuestCard from '../../components/DailyQuestCard';
import NotifOverlay, { MOCK_NOTIFS, Notif } from '../../components/NotifOverlay';
import { useAuth } from '../../lib/auth';
import { visibleSince, isStillVisible, LOCATION_PRESETS, Skill, SKILLS, Sport, SPORTS, SPORT_LABEL, fromDbSkill } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { C, themed } from '../../lib/palette';

type Row = {
  game_id: string;
  sport: Sport;
  starts_at: string;
  min_skill: Skill;
  max_skill: Skill;
  capacity: number;
  players: number;
  spots_left: number;
  court_id: string;
  court_name: string;
  court_image_url?: string | null;
  distance_km: number | null;
  host_name: string;
  lat?: number | null;
  lng?: number | null;
};

const TABS = ['Recent', 'Nearby', 'Latest'] as const;
type Tab = typeof TABS[number];

// NJUPT East Campus
const NJUPT = { latitude: 32.11949, longitude: 118.927126 };
const MAP_DELTA = { latitudeDelta: 0.008, longitudeDelta: 0.008 };
const NJUPT_REGION = { ...NJUPT, ...MAP_DELTA };
// Map is locked to the NJUPT campus area
const CAMPUS_BOUNDS = {
  north: 32.1240, south: 32.1060,
  east: 118.9460, west: 118.9220,
};
const MAX_DELTA = 0.016; // can't zoom out past the campus

const VENUES = [
  { name: "East Football Field", lat: 32.116603, lng: 118.928912, icon: "football-outline" },
  { name: "East Tennis Courts", lat: 32.117557, lng: 118.92992, icon: "tennisball-outline" },
  { name: "East Volleyball Courts", lat: 32.117332, lng: 118.929928, icon: "medal-outline" },
  { name: "East Basketball Courts", lat: 32.116777, lng: 118.929738, icon: "basketball-outline" },
  { name: "North Football Stadium", lat: 32.120998, lng: 118.924325, icon: "football-outline" },
  { name: "North Tennis Courts", lat: 32.122377, lng: 118.925883, icon: "tennisball-outline" },
  { name: "North Volleyball Courts", lat: 32.121671, lng: 118.926514, icon: "medal-outline" },
  { name: "North Basketball Courts", lat: 32.121977, lng: 118.926141, icon: "basketball-outline" },
];

const SPORT_PIN: Record<Sport, string> = themed(() => ({
  football: '#1a3a5c',
  padel: '#1a4a2a',
  basketball: C.amberFg,
  badminton: '#1a3a4a',
  billiards: '#123c3a',
}));

export default function Discover() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();

  const [displayName, setDisplayName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>(MOCK_NOTIFS);
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [activeTab, setActiveTab] = useState<Tab>('Recent');
  const [myLevelOnly, setMyLevelOnly] = useState(false);
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [games, setGames] = useState<Row[]>([]);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<Partial<Record<Sport, Skill>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', uid)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name);
          if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        });
    }, [uid])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function initLocation() {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (!active) return;
          if (status !== 'granted') {
            setPermissionDenied(true);
            const preset = LOCATION_PRESETS[0];
            setLocation({ lat: preset.lat, lng: preset.lng, name: preset.name });
            return;
          }
          setPermissionDenied(false);
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!active) return;
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Current Location' });
        } catch {
          if (!active) return;
          setPermissionDenied(true);
          const preset = LOCATION_PRESETS[0];
          setLocation({ lat: preset.lat, lng: preset.lng, name: preset.name });
        }
      }
      initLocation();
      return () => { active = false; };
    }, [])
  );

  const load = useCallback(async () => {
    if (!uid) return;
    const [found, mine, mySkills] = await Promise.all([
      supabase.rpc('search_games', {
        p_sport: sport === 'all' ? null : sport,
        p_skill: null,
        p_from: visibleSince(),   // keep games listed until 4h after start
        p_to: null,
        p_lat: location?.lat ?? null,
        p_lng: location?.lng ?? null,
        p_max_km: maxKm,
      }),
      supabase.from('game_players').select('game_id').eq('user_id', uid),
      supabase.from('player_sports').select('sport, skill').eq('user_id', uid),
    ]);

    if (found.error) {
      setError(found.error.message);
    } else {
      setError(null);
      let list = ((found.data ?? []) as any[]).filter((g) => isStillVisible(g.starts_at)).map((g) => ({
        ...g,
        min_skill: fromDbSkill(g.min_skill),
        max_skill: fromDbSkill(g.max_skill),
      })) as Row[];
      if (location) {
        list.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      }
      // Court images — match by id, fall back to court name
      // (search_games may not return court_id, so don't rely on it alone)
      const { data: courtRows } = await supabase.from('courts').select('id, name, image_url');
      const byId: Record<string, string> = {};
      const byName: Record<string, string> = {};
      (courtRows ?? []).forEach((c: any) => {
        if (!c.image_url) return;
        byId[c.id] = c.image_url;
        if (c.name) byName[String(c.name).trim().toLowerCase()] = c.image_url;
      });
      list = list.map((g) => ({
        ...g,
        court_image_url:
          (g.court_id && byId[g.court_id]) ||
          byName[String(g.court_name ?? '').trim().toLowerCase()] ||
          null,
      }));
      setGames(list);
    }
    if (mine.data) setJoined(new Set(mine.data.map((r: any) => r.game_id as string)));
    if (mySkills.data) {
      setSkills(Object.fromEntries(mySkills.data.map((r: any) => [r.sport, r.skill])));
    }
  }, [uid, sport, location, maxKm]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  // Also reload when sport/location/maxKm filter changes (useFocusEffect only fires on focus)
  const isFirstRender = useRef(true);
  const mapRef = useRef<CampusMapHandle>(null);
  const resetMap = () => mapRef.current?.reset();
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    load();
  }, [sport, location, maxKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: refresh game cards when any player joins/leaves ──
  // Use a ref so the subscription never re-subscribes when load changes
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const channel = supabase
      // unique name per mount — reusing a name returns the old, already-subscribed channel
      .channel(`home_game_players_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players' },
        () => { loadRef.current(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    let result = games;
    if (myLevelOnly) {
      result = result.filter((g) => {
        const mine = skills[g.sport];
        if (!mine) return false;
        const i = SKILLS.indexOf(mine);
        return SKILLS.indexOf(g.min_skill) <= i && i <= SKILLS.indexOf(g.max_skill);
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.court_name.toLowerCase().includes(q) ||
          SPORT_LABEL[g.sport].toLowerCase().includes(q) ||
          g.host_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [games, myLevelOnly, skills, searchQuery]);

  const mapPins: MapPin[] = useMemo(() => [
    ...VENUES.map((v) => ({
      id: `venue-${v.name}`, kind: 'court' as const, lat: v.lat, lng: v.lng, label: '', title: v.name, color: '#001645',
      sport: ({ 'football-outline': 'football', 'tennisball-outline': 'padel', 'basketball-outline': 'basketball', 'medal-outline': 'badminton' } as Record<string, string>)[v.icon],
    })),
    ...visible
      .filter((g) => g.lat != null && g.lng != null && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng)))
      .map((g) => ({
        id: g.game_id, kind: 'game' as const, lat: Number(g.lat), lng: Number(g.lng),
        label: (SPORT_LABEL[g.sport] ?? '?').charAt(0), color: SPORT_PIN[g.sport] ?? '#001645', title: g.court_name,
        sport: g.sport,
      })),
  ], [visible]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.text} />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Hi, {displayName} 👋</Text>
          <Text style={styles.greetingSub}>Play, Train , Evolve Now !</Text>
        </View>
        <View style={styles.topRight}>
          <Pressable style={styles.bellWrap} onPress={() => setShowNotifs(true)}>
            <Ionicons name="notifications-outline" size={22} color={C.text} />
            {notifs.some(n => !n.read) && <View style={styles.bellBadge} />}
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            {avatarUrl ? (
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: C.onPrimary, fontWeight: '800', fontSize: 15 }}>
                  {displayName ? displayName[0].toUpperCase() : '?'}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={C.faint} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Games"
          placeholderTextColor={C.faint}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.divider} />
        <Ionicons name="options-outline" size={18} color={C.faint} />
      </View>

      {/* ── Daily Quest (System) ── */}
      <DailyQuestCard uid={uid} />

      {/* ── Latest Games ── */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Latest Games</Text>
        <Text style={styles.viewAll}>View all</Text>
      </View>

      {/* Recent / Nearby / Latest tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {/* Sport filter chips — right under tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={{ paddingRight: 8 }}
      >
        {(['all', ...SPORTS] as const).map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, sport === s && styles.chipActive]}
            onPress={() => setSport(s as any)}
          >
            <Text style={[styles.chipText, sport === s && styles.chipTextActive]}>
              {s === 'all' ? 'All' : SPORT_LABEL[s as Sport]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Horizontal Game Cards */}
      {error ? (
        <Text style={styles.errorText}>⚠️ {error}</Text>
      ) : visible.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <AppIcon
              name={(sport === 'all' ? 'calendar-outline' : ({ football: 'football-outline', padel: 'tennisball-outline', basketball: 'basketball-outline', badminton: 'medal-outline', billiards: 'billiards-8' } as const)[sport]) as any}
              size={26}
              color={C.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {sport === 'all' ? 'No games nearby yet' : `No ${SPORT_LABEL[sport].toLowerCase()} games yet`}
          </Text>
          <Text style={styles.emptyText}>Be the first — host one and others can join.</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.push({ pathname: '/(tabs)/create', params: sport === 'all' ? {} : { sport } } as any)}
          >
            <Ionicons name="add" size={18} color={C.onAccent} />
            <Text style={styles.emptyBtnText}>
              Create {sport === 'all' ? 'a game' : `a ${SPORT_LABEL[sport]} game`}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsScroll}
        >
          {visible.map((g) => (
            <GameCard
              key={g.game_id}
              sport={g.sport}
              startsAt={g.starts_at}
              courtName={g.court_name}
              minSkill={g.min_skill}
              maxSkill={g.max_skill}
              courtImageUrl={g.court_image_url}
              distanceKm={g.distance_km}
              line={`${g.players}/${g.capacity}`}
              onPress={() => router.push(`/game/${g.game_id}` as any)}
            />
          ))}
        </ScrollView>
      )}

      {permissionDenied && (
        <View style={styles.presetBox}>
          <Text style={styles.hintText}>📍 Location denied — pick a city:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {LOCATION_PRESETS.map((p) => (
              <Pressable
                key={p.name}
                style={[styles.chip, location?.name === p.name && styles.chipActive]}
                onPress={() => setLocation({ lat: p.lat, lng: p.lng, name: p.name })}
              >
                <Text style={[styles.chipText, location?.name === p.name && styles.chipTextActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Nearby Map ── */}
      <View style={[styles.sectionRow, { marginTop: 28 }]}>
        <Text style={styles.sectionTitle}>Nearby</Text>
        <Pressable onPress={() => router.push('/courts-map' as any)} hitSlop={8}>
          <Text style={styles.viewAll}>Browse courts</Text>
        </Pressable>
      </View>

      <View style={styles.mapCard}>
        <CampusMap
          ref={mapRef}
          pins={mapPins}
          onSelect={(p) => { if (p.kind === 'game') router.push(`/game/${p.id}` as any); else router.push('/courts-map' as any); }}
        />

        {/* Map label overlay */}
        <Pressable
          style={({ pressed }) => [styles.mapLabel, pressed && { opacity: 0.7 }]}
          onPress={resetMap}
          hitSlop={8}
        >
          <Ionicons name="location-outline" size={13} color={C.primary} style={{ marginRight: 4 }} />
          <Text style={styles.mapLabelText}>NJUPT Campus</Text>
          <Ionicons name="locate-outline" size={13} color={C.primary} style={{ marginLeft: 6 }} />
        </Pressable>

        {/* Expand → full-screen court browser */}
        <Pressable
          style={({ pressed }) => [styles.mapExpand, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/courts-map' as any)}
          hitSlop={8}
          accessibilityLabel="Open full map of courts"
        >
          <Ionicons name="expand-outline" size={18} color={C.primary} />
        </Pressable>
      </View>
    </ScrollView>
      <NotifOverlay
        visible={showNotifs}
        onClose={() => setShowNotifs(false)}
        notifs={notifs}
        onMarkRead={(id) =>
          setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
        }
      />
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.card },
  content: { paddingTop: 56, paddingBottom: 40, paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.card },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: C.text },
  greetingSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1a1a2e' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text },
  divider: { width: 1, height: 18, backgroundColor: C.border2, marginHorizontal: 10 },

  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  viewAll: { fontSize: 13, color: C.muted },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 30,
    backgroundColor: C.surface,
  },
  tabActive: { backgroundColor: C.text },
  tabText: { fontSize: 14, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.onPrimary },

  // Sport chips — directly under tabs
  chipsScroll: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    marginRight: 8,
  },
  chipActive: { backgroundColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.onPrimary },

  cardsScroll: { paddingBottom: 8, paddingRight: 16 },

  presetBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  hintText: { color: C.muted, fontSize: 13 },
  errorText: { color: '#b00020', fontSize: 13, marginBottom: 8 },
  emptyText: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  emptyCard: {
    alignItems: 'center', backgroundColor: C.surface, borderRadius: 20,
    paddingVertical: 24, paddingHorizontal: 20, marginVertical: 12,
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.card,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  emptyTitle:   { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24,
  },
  emptyBtnText: { color: C.onAccent, fontSize: 14, fontWeight: '800' },

  // Map
  mapCard: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 260,
    backgroundColor: C.surface,
    position: 'relative',
  },
  map: { width: '100%', height: '100%' },
  mapExpand: {
    position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 4,
  },
  mapLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  mapLabelText: { fontSize: 12, fontWeight: '700', color: C.primary },

  // Map markers
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.card,
  },
  pinText: { color: C.onPrimary, fontWeight: '800', fontSize: 13 },
  venuePin: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.border,
    borderWidth: 1.5,
    borderColor: C.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  campusPin: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
}));
