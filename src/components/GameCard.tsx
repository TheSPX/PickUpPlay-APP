import { ReactNode, useEffect, useState } from 'react';
import { getGameWeather, GameWeather } from '../lib/weather';
import { NJUPT_CENTER } from './CampusMap';
import { Image as ExpoImage } from 'expo-image';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from './PressableScale';
import { Ionicons } from '@expo/vector-icons';
import {
  formatWhen, Skill, Sport, SPORT_LABEL,
  SKILL_LABEL, SKILL_ICON, SKILL_COLOR, skillRangeText,
} from '../lib/constants';
import { C, themed } from '../lib/palette';

type Props = {
  sport: Sport;
  startsAt: string;
  courtName: string;
  minSkill: Skill;
  maxSkill: Skill;
  courtImageUrl?: string | null;
  distanceKm?: number | null;
  line?: string;
  onPress?: () => void;
  children?: ReactNode;
  variant?: 'image' | 'navy';
  lat?: number | null;
  lng?: number | null;
};

const SPORT_BG: Record<Sport, string> = themed(() => ({
  padel:      '#1a4a2a',
  football:   '#1a3a5c',
  basketball: C.amberFg,
  badminton:  '#1a3a4a',
  billiards: '#123c3a',
}));

function SkillBadge({ min, max }: { min: Skill; max: Skill }) {
  const isSingle = min === max;
  const colors = SKILL_COLOR[min];
  return (
    <View style={[skillBadgeStyles.pill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Ionicons name={SKILL_ICON[min] as any} size={13} color={colors.text} />
      {!isSingle && (
        <>
          <Ionicons name="arrow-forward-outline" size={10} color={colors.text} style={{ opacity: 0.6 }} />
          <Ionicons name={SKILL_ICON[max] as any} size={13} color={colors.text} />
        </>
      )}
    </View>
  );
}

const skillBadgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  text: { fontSize: 10, fontWeight: '700' },
});

/** Encode spaces/special chars in storage URLs (Android won't load raw spaces) */
function safeUri(u: string) {
  try { return encodeURI(decodeURI(u.trim())); } catch { return u.trim(); }
}

