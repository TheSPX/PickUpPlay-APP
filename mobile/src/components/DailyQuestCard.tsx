import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, themed } from '../lib/palette';
import { inPenalty, liveStreak, rankFor, RANK_COLOR, useDailyQuests } from '../lib/quests';

/* Quest panel colours — follow the app theme (Light / Dark / PickUp). */
export const SYS = themed(() => ({
  bg: C.card, bg2: C.surface, line: C.border, text: C.text, dim: C.muted,
  glow: () => C.accent,
}));

export default function DailyQuestCard({ uid }: { uid?: string }) {
  const router = useRouter();
  const dq = useDailyQuests(uid);
  if (!uid || dq.loading) return null;

  const glow = SYS.glow();
  const r = rankFor(dq.stats.xp);
  const total = dq.quests.length;
  const pct = total ? dq.doneCount / total : 0;
  const allDone = dq.doneCount === total;
  const streak = liveStreak(dq.stats);
  const penalty = inPenalty(dq.stats);

  return (
    <Pressable
      onPress={() => router.push('/quests' as any)}
      style={({ pressed }) => [styles.card, { borderColor: C.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.topRow}>
        <View style={[styles.rankBadge, { borderColor: RANK_COLOR[r.rank] }]}>
          <Text style={[styles.rankText, { color: RANK_COLOR[r.rank] }]}>{r.rank}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sys, { color: C.primary }]}>DAILY QUEST</Text>
          <Text style={styles.title} numberOfLines={1}>
            {allDone ? 'Quest cleared — well done, Hunter' : penalty ? 'Penalty: streak lost. Rise again.' : 'Get stronger today'}
          </Text>
        </View>
        {streak > 0 && (
          <View style={styles.streak}>
            <Ionicons name="flame" size={14} color="#f97316" />
            <Text style={styles.streakText}>{streak}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={SYS.dim} />
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(pct * 100, 3)}%`, backgroundColor: allDone ? C.greenFg : glow }]} />
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.dim}>{dq.doneCount}/{total} quests</Text>
        <Text style={styles.dim}>{dq.steps.toLocaleString()} steps</Text>
      </View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: SYS.bg, borderRadius: 18, borderWidth: 1,
    padding: 14, marginBottom: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: {
    width: 40, height: 40, borderRadius: 10, borderWidth: 2,
    backgroundColor: SYS.bg2, justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 20, fontWeight: '900' },
  sys:   { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 15, fontWeight: '800', color: SYS.text, marginTop: 2 },
  streak: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: SYS.bg2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  streakText: { color: '#f97316', fontSize: 12, fontWeight: '900' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: SYS.line, overflow: 'hidden', marginTop: 12 },
  barFill:  { height: 6, borderRadius: 3 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dim: { color: SYS.dim, fontSize: 11, fontWeight: '700' },
}));
