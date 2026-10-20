import { ReactNode, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  distanceKm, courtImageUrl, line, onPress, children, variant,
}: Props) {
  const [liked, setLiked] = useState(false);

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

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.card}>
      <View style={[styles.photoBg, { backgroundColor: SPORT_BG[sport] ?? '#1a3a5c' }]}>
        {courtImageUrl && (
          <ExpoImage
            source={{ uri: safeUri(courtImageUrl) }}
            style={styles.courtPhoto}
            contentFit="cover"
            transition={250}
          />
        )}
        {/* Heart */}
        <Pressable
          style={styles.heartBtn}
          onPress={(e) => { e.stopPropagation?.(); setLiked((v) => !v); }}
          hitSlop={8}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={18}
            color={liked ? '#ef4444' : C.onPrimary}
          />
        </Pressable>

        {/* Skill badge top-left */}
        <View style={styles.skillBadgeTopLeft}>
          <SkillBadge min={minSkill} max={maxSkill} />
        </View>

        {/* Bottom overlay */}
        <View style={styles.overlay}>
          <Text style={styles.titleLine} numberOfLines={1}>
            <Text style={styles.titleBold}>{SPORT_LABEL[sport]} Match, </Text>
            <Text style={styles.titleVenue}>{courtName}</Text>
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaItem, { flex: 1, marginRight: 8 }]}>
              <Ionicons name="location-outline" size={12} color={C.border2} />
              <Text style={[styles.metaText, { flex: 1 }]} numberOfLines={1}>
                {distanceKm != null ? `${distanceKm.toFixed(1)} km away` : courtName}
              </Text>
            </View>
            {line ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={12} color={C.border2} />
                <Text style={styles.metaText}>{line}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  // ─── Image card ──────────────────────────────────────────
  card: { width: 220, marginRight: 14, marginBottom: 4 },
  photoBg: {
    width: 220, height: 300,
    borderRadius: 22, overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  courtPhoto: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  heartBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  skillBadgeTopLeft: {
    position: 'absolute', top: 12, left: 12,
    zIndex: 10,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  titleLine: { fontSize: 13, marginBottom: 6 },
  titleBold: { color: C.onPrimary, fontWeight: '700', fontSize: 13 },
  titleVenue: { color: C.border2, fontWeight: '400', fontSize: 13 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: C.border2, marginLeft: 3 },
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
