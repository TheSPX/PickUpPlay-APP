import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from '../components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import BilliardsRack, { GameType } from '../components/BilliardsRack';
import AppIcon from '../components/AppIcon';
import ScorePop from '../components/ScorePop';
import { haptic } from '../components/PressableScale';
import { SCORE_LABEL, Team, TEAM_COLOR } from '../lib/match';
import { Sport } from '../lib/constants';
import { C, themed } from '../lib/palette';

/* ─────────────────────────────────────────────────────────────
   OFFLINE DEMO — practise the live match with made-up players.
   Nothing is sent to Supabase; everything stays on this phone.
   Open it with:  pickupplay://demo
   ───────────────────────────────────────────────────────────── */

type Mode = { sport: Sport; gameType?: GameType; label: string };
const MODES: Mode[] = [
  { sport: 'football',   label: 'Football' },
  { sport: 'basketball', label: 'Basketball' },
  { sport: 'billiards',  gameType: 'eightball', label: '8-Ball' },
  { sport: 'billiards',  gameType: 'nineball',  label: '9-Ball' },
  { sport: 'billiards',  gameType: 'tenball',   label: '10-Ball' },
  { sport: 'billiards',  gameType: 'snooker',   label: 'Snooker' },
];

const PLAYERS: Record<Team, { user_id: string; name: string }[]> = {
  A: [{ user_id: 'a1', name: 'Amine' }, { user_id: 'a2', name: 'Karim' }, { user_id: 'a3', name: 'Leo' }],
  B: [{ user_id: 'b1', name: 'Yassine' }, { user_id: 'b2', name: 'Omar' }, { user_id: 'b3', name: 'Sami' }],
};

type Ev = { user_id: string; team: Team; kind: 'goal' | 'assist' };

export default function Demo() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(MODES[0]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [rackKey, setRackKey] = useState(0);

  const billiards = mode.sport === 'billiards';
  const lbl = SCORE_LABEL[mode.sport];
  const players = billiards ? { A: PLAYERS.A.slice(0, 1), B: PLAYERS.B.slice(0, 1) } : PLAYERS;
  const score = (t: Team) => events.filter((e) => e.team === t && e.kind === 'goal').length;
  const stat = (u: string, k: 'goal' | 'assist') => events.filter((e) => e.user_id === u && e.kind === k).length;

  const add = (team: Team, user_id: string, kind: 'goal' | 'assist') => { haptic('success'); setEvents((ev) => [...ev, { team, user_id, kind }]); };
  const reset = (m: Mode) => { setMode(m); setEvents([]); setRackKey((k) => k + 1); };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Demo Match" subtitle="Offline practice · nothing is saved online" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Mode picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes}>
          {MODES.map((m) => {
            const on = m.label === mode.label;
            return (
              <Pressable key={m.label} onPress={() => reset(m)} style={[styles.mode, on && styles.modeOn]}>
                <Text style={[styles.modeText, on && styles.modeTextOn]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Scoreboard */}
        <View style={styles.board}>
          {(['A', 'B'] as Team[]).map((t, i) => (
            <View key={t} style={{ flex: 1, flexDirection: 'row' }}>
              {i === 1 && <View style={styles.boardMid}><Text style={styles.boardSep}>:</Text></View>}
              <View style={[styles.boardSide, { backgroundColor: TEAM_COLOR[t].bg }]}>
                <Text style={[styles.boardTeam, { color: TEAM_COLOR[t].text }]}>{t === 'A' ? 'NAVY' : 'LIME'}</Text>
                <ScorePop value={score(t)} style={[styles.boardScore, { color: TEAM_COLOR[t].text }]} />
              </View>
            </View>
          ))}
        </View>

        {billiards && mode.gameType && (
          <BilliardsRack
            key={`${mode.label}-${rackKey}`}
            gameId={`demo-${mode.gameType}-${rackKey}`}
            gameType={mode.gameType}
            canRecord
            players={players}
            onFrameWon={async (team, userId) => add(team, userId, 'goal')}
          />
        )}

        {/* Split halves */}
        <View style={styles.split}>
          {(['A', 'B'] as Team[]).map((t) => {
            const col = TEAM_COLOR[t];
            return (
              <View key={t} style={[styles.half, { backgroundColor: col.bg }]}>
                <Text style={[styles.halfName, { color: col.text }]}>{col.name}</Text>
                {players[t].map((p) => (
                  <View key={p.user_id} style={[styles.pRow, { backgroundColor: col.soft }]}>
                    <Text style={[styles.pName, { color: col.text }]}>{p.name}</Text>
                    <View style={styles.pStats}>
                      <AppIcon name={lbl.icon} size={12} color={col.text} />
                      <Text style={[styles.pStat, { color: col.text }]}>{stat(p.user_id, 'goal')}</Text>
                      {lbl.assists && <Text style={[styles.pStat, { color: col.text }]}>A {stat(p.user_id, 'assist')}</Text>}
                    </View>
                    {!billiards && (
                      <View style={styles.pBtns}>
                        <Pressable style={[styles.addBtn, { backgroundColor: col.btn }]} onPress={() => add(t, p.user_id, 'goal')}>
                          <Text style={[styles.addText, { color: col.btnText }]}>+ {lbl.one}</Text>
                        </Pressable>
                        {lbl.assists && (
                          <Pressable style={[styles.addBtn, styles.ghost, { borderColor: col.btn }]} onPress={() => add(t, p.user_id, 'assist')}>
                            <Text style={[styles.addText, { color: col.text }]}>+ Assist</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        <View style={styles.ctrlRow}>
          <Pressable style={styles.ctrl} onPress={() => setEvents((e) => e.slice(0, -1))} disabled={!events.length}>
            <Ionicons name="arrow-undo" size={16} color={C.text} /><Text style={styles.ctrlText}>Undo last</Text>
          </Pressable>
          <Pressable style={styles.ctrl} onPress={() => reset(mode)}>
            <Ionicons name="refresh" size={16} color={C.text} /><Text style={styles.ctrlText}>Reset</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>Demo only — real matches are recorded from a game's Start Game button.</Text>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  modes: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  mode: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface },
  modeOn: { backgroundColor: C.primary },
  modeText: { fontSize: 13, fontWeight: '700', color: C.muted },
  modeTextOn: { color: C.onPrimary },

  board: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 18, overflow: 'hidden' },
  boardSide: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  boardMid: { width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  boardSep: { fontSize: 26, fontWeight: '900', color: C.text },
  boardTeam: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  boardScore: { fontSize: 44, fontWeight: '900' },

  split: { flexDirection: 'row', gap: 8, margin: 16 },
  half: { flex: 1, borderRadius: 18, padding: 10 },
  halfName: { fontSize: 14, fontWeight: '900', marginBottom: 8 },
  pRow: { borderRadius: 12, padding: 8, marginBottom: 8 },
  pName: { fontSize: 13, fontWeight: '800' },
  pStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  pStat: { fontSize: 12, fontWeight: '900', marginRight: 6 },
  pBtns: { flexDirection: 'row', gap: 6, marginTop: 7 },
  addBtn: { flex: 1, borderRadius: 9, paddingVertical: 6, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5 },
  addText: { fontSize: 11, fontWeight: '900' },

  ctrlRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  ctrl: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: C.surface },
  ctrlText: { fontSize: 14, fontWeight: '800', color: C.text },
  note: { fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 12 },
}));
