import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pressable from './PressableScale';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from './PressableScale';
import { C, themed } from '../lib/palette';
import { Team, TEAM_COLOR } from '../lib/match';

/* ─────────────────────────────────────────────────────────────
   Live billiards rack — one layout per game type.
   8-Ball  · solids vs stripes, black unlocks when a side clears its group
   9-Ball  · lowest ball is the target, potting the 9 wins
   10-Ball · same rotation up to the 10
   Snooker · 15 reds + colours, live points, reds/colours alternate
   The rack lives on the recorder's phone; won frames go to the shared score.
   ───────────────────────────────────────────────────────────── */

export type GameType = 'eightball' | 'nineball' | 'tenball' | 'snooker';
type Player = { user_id: string; name: string };

type Props = {
  gameId: string;
  gameType: GameType;
  players: Record<Team, Player[]>;
  canRecord: boolean;
  onFrameWon: (team: Team, userId: string, note: string) => Promise<void>;
};

/* Pool ball colours (1–7 solids, 9–15 same colours as stripes, 8 black) */
const BALL: Record<number, string> = {
  1: '#f5c400', 2: '#1d4ed8', 3: '#dc2626', 4: '#6d28d9', 5: '#ea580c', 6: '#15803d', 7: '#7f1d1d', 8: '#111111',
  9: '#f5c400', 10: '#1d4ed8', 11: '#dc2626', 12: '#6d28d9', 13: '#ea580c', 14: '#15803d', 15: '#7f1d1d',
};
const SNOOKER_COLOURS = [
  { key: 'yellow', value: 2, color: '#f5c400' },
  { key: 'green',  value: 3, color: '#15803d' },
  { key: 'brown',  value: 4, color: '#78350f' },
  { key: 'blue',   value: 5, color: '#1d4ed8' },
  { key: 'pink',   value: 6, color: '#f472b6' },
  { key: 'black',  value: 7, color: '#111111' },
] as const;

type PoolState = { potted: number[]; groups: { A: 'solids' | 'stripes' | null; B: 'solids' | 'stripes' | null } };
type SnookerState = { reds: number; needColour: boolean; nextColour: number; points: { A: number; B: number } };
type State = { turn: Team; frame: number; pool: PoolState; snooker: SnookerState };