export function GameCard({
  sport, startsAt, courtName, minSkill, maxSkill,
  distanceKm, courtImageUrl, line, onPress, children, variant, lat, lng,
}: Props) {
  const [liked, setLiked] = useState(false);
  const [weather, setWeather] = useState<GameWeather | null>(null);
  useEffect(() => {
    let on = true;
    getGameWeather(lat ?? NJUPT_CENTER.lat, lng ?? NJUPT_CENTER.lng, startsAt).then((w) => { if (on) setWeather(w); });
    return () => { on = false; };
  }, [startsAt, lat, lng]);

  if (variant === 'navy') {
    return (
      <Pressable onPress={onPress} disabled={!onPress} style={styles.navyCard}>
        <View style={styles.navyTopRow}>
          <Text style={styles.navyTitle}>{SPORT_LABEL[sport]} Match</Text>
          {line ? (
            <View style={styles.navyCountBadge}>
              <Ionicons name="people-outline" size={12} color={C.blueBd} style={{ marginRight: 3 }} />
              <Text style={styles.navyCountText}>{line}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.navyMetaRow}>
          <Ionicons name="location-outline" size={13} color={C.blueBd} style={{ marginRight: 4 }} />
          <Text style={styles.navyMeta}>{courtName}</Text>
        </View>
        <View style={styles.navyMetaRow}>
          <Ionicons name="time-outline" size={13} color={C.blueBd} style={{ marginRight: 4 }} />
          <Text style={styles.navyMeta}>{formatWhen(startsAt)}</Text>
        </View>
        {/* Skill badge */}
        <View style={{ marginTop: 10 }}>
          <SkillBadge min={minSkill} max={maxSkill} />
        </View>
        {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
      </Pressable>
    );
  }

  const [cur, cap] = (line ?? '').split('/').map((n) => Number(n));
  const hasCount = isFinite(cur) && isFinite(cap) && cap > 0;
  const fill = hasCount ? Math.min(1, cur / cap) : 0;
  const full = hasCount && cur >= cap;
  const when = new Date(startsAt);
  const timeText = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.card} scaleTo={0.97}>
      <View style={[styles.photoBg, { backgroundColor: SPORT_BG[sport] ?? '#1a3a5c' }]}>
        {courtImageUrl && (
          <ExpoImage source={{ uri: safeUri(courtImageUrl) }} style={styles.courtPhoto} contentFit="cover" transition={250} />
        )}
        {/* soft top shade so badges read on bright skies */}
        <View style={styles.topShade} pointerEvents="none" />

        <View style={styles.skillBadgeTopLeft}>
          <SkillBadge min={minSkill} max={maxSkill} />
        </View>

        <Pressable
          style={styles.heartBtn}
          scaleTo={0.8}
          onPress={(e) => { e.stopPropagation?.(); setLiked((v) => !v); }}
          hitSlop={8}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? '#ef4444' : '#fff'} />
        </Pressable>

        {/* Floating glass panel */}
        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <Text style={styles.panelTitle} numberOfLines={1}>{SPORT_LABEL[sport]} Match</Text>
            <View style={styles.wx}>
              <Ionicons name={(weather?.icon ?? 'cloud') as any} size={18} color="#fff" style={{ opacity: weather ? 1 : 0.55 }} />
              {weather ? <Text style={styles.wxText}>{weather.tempC}°</Text> : null}
            </View>
          </View>
          <View style={styles.panelRow}>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.panelMeta} numberOfLines={1}>
              {courtName}{distanceKm != null ? ` · ${distanceKm.toFixed(1)} km` : ''}
            </Text>
          </View>
          <View style={styles.panelBottom}>
            {hasCount ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.count}>
                  {cur}<Text style={styles.countCap}>/{cap}</Text>
                  {full ? <Text style={styles.fullTag}>  FULL</Text> : null}
                </Text>
                <View style={styles.track}><View style={[styles.trackFill, { width: `${fill * 100}%` }]} /></View>
              </View>
            ) : <View style={{ flex: 1 }} />}
            <View style={styles.timeChip}>
              <Ionicons name="time-outline" size={12} color={C.onAccent} />
              <Text style={styles.timeText}>{timeText}</Text>
            </View>
          </View>
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  // ─── Image card ──────────────────────────────────────────
  card: {
    width: 236, marginRight: 14, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8,
  },
  photoBg: { width: 236, height: 330, borderRadius: 30, overflow: 'hidden', justifyContent: 'flex-end' },
  courtPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 90, backgroundColor: 'rgba(0,0,0,0.12)' },
  heartBtn: {
    position: 'absolute', top: 14, right: 14, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(30,40,50,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  skillBadgeTopLeft: { position: 'absolute', top: 20, left: 14, zIndex: 10 },
  panel: {
    margin: 12, borderRadius: 20, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    backgroundColor: 'rgba(12,22,18,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { flex: 1, fontSize: 22, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 },
  wx: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wxText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  panelMeta: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  panelBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 },
  count: { fontSize: 18, fontWeight: '800', color: '#fff' },
  countCap: { color: 'rgba(255,255,255,0.6)' },
  fullTag: { fontSize: 11, fontWeight: '900', color: '#f87171' },
  track: { height: 4, borderRadius: 2, marginTop: 5, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: '#afd43a' },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  timeText: { fontSize: 12, fontWeight: '800', color: C.onAccent },
  actions: { marginTop: 10 },

  // ─── Navy card ───────────────────────────────────────────
  navyCard: {
    backgroundColor: C.primary,
    borderRadius: 16, padding: 16,
    marginBottom: 14,
  },
  navyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  navyTitle: { fontSize: 17, fontWeight: '700', color: C.onPrimary },
  navyCountBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12,
  },
  navyCountText: { fontSize: 12, color: C.blueBd, fontWeight: '600' },
  navyMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  navyMeta: { fontSize: 13, color: C.blueBd },
}));
