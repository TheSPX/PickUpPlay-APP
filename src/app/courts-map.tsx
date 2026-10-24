import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from '../components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import ScreenHeader from '../components/ScreenHeader';
import AppIcon from '../components/AppIcon';
import CampusMap, { CampusMapHandle, MapPin } from '../components/CampusMap';
import { Sport, SPORTS, SPORT_LABEL, visibleSince } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { C, themed } from '../lib/palette';

/* Full-screen campus map: every court, with its sports and upcoming games. */

type Court = {
  id: string; name: string; address: string | null; sports: Sport[];
  lat: number | null; lng: number | null; image_url: string | null;
};

const SPORT_ICON: Record<Sport, string> = {
  football: 'football-outline', padel: 'tennisball-outline', basketball: 'basketball-outline',
  badminton: 'medal-outline', billiards: 'billiards-8',
};
const SPORT_PIN: Record<Sport, string> = {
  football: '#1e40af', padel: '#166534', basketball: '#b45309', badminton: '#6b21a8', billiards: '#0f766e',
};

const { width: W } = Dimensions.get('window');
const CARD_W = Math.min(300, W - 64);

export default function CourtsMap() {
  const router = useRouter();
  const map = useRef<CampusMapHandle>(null);
  const list = useRef<FlatList<Court>>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [games, setGames] = useState<Record<string, number>>({});
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [c, g] = await Promise.all([
        supabase.from('courts').select('id, name, address, sports, lat, lng, image_url'),
        supabase.from('games').select('court_id').eq('status', 'open').gt('starts_at', visibleSince()),
      ]);
      if (c.error) { setError(c.error.message); return; }
      setError(null);
      setCourts(((c.data ?? []) as any[]).filter((x) => x.lat != null && x.lng != null));
      const counts: Record<string, number> = {};
      ((g.data ?? []) as any[]).forEach((r) => { if (r.court_id) counts[r.court_id] = (counts[r.court_id] ?? 0) + 1; });
      setGames(counts);
    })();
  }, []));

  const shown = useMemo(
    () => courts.filter((c) => sport === 'all' || (c.sports ?? []).includes(sport)),
    [courts, sport],
  );

  const pins: MapPin[] = useMemo(() => shown.map((c) => {
    const main = (sport !== 'all' ? sport : c.sports?.[0]) as Sport | undefined;
    const n = games[c.id] ?? 0;
    return {
      id: c.id, kind: 'court', lat: Number(c.lat), lng: Number(c.lng),
      label: main ? SPORT_LABEL[main].charAt(0) : '',
      sport: main, count: n > 0 ? n : undefined,
      color: main ? SPORT_PIN[main] : '#001645',
      title: c.name, selected: c.id === selected,
    };
  }), [shown, games, selected, sport]);

  function select(id: string, fromMap: boolean) {
    setSelected(id);
    const c = shown.find((x) => x.id === id);
    if (c) map.current?.flyTo(Number(c.lat), Number(c.lng), 17);
    if (fromMap) {
      const i = shown.findIndex((x) => x.id === id);
      if (i >= 0) list.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Nearby Courts"
        subtitle={`${shown.length} court${shown.length === 1 ? '' : 's'} on NJUPT campus`}
        right={
          <Pressable style={styles.resetBtn} onPress={() => { setSelected(null); map.current?.reset(); }} hitSlop={6}>
            <Ionicons name="locate-outline" size={18} color={C.text} />
          </Pressable>
        }
      />

      {/* Sport filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
        {(['all', ...SPORTS] as const).map((s) => {
          const on = sport === s;
          return (
            <Pressable key={s} onPress={() => { setSport(s as any); setSelected(null); }} style={[styles.chip, on && styles.chipOn]}>
              {s !== 'all' && <AppIcon name={SPORT_ICON[s as Sport]} size={13} color={on ? C.onPrimary : C.muted} />}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s === 'all' ? 'All' : SPORT_LABEL[s as Sport]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <CampusMap ref={map} pins={pins} showControls initialZoom={15.2} onSelect={(p) => select(p.id, true)} />

        {error && (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        )}

        {/* Court cards */}
        <FlatList
          ref={list}
          data={shown}
          horizontal
          keyExtractor={(c) => c.id}
          style={styles.cards}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + 12}
          decelerationRate="fast"
          getItemLayout={(_, i) => ({ length: CARD_W + 12, offset: 16 + (CARD_W + 12) * i, index: i })}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            <View style={[styles.card, { width: W - 32, alignItems: 'center' }]}>
              <Text style={styles.cardSub}>No courts for this sport yet.</Text>
            </View>
          }
          renderItem={({ item: c }) => {
            const n = games[c.id] ?? 0;
            const on = c.id === selected;
            return (
              <Pressable style={[styles.card, { width: CARD_W }, on && styles.cardOn]} onPress={() => select(c.id, false)}>
                <View style={styles.cardTop}>
                  {c.image_url
                    ? <ExpoImage source={{ uri: c.image_url }} style={styles.thumb} contentFit="cover" />
                    : <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="location" size={20} color={C.faint} /></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{c.name}</Text>
                    {c.address ? <Text style={styles.cardSub} numberOfLines={1}>{c.address}</Text> : null}
                    <View style={styles.sportRow}>
                      {(c.sports ?? []).map((s) => (
                        <View key={s} style={styles.sportDot}><AppIcon name={SPORT_ICON[s]} size={12} color={SPORT_PIN[s]} /></View>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={[styles.games, n > 0 && { color: C.greenFg }]}>
                    {n > 0 ? `${n} game${n === 1 ? '' : 's'} coming up` : 'No games yet'}
                  </Text>
                  <Pressable
                    style={styles.hostBtn}
                    onPress={() => router.push({
                      pathname: '/(tabs)/create',
                      params: { court: c.id, ...(sport !== 'all' ? { sport } : c.sports?.[0] ? { sport: c.sports[0] } : {}) },
                    } as any)}
                  >
                    <Ionicons name="add" size={14} color={C.onAccent} />
                    <Text style={styles.hostText}>Host here</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  resetBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },

  chipsBar: { flexGrow: 0, backgroundColor: C.bg },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: C.muted },
  chipTextOn: { color: C.onPrimary },

  errorBox: { position: 'absolute', top: 10, left: 16, right: 16, backgroundColor: C.dangerBg, borderRadius: 12, padding: 10 },
  errorText: { color: '#ef4444', fontSize: 12 },

  cards: { position: 'absolute', left: 0, right: 0, bottom: 28, flexGrow: 0 },
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 12, borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5,
  },
  cardOn: { borderColor: C.accent },
  cardTop: { flexDirection: 'row', gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  thumbEmpty: { backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  cardSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  sportRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  sportDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  games: { fontSize: 12, fontWeight: '700', color: C.muted },
  hostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  hostText: { fontSize: 12, fontWeight: '800', color: C.onAccent },
}));