const fresh = (frame = 1, turn: Team = 'A'): State => ({
  turn, frame,
  pool: { potted: [], groups: { A: null, B: null } },
  snooker: { reds: 15, needColour: false, nextColour: 0, points: { A: 0, B: 0 } },
});

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export default function BilliardsRack({ gameId, gameType, players, canRecord, onFrameWon }: Props) {
  const KEY = `rack_${gameId}`;
  const [s, setS] = useState<State>(fresh());
  const history = useRef<State[]>([]);
  const [pick, setPick] = useState<{ team: Team; note: string } | null>(null);

  // restore / persist the rack on this phone
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => { if (raw) try { setS(JSON.parse(raw)); } catch {} }).catch(() => {});
  }, [KEY]);
  useEffect(() => { AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {}); }, [KEY, s]);

  const commit = (next: State) => { history.current.push(s); if (history.current.length > 60) history.current.shift(); setS(next); };
  const undo = () => { const prev = history.current.pop(); if (prev) setS(prev); };

  /* frame won → ask who potted the winning ball (skip if one player) */
  function frameWon(team: Team, note: string) {
    const list = players[team];
    if (list.length === 1) return finishFrame(team, list[0].user_id, note);
    if (list.length === 0) { Alert.alert('No players', `${TEAM_COLOR[team].name} has no players.`); return; }
    setPick({ team, note });
  }
  async function finishFrame(team: Team, userId: string, note: string) {
    setPick(null);
    haptic('success');
    await onFrameWon(team, userId, note);
    history.current = [];
    setS(fresh(s.frame + 1, other(team)));      // loser breaks next frame
  }

  const col = TEAM_COLOR[s.turn];

  /* ── 8-BALL ── */
  function tap8(n: number) {
    if (!canRecord) return;
    const p = s.pool;
    if (p.potted.includes(n)) return;
    const t = s.turn;
    if (n === 8) {
      const g = p.groups[t];
      const own = g === 'solids' ? SOLIDS : g === 'stripes' ? STRIPES : null;
      const cleared = !!own && own.every((b) => p.potted.includes(b));
      if (cleared) { frameWon(t, `${TEAM_COLOR[t].name} potted the black`); }
      else {
        Alert.alert('Black potted early', `That's a loss of frame — ${TEAM_COLOR[other(t)].name} wins it.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: () => frameWon(other(t), 'Black potted early — loss of frame') },
        ]);
      }
      return;
    }
    const groups = { ...p.groups };
    if (!groups.A && !groups.B) {               // open table → first pot decides groups
      groups[t] = n < 8 ? 'solids' : 'stripes';
      groups[other(t)] = n < 8 ? 'stripes' : 'solids';
    }
    commit({ ...s, pool: { potted: [...p.potted, n], groups } });
  }

  /* ── 9-BALL / 10-BALL ── */
  const last = gameType === 'tenball' ? 10 : 9;
  function tapRotation(n: number) {
    if (!canRecord) return;
    if (s.pool.potted.includes(n)) return;
    if (n === last) { frameWon(s.turn, `${TEAM_COLOR[s.turn].name} potted the ${last}`); return; }
    commit({ ...s, pool: { ...s.pool, potted: [...s.pool.potted, n] } });
  }

  /* ── SNOOKER ── */
  const sn = s.snooker;
  const coloursPhase = sn.reds === 0 && !sn.needColour;
  function tapRed() {
    if (!canRecord || sn.reds === 0 || sn.needColour) return;
    commit({ ...s, snooker: { ...sn, reds: sn.reds - 1, needColour: true, points: { ...sn.points, [s.turn]: sn.points[s.turn] + 1 } } });
  }
  function tapColour(i: number) {
    if (!canRecord) return;
    const c = SNOOKER_COLOURS[i];
    const pts = { ...sn.points, [s.turn]: sn.points[s.turn] + c.value };
    if (!coloursPhase) {
      if (!sn.needColour) return;               // must pot a red first
      commit({ ...s, snooker: { ...sn, needColour: false, points: pts } });  // colour is re-spotted
      return;
    }
    if (i !== sn.nextColour) return;            // colours go in order at the end
    const next = { ...s, snooker: { ...sn, nextColour: i + 1, points: pts } };
    commit(next);
    if (i === SNOOKER_COLOURS.length - 1) endSnookerFrame(next.snooker.points);
  }
  function foul(value: number) {
    if (!canRecord) return;
    const opp = other(s.turn);
    commit({ ...s, turn: opp, snooker: { ...sn, needColour: false, points: { ...sn.points, [opp]: sn.points[opp] + value } } });
  }
  function endSnookerFrame(points = sn.points) {
    if (points.A === points.B) { Alert.alert('Scores level', 'Re-spot the black and play on, then end the frame.'); return; }
    const w: Team = points.A > points.B ? 'A' : 'B';
    frameWon(w, `${TEAM_COLOR[w].name} won the frame ${Math.max(points.A, points.B)}–${Math.min(points.A, points.B)}`);
  }
  function endMissed() { // shooter misses → other side at the table; any pending colour is lost
    commit({ ...s, turn: other(s.turn), snooker: { ...sn, needColour: false } });
  }

  /* ── Render helpers ── */
  const PoolBall = ({ n, gone, glow, onPress, size = 32 }: { n: number; gone?: boolean; glow?: boolean; onPress?: () => void; size?: number }) => {
    const stripe = n >= 9;
    const c = BALL[n];
    return (
      <Pressable onPress={onPress} disabled={!canRecord || gone} hitSlop={3} scaleTo={0.85}
        style={[styles.ball, { width: size, height: size, borderRadius: size / 2, backgroundColor: stripe ? '#f8fafc' : c },
          gone && styles.gone, glow && { borderColor: col.bg === '#001645' ? '#afd43a' : '#001645', borderWidth: 3 }]}>
        {stripe && <View style={[styles.stripe, { backgroundColor: c, height: size * 0.5 }]} />}
        <View style={[styles.num, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25 }]}>
          <Text style={[styles.numText, { fontSize: size * 0.28 }]}>{n}</Text>
        </View>
      </Pressable>
    );
  };

  const TurnBar = () => (
    <View style={styles.turnRow}>
      <Text style={styles.turnLabel}>At the table</Text>
      {(['A', 'B'] as Team[]).map((t) => (
        <Pressable key={t} disabled={!canRecord} onPress={() => setS({ ...s, turn: t })}
          style={[styles.turnBtn, s.turn === t && { backgroundColor: TEAM_COLOR[t].bg }]}>
          <Text style={[styles.turnText, s.turn === t && { color: TEAM_COLOR[t].text }]}>{TEAM_COLOR[t].name.replace('Team ', '')}</Text>
        </Pressable>
      ))}
    </View>
  );

  const typeName = { eightball: '8-Ball', nineball: '9-Ball', tenball: '10-Ball', snooker: 'Snooker' }[gameType];

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{typeName} · Frame {s.frame}</Text>
        {canRecord && (
          <Pressable onPress={undo} disabled={!history.current.length} style={styles.undo} hitSlop={6}>
            <Ionicons name="arrow-undo" size={14} color={history.current.length ? C.text : C.faint} />
            <Text style={[styles.undoText, !history.current.length && { color: C.faint }]}>Ball</Text>
          </Pressable>
        )}
      </View>

      <TurnBar />

      {/* 8-BALL */}
      {gameType === 'eightball' && (() => {
        const p = s.pool;
        const open = !p.groups.A && !p.groups.B;
        const groupOf = (t: Team) => (p.groups[t] === 'solids' ? SOLIDS : STRIPES);
        const clearedBy = (t: Team) => !open && groupOf(t).every((b) => p.potted.includes(b));
        return (
          <>
            {open ? (
              <>
                <Text style={styles.hint}>Open table — the first ball potted decides solids or stripes.</Text>
                <View style={styles.rowWrap}>{[...SOLIDS, ...STRIPES].map((n) => <PoolBall key={n} n={n} size={30} gone={p.potted.includes(n)} onPress={() => tap8(n)} />)}</View>
              </>
            ) : (
              (['A', 'B'] as Team[]).map((t) => (
                <View key={t} style={[styles.side, { borderColor: TEAM_COLOR[t].bg }]}>
                  <View style={[styles.sideTag, { backgroundColor: TEAM_COLOR[t].bg }]}>
                    <Text style={[styles.sideTagText, { color: TEAM_COLOR[t].text }]}>
                      {TEAM_COLOR[t].name.replace('Team ', '')} · {p.groups[t] === 'solids' ? 'Solids' : 'Stripes'}
                    </Text>
                  </View>
                  <View style={styles.row}>{groupOf(t).map((n) => <PoolBall key={n} n={n} size={30} gone={p.potted.includes(n)} onPress={() => tap8(n)} />)}</View>
                  {clearedBy(t) && <Text style={styles.onBlack}>On the black</Text>}
                </View>
              ))
            )}
            <View style={styles.blackRow}>
              <PoolBall n={8} size={44} glow={clearedBy(s.turn)} onPress={() => tap8(8)} />
              <Text style={styles.blackHint}>
                {clearedBy(s.turn) ? `${TEAM_COLOR[s.turn].name.replace('Team ', '')} can pot the black to win` : 'Black unlocks when a side clears its group'}
              </Text>
            </View>
          </>
        );
      })()}

      {/* 9-BALL / 10-BALL */}
      {(gameType === 'nineball' || gameType === 'tenball') && (() => {
        const balls = Array.from({ length: last }, (_, i) => i + 1);
        const target = balls.find((b) => !s.pool.potted.includes(b));
        return (
          <>
            <Text style={styles.hint}>
              Hit the lowest ball first. Pot the {last} to win{gameType === 'tenball' ? ' — call every shot' : ''}.
            </Text>
            <View style={styles.rowWrap}>
              {balls.map((n) => (
                <PoolBall key={n} n={n} size={n === last ? 40 : 32} gone={s.pool.potted.includes(n)} glow={n === target} onPress={() => tapRotation(n)} />
              ))}
            </View>
            {target && <Text style={styles.targetText}>Target: <Text style={{ fontWeight: '900', color: C.text }}>{target}</Text></Text>}
          </>
        );
      })()}

      {/* SNOOKER */}
      {gameType === 'snooker' && (
        <>
          <View style={styles.snPoints}>
            {(['A', 'B'] as Team[]).map((t) => (
              <View key={t} style={[styles.snSide, { backgroundColor: TEAM_COLOR[t].bg }]}>
                <Text style={[styles.snName, { color: TEAM_COLOR[t].text }]}>{TEAM_COLOR[t].name.replace('Team ', '')}</Text>
                <Text style={[styles.snScore, { color: TEAM_COLOR[t].text }]}>{sn.points[t]}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>
            {coloursPhase ? `Colours in order — next: ${SNOOKER_COLOURS[sn.nextColour]?.key ?? 'done'}`
              : sn.needColour ? 'Red potted — now any colour' : `Pot a red (${sn.reds} left)`}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={tapRed} disabled={!canRecord || sn.reds === 0 || sn.needColour}
              style={[styles.red, (sn.reds === 0 || sn.needColour) && styles.gone]}>
              <Text style={styles.redText}>{sn.reds}</Text>
            </Pressable>
            {SNOOKER_COLOURS.map((c, i) => {
              const potted = coloursPhase && i < sn.nextColour;
              const active = coloursPhase ? i === sn.nextColour : sn.needColour;
              return (
                <Pressable key={c.key} onPress={() => tapColour(i)} disabled={!canRecord || !active}
                  style={[styles.colour, { backgroundColor: c.color }, (!active || potted) && styles.gone]}>
                  <Text style={[styles.colourText, c.key === 'yellow' && { color: '#111' }]}>{c.value}</Text>
                </Pressable>
              );
            })}
          </View>
          {canRecord && (
            <View style={styles.snBtns}>
              <Pressable style={styles.snBtn} onPress={endMissed}><Text style={styles.snBtnText}>Miss · switch</Text></Pressable>
              <Pressable style={styles.snBtn} onPress={() => foul(4)}><Text style={styles.snBtnText}>Foul +4</Text></Pressable>
              <Pressable style={[styles.snBtn, styles.snEnd]} onPress={() => endSnookerFrame()}><Text style={[styles.snBtnText, { color: '#fff' }]}>End frame</Text></Pressable>
            </View>
          )}
        </>
      )}

      {!canRecord && <Text style={styles.watch}>Live rack is shown on the recorder's phone.</Text>}

      {/* Who potted the winning ball? */}
      <Modal visible={!!pick} transparent animationType="fade" onRequestClose={() => setPick(null)}>
        <Pressable style={styles.modalBg} onPress={() => setPick(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}} scaleTo={1} haptic={false}>
            <Text style={styles.modalTitle}>Frame to {pick ? TEAM_COLOR[pick.team].name : ''}</Text>
            <Text style={styles.modalSub}>{pick?.note}. Who gets the frame?</Text>
            {pick && players[pick.team].map((p) => (
              <Pressable key={p.user_id} style={[styles.pickRow, { backgroundColor: TEAM_COLOR[pick.team].bg }]}
                onPress={() => finishFrame(pick.team, p.user_id, pick.note)}>
                <Text style={[styles.pickText, { color: TEAM_COLOR[pick.team].text }]}>{p.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setPick(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: '#0f5132' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#ffffff', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  undoText: { fontSize: 11, fontWeight: '800', color: C.text },

  turnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  turnLabel: { color: '#d1fae5', fontSize: 11, fontWeight: '800', marginRight: 'auto' },
  turnBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  turnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },

  hint: { color: '#d1fae5', fontSize: 11, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },

  ball: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' },
  stripe: { position: 'absolute', left: 0, right: 0 },
  num: { backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  numText: { color: '#111111', fontWeight: '900' },
  gone: { opacity: 0.22 },

  side: { borderWidth: 2, borderRadius: 14, padding: 8, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.15)' },
  sideTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 6 },
  sideTagText: { fontSize: 11, fontWeight: '900' },
  onBlack: { color: '#fde68a', fontSize: 11, fontWeight: '900', marginTop: 6 },

  blackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  blackHint: { color: '#d1fae5', fontSize: 11, flex: 1 },
  targetText: { color: '#d1fae5', fontSize: 12, textAlign: 'center', marginTop: 8 },

  snPoints: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  snSide: { flex: 1, borderRadius: 12, paddingVertical: 6, alignItems: 'center' },
  snName: { fontSize: 11, fontWeight: '900' },
  snScore: { fontSize: 26, fontWeight: '900' },
  red: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#b91c1c', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fecaca' },
  redText: { color: '#ffffff', fontWeight: '900', fontSize: 14 },
  colour: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' },
  colourText: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
  snBtns: { flexDirection: 'row', gap: 6, marginTop: 10 },
  snBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  snEnd: { backgroundColor: '#dc2626' },
  snBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },

  watch: { color: '#d1fae5', fontSize: 11, textAlign: 'center', marginTop: 8 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,22,69,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: C.card, borderRadius: 20, padding: 18, gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: '900', color: C.text },
  modalSub: { fontSize: 13, color: C.muted, marginBottom: 4 },
  pickRow: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  pickText: { fontSize: 14, fontWeight: '800' },
  cancel: { textAlign: 'center', color: C.muted, fontWeight: '700', paddingTop: 6 },
}));
