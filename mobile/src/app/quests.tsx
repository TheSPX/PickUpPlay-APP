import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppIcon from '../components/AppIcon';
import { SYS } from '../components/DailyQuestCard';
import { useAuth } from '../lib/auth';
import { C, themed } from '../lib/palette';
import {
  inPenalty, levelFor, liveStreak, QuestDef, rankFor, RANK_COLOR, useDailyQuests,
} from '../lib/quests';

function timeToReset() {
  const now = new Date();
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export default function QuestsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const dq = useDailyQuests(session?.user.id);
  const [clock, setClock] = useState(timeToReset());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(timeToReset()), 1000);
    return () => clearInterval(t);
  }, []);
  useFocusEffect(useCallback(() => { dq.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const glow = SYS.glow();
  const r = rankFor(dq.stats.xp);
  const level = levelFor(dq.stats.xp);
  const streak = liveStreak(dq.stats);
  const penalty = inPenalty(dq.stats);
  const allDone = dq.doneCount === dq.quests.length && dq.quests.length > 0;

  async function complete(q: QuestDef) {
    setBusy(q.id);
    await dq.complete(q);
    setBusy(null);
  }
  async function addSteps(q: QuestDef, n: number) {
    setBusy(q.id);
    await dq.setProgress(q, dq.progressOf(q) + n);
    setBusy(null);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={SYS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Daily Quests</Text>
        <View style={{ width: 38 }} />
      </View>

      {dq.loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
      ) : (
        <>
          {dq.error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#fca5a5" />
              <Text style={styles.errorText}>{dq.error}</Text>
            </View>
          )}

          {/* Hunter status */}
          <View style={[styles.panel, { borderColor: C.border }]}>
            <View style={styles.statusRow}>
              <View style={[styles.rankBig, { borderColor: RANK_COLOR[r.rank] }]}>
                <Text style={[styles.rankBigText, { color: RANK_COLOR[r.rank] }]}>{r.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dimSmall}>HUNTER STATUS</Text>
                <Text style={styles.levelText}>Lv. {level}</Text>
                <Text style={[styles.rankTitle, { color: RANK_COLOR[r.rank] }]}>{r.title}</Text>
              </View>
              <View style={styles.streakBox}>
                <Ionicons name="flame" size={20} color={streak ? '#f97316' : C.border2} />
                <Text style={styles.streakNum}>{streak}</Text>
                <Text style={styles.dimSmall}>best {dq.stats.best_streak}</Text>
              </View>
            </View>

            <View style={styles.xpTrack}>
              <View style={[styles.xpFill, { width: `${Math.max(r.pct * 100, 2)}%`, backgroundColor: glow }]} />
            </View>
            <Text style={styles.dimSmall}>
              {r.next ? `${dq.stats.xp.toLocaleString()} / ${r.next.minXp.toLocaleString()} XP → ${r.next.rank}-Rank` : `${dq.stats.xp.toLocaleString()} XP · MAX RANK`}
            </Text>
          </View>

          {/* Penalty */}
          {penalty && (
            <View style={styles.penalty}>
              <Ionicons name="warning" size={18} color="#fecaca" />
              <View style={{ flex: 1 }}>
                <Text style={styles.penaltyTitle}>PENALTY</Text>
                <Text style={styles.penaltyText}>You failed to clear yesterday's quest. Your streak was reset.</Text>
              </View>
            </View>
          )}

          {/* Daily quest */}
          <View style={[styles.panel, { borderColor: C.border }]}>
            <Text style={styles.questHeader}>Today's quests</Text>
            <View style={styles.resetRow}>
              <Ionicons name="time-outline" size={13} color={SYS.dim} />
              <Text style={styles.dimSmall}>Resets in {clock}</Text>
            </View>

            {dq.quests.map((q) => {
              const prog = dq.progressOf(q);
              const done = dq.isDone(q);
              const pct = Math.min(prog / q.target, 1);
              const manualSteps = q.kind === 'steps' && dq.stepsAvailable === false;
              return (
                <View key={q.id} style={styles.qRow}>
                  <View style={[styles.qIcon, done && { backgroundColor: C.greenBg }]}>
                    <AppIcon name={done ? 'checkmark' : q.icon} size={18} color={done ? C.greenFg : C.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.qTop}>
                      <Text style={[styles.qLabel, done && styles.qLabelDone]} numberOfLines={1}>{q.label}</Text>
                      <Text style={[styles.qCount, done && { color: C.greenFg }]}>
                        {Math.min(prog, q.target).toLocaleString()} / {q.target.toLocaleString()} {q.unit}
                      </Text>
                    </View>
                    <View style={styles.qTrack}>
                      <View style={[styles.qFill, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: done ? C.greenFg : glow }]} />
                    </View>
                    {q.kind === 'steps' && !done && (
                      <Text style={styles.qHint}>
                        {dq.stepsAvailable === null ? 'Connecting to step counter…'
                          : manualSteps ? 'Step counter unavailable — add steps manually'
                          : Platform.OS === 'android' ? 'Counting while the app is open' : 'Synced from your phone'}
                      </Text>
                    )}
                  </View>

                  {!done && q.kind === 'manual' && (
                    <Pressable style={[styles.qBtn, { borderColor: C.primary }]} onPress={() => complete(q)} disabled={busy === q.id}>
                      {busy === q.id ? <ActivityIndicator size="small" color={C.primary} />
                        : <Text style={[styles.qBtnText, { color: C.primary }]}>Done</Text>}
                    </Pressable>
                  )}
                  {!done && manualSteps && (
                    <Pressable style={[styles.qBtn, { borderColor: C.primary }]} onPress={() => addSteps(q, 1000)} disabled={busy === q.id}>
                      <Text style={[styles.qBtnText, { color: C.primary }]}>+1k</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            <View style={styles.rewardBox}>
              <Ionicons name={allDone ? 'trophy' : 'gift-outline'} size={16} color={allDone ? C.amberFg : SYS.dim} />
              <Text style={[styles.rewardText, allDone && { color: C.amberFg }]}>
                {allDone
                  ? 'Daily Quest cleared! Rewards received.'
                  : `Each quest +20 XP · Clear all: +50 XP + streak bonus`}
              </Text>
            </View>
          </View>

          {/* Sports XP */}
          <View style={[styles.panel, { borderColor: C.border }]}>
            <Text style={styles.questHeader}>Bonus XP</Text>
            <View style={styles.bonusRow}>
              <Ionicons name="enter-outline" size={16} color={C.primary} />
              <Text style={styles.bonusText}>Join a game</Text>
              <Text style={[styles.bonusXp, { color: C.primary }]}>+30 XP</Text>
            </View>
            <View style={styles.bonusRow}>
              <Ionicons name="flag-outline" size={16} color={C.primary} />
              <Text style={styles.bonusText}>Host a game</Text>
              <Text style={[styles.bonusXp, { color: C.primary }]}>+50 XP</Text>
            </View>
          </View>

          {/* XP log */}
          <View style={[styles.panel, { borderColor: C.border }]}>
            <Text style={styles.questHeader}>XP history</Text>
            {dq.events.length === 0 && <Text style={styles.dimSmall}>No XP yet — complete a quest to begin.</Text>}
            {dq.events.map((e) => (
              <View key={e.id} style={styles.logRow}>
                <Text style={styles.logReason} numberOfLines={1}>{e.reason}</Text>
                <Text style={[styles.logXp, { color: C.primary }]}>+{e.amount} XP</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, paddingTop: 56, paddingBottom: 48 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  back: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: SYS.bg2,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },

  errorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.dangerBg,
    borderRadius: 12, padding: 10, marginBottom: 12,
  },
  errorText: { color: '#ef4444', fontSize: 12, flex: 1 },

  panel: {
    backgroundColor: SYS.bg, borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  rankBig: {
    width: 64, height: 64, borderRadius: 14, borderWidth: 2.5, backgroundColor: SYS.bg2,
    justifyContent: 'center', alignItems: 'center',
    
  },
  rankBigText: { fontSize: 34, fontWeight: '900' },
  levelText:   { fontSize: 22, fontWeight: '900', color: SYS.text },
  rankTitle:   { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  streakBox:   { alignItems: 'center' },
  streakNum:   { fontSize: 18, fontWeight: '900', color: SYS.text },
  dimSmall:    { fontSize: 11, color: SYS.dim, fontWeight: '700', letterSpacing: 0.4 },

  xpTrack: { height: 8, borderRadius: 4, backgroundColor: SYS.line, overflow: 'hidden', marginBottom: 6 },
  xpFill:  { height: 8, borderRadius: 4 },

  penalty: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: C.dangerBg, borderColor: '#ef4444', borderWidth: 1.5,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  penaltyTitle: { color: '#ef4444', fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  penaltyText:  { color: '#ef4444', fontSize: 12, marginTop: 2 },

  questHeader: { fontSize: 15, fontWeight: '800', color: C.text },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 10 },

  qRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: SYS.line },
  qIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: SYS.bg2,
    justifyContent: 'center', alignItems: 'center',
  },
  qTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 },
  qLabel:    { fontSize: 14, fontWeight: '800', color: SYS.text, flexShrink: 1 },
  qLabelDone:{ color: C.greenFg, textDecorationLine: 'line-through' },
  qCount:    { fontSize: 11, fontWeight: '700', color: SYS.dim },
  qTrack:    { height: 5, borderRadius: 3, backgroundColor: SYS.line, overflow: 'hidden', marginTop: 6 },
  qFill:     { height: 5, borderRadius: 3 },
  qHint:     { fontSize: 10, color: SYS.dim, marginTop: 4 },
  qBtn: {
    minWidth: 54, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center',
  },
  qBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },

  rewardBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: SYS.bg2, borderRadius: 12, padding: 10,
  },
  rewardText: { color: SYS.dim, fontSize: 12, fontWeight: '700', flex: 1 },

  bonusRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bonusText: { flex: 1, color: SYS.text, fontSize: 13, fontWeight: '700' },
  bonusXp:   { fontSize: 13, fontWeight: '900' },

  logRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderTopColor: SYS.line, gap: 8 },
  logReason: { color: SYS.text, fontSize: 12, flex: 1 },
  logXp:     { fontSize: 12, fontWeight: '900' },
}));
