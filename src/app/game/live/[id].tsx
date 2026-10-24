import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Pressable from '../../../components/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../../components/ScreenHeader';
import AppIcon from '../../../components/AppIcon';
import ScorePop from '../../../components/ScorePop';
import { haptic } from '../../../components/PressableScale';
import BilliardsRack, { GameType } from '../../../components/BilliardsRack';
import { useAuth } from '../../../lib/auth';
import { Sport, SPORT_LABEL } from '../../../lib/constants';
import { elapsed, MatchStatus, SCORE_LABEL, Team, TEAM_COLOR } from '../../../lib/match';
import { supabase } from '../../../lib/supabase';
import { C, themed } from '../../../lib/palette';

type GameRow = {
  id: string; sport: Sport; host_id: string;
  match_status?: MatchStatus; score_a?: number; score_b?: number; winner?: 'A' | 'B' | 'draw' | null;
  live_started_at?: string | null; ended_at?: string | null; open_recording?: boolean;
  game_type?: string | null;
};
type TeamRow  = { user_id: string; team: Team; profiles: { display_name: string } | null };
type EventRow = { id: string; user_id: string; team: Team; kind: 'goal' | 'assist'; created_at: string };

export default function LiveMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();

  const [game, setGame]     = useState<GameRow | null>(null);
  const [teams, setTeams]   = useState<TeamRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isPlayer, setIsPlayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState<string | null>(null);
  const [, setTick]         = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const [g, t, e, me] = await Promise.all([
      supabase.from('games').select('*').eq('id', id).single(),
      supabase.from('game_teams').select('user_id, team, profiles(display_name)').eq('game_id', id),
      supabase.from('match_events').select('id, user_id, team, kind, created_at').eq('game_id', id).order('created_at'),
      supabase.from('game_players').select('user_id').eq('game_id', id).eq('user_id', uid ?? ''),
    ]);
    const err = g.error ?? t.error ?? e.error;
    setError(err ? err.message : null);
    if (g.data) setGame(g.data as any);
    setTeams((t.data ?? []) as any);
    setEvents((e.data ?? []) as any);
    setIsPlayer(!!me.data?.length);
    setLoading(false);
  }, [id, uid]);

  useEffect(() => { load(); }, [load]);

  // Live updates — unique channel name per mount
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`live_${id}_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `game_id=eq.${id}` }, () => loadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_teams',   filter: `game_id=eq.${id}` }, () => loadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games',        filter: `id=eq.${id}` },      () => loadRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Match clock
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Live Match" />
        <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }
  if (!game) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Live Match" />
        <Text style={styles.errorText}>{error ?? 'Game not found.'}</Text>
      </View>
    );
  }

  const isHost    = game.host_id === uid;
  const status    = game.match_status ?? 'scheduled';
  const live      = status === 'live';
  const finished  = status === 'finished';
  const canRecord = live && (isHost || (!!game.open_recording && isPlayer));
  const label     = SCORE_LABEL[game.sport] ?? SCORE_LABEL.football;

  const statsOf = (u: string) => ({
    goals:   events.filter((e) => e.user_id === u && e.kind === 'goal').length,
    assists: events.filter((e) => e.user_id === u && e.kind === 'assist').length,
  });

  async function rpc(key: string, fn: string, args: Record<string, unknown>) {
    setBusy(key);
    const { error: err } = await supabase.rpc(fn, args);
    setBusy(null);
    if (err) { haptic('warning'); Alert.alert('Could not update', err.message); }
    else if (key.includes(':goal') || key.includes(':assist')) haptic('success');
    else if (key === 'end') haptic('heavy');
    await load();
  }

  const record = (u: string, kind: 'goal' | 'assist') => rpc(`${u}:${kind}`, 'record_event', { p_game: game.id, p_user: u, p_kind: kind });
  const undo   = () => rpc('undo', 'undo_last_event', { p_game: game.id });
  const toggleOpen = (on: boolean) => rpc('open', 'set_open_recording', { p_game: game.id, p_on: on });

  function switchTeam(t: TeamRow) {
    if (!isHost || !live) return;
    Alert.alert('Move player?', `Move ${t.profiles?.display_name ?? 'this player'} to ${TEAM_COLOR[t.team === 'A' ? 'B' : 'A'].name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: () => rpc(`sw:${t.user_id}`, 'switch_team', { p_game: game!.id, p_user: t.user_id }) },
    ]);
  }

  function confirmEnd() {
    Alert.alert('End the game?', `Final score ${game!.score_a ?? 0} – ${game!.score_b ?? 0}. This can't be undone.`, [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'End game', style: 'destructive', onPress: () => rpc('end', 'end_match', { p_game: game!.id }) },
    ]);
  }

  // MVP for the result card
  const ranked = teams
    .map((t) => ({ ...t, ...statsOf(t.user_id) }))
    .filter((p) => p.goals + p.assists > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  const mvp = ranked[0];

  const winnerText = game.winner === 'draw' ? "It's a draw" : game.winner ? `${TEAM_COLOR[game.winner].name} wins` : '';

  const Half = ({ team }: { team: Team }) => {
    const col = TEAM_COLOR[team];
    const list = teams.filter((t) => t.team === team);
    const won = finished && game.winner === team;
    return (
      <View style={[styles.half, { backgroundColor: col.bg }]}>
        <View style={styles.halfHead}>
          <Text style={[styles.halfName, { color: col.text }]}>{col.name}</Text>
          {won && <Ionicons name="trophy" size={16} color={team === 'A' ? '#afd43a' : '#001645'} />}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {list.length === 0 && <Text style={[styles.emptyHalf, { color: col.text }]}>No players</Text>}
          {list.map((t) => {
            const s = statsOf(t.user_id);
            const name = t.profiles?.display_name ?? 'Player';
            return (
              <Pressable
                key={t.user_id}
                onLongPress={() => switchTeam(t)}
                style={[styles.pRow, { backgroundColor: col.soft }]}
              >
                <Text style={[styles.pName, { color: col.text }]} numberOfLines={1}>
                  {name}{t.user_id === uid ? ' · You' : ''}
                </Text>
                <View style={styles.pStats}>
                  <AppIcon name={label.icon} size={12} color={col.text} />
                  <ScorePop value={s.goals} style={[styles.pStat, { color: col.text }]} pop={1.6} />
                  {label.assists && (
                    <>
                      <Text style={[styles.pStatA, { color: col.text }]}>A</Text>
                      <Text style={[styles.pStat, { color: col.text }]}>{s.assists}</Text>
                    </>
                  )}
                </View>
                {canRecord && (
                  <View style={styles.pBtns}>
                    <Pressable
                      style={[styles.addBtn, { backgroundColor: col.btn }]}
                      onPress={() => record(t.user_id, 'goal')}
                      haptic={false}
                      scaleTo={0.9}
                      disabled={!!busy}
                      accessibilityLabel={`Add ${label.one.toLowerCase()} for ${name}`}
                    >
                      {busy === `${t.user_id}:goal`
                        ? <ActivityIndicator size="small" color={col.btnText} />
                        : <Text style={[styles.addText, { color: col.btnText }]}>+ {label.one}</Text>}
                    </Pressable>
                    {label.assists && (
                      <Pressable
                        style={[styles.addBtn, styles.addBtnGhost, { borderColor: col.btn }]}
                        onPress={() => record(t.user_id, 'assist')}
                        haptic={false}
                        scaleTo={0.9}
                        disabled={!!busy}
                        accessibilityLabel={`Add assist for ${name}`}
                      >
                        {busy === `${t.user_id}:assist`
                          ? <ActivityIndicator size="small" color={col.text} />
                          : <Text style={[styles.addText, { color: col.text }]}>+ Assist</Text>}
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={finished ? 'Full Time' : 'Live Match'}
        subtitle={SPORT_LABEL[game.sport]}
        onBack={() => router.back()}
        right={live ? (
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        ) : undefined}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      {status === 'scheduled' ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={40} color={C.faint} />
          <Text style={styles.centerTitle}>Not started yet</Text>
          <Text style={styles.centerHint}>The host starts the match from the game screen.</Text>
        </View>
      ) : (
        <>
          {/* Scoreboard */}
          <View style={styles.board}>
            <View style={[styles.boardSide, { backgroundColor: TEAM_COLOR.A.bg }]}>
              <Text style={[styles.boardTeam, { color: TEAM_COLOR.A.text }]}>NAVY</Text>
              <ScorePop value={game.score_a ?? 0} style={[styles.boardScore, { color: TEAM_COLOR.A.text }]} />
            </View>
            <View style={styles.boardMid}>
              <Text style={styles.boardClock}>{elapsed(game.live_started_at ?? null, finished ? game.ended_at : null)}</Text>
              <Text style={styles.boardSep}>:</Text>
            </View>
            <View style={[styles.boardSide, { backgroundColor: TEAM_COLOR.B.bg }]}>
              <Text style={[styles.boardTeam, { color: TEAM_COLOR.B.text }]}>LIME</Text>
              <ScorePop value={game.score_b ?? 0} style={[styles.boardScore, { color: TEAM_COLOR.B.text }]} />
            </View>
          </View>

          {/* Billiards: live rack for the chosen game type */}
          {live && game.sport === 'billiards' && (
            <BilliardsRack
              gameId={game.id}
              gameType={(['eightball','nineball','tenball','snooker'].includes(game.game_type ?? '') ? game.game_type : 'eightball') as GameType}
              canRecord={canRecord}
              players={{
                A: teams.filter((t) => t.team === 'A').map((t) => ({ user_id: t.user_id, name: t.profiles?.display_name ?? 'Player' })),
                B: teams.filter((t) => t.team === 'B').map((t) => ({ user_id: t.user_id, name: t.profiles?.display_name ?? 'Player' })),
              }}
              onFrameWon={async (_team, userId) => { await record(userId, 'goal'); }}
            />
          )}

          {/* Result */}
          {finished && (
            <View style={styles.result}>
              <Ionicons name="trophy" size={22} color={C.amberFg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>{winnerText}</Text>
                {mvp && (
                  <Text style={styles.resultSub}>
                    MVP: {mvp.profiles?.display_name ?? 'Player'} · {mvp.goals} {label.one.toLowerCase()}{mvp.goals === 1 ? '' : 's'}
                    {label.assists ? ` · ${mvp.assists} assist${mvp.assists === 1 ? '' : 's'}` : ''}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Split screen */}
          <View style={styles.split}>
            <Half team="A" />
            <Half team="B" />
          </View>

          {/* Controls */}
          {live && (
            <View style={styles.controls}>
              {isHost && (
                <View style={styles.openRow}>
                  <Text style={styles.openText}>Everyone can record</Text>
                  <Switch
                    value={!!game.open_recording}
                    onValueChange={toggleOpen}
                    trackColor={{ true: C.accent, false: C.border2 }}
                    thumbColor="#ffffff"
                  />
                </View>
              )}
              {canRecord && (
                <View style={styles.ctrlRow}>
                  <Pressable style={[styles.ctrlBtn, styles.ctrlGhost]} onPress={undo} disabled={!!busy || events.length === 0}>
                    <Ionicons name="arrow-undo" size={16} color={C.text} />
                    <Text style={[styles.ctrlText, { color: C.text }]}>Undo last</Text>
                  </Pressable>
                  {isHost && (
                    <Pressable style={[styles.ctrlBtn, styles.ctrlEnd]} onPress={confirmEnd} disabled={!!busy} haptic="medium">
                      <Ionicons name="stop" size={16} color="#ffffff" />
                      <Text style={[styles.ctrlText, { color: '#ffffff' }]}>End Game</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {!canRecord && <Text style={styles.watchHint}>Watching live — the host records the score.</Text>}
              {isHost && <Text style={styles.tip}>Tip: long-press a player to move them to the other team.</Text>}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  errorText: { color: '#ef4444', fontSize: 13, margin: 16 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  centerTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 6 },
  centerHint: { fontSize: 13, color: C.muted, textAlign: 'center' },

  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff' },
  liveText: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  board: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 16, marginTop: 14, borderRadius: 18, overflow: 'hidden' },
  boardSide: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  boardTeam: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, opacity: 0.85 },
  boardScore: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
  boardMid: { width: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  boardClock: { fontSize: 13, fontWeight: '800', color: C.muted, fontVariant: ['tabular-nums'] },
  boardSep: { fontSize: 26, fontWeight: '900', color: C.text },

  result: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12,
    padding: 14, borderRadius: 16, backgroundColor: C.amberBg,
  },
  resultTitle: { fontSize: 16, fontWeight: '900', color: C.text },
  resultSub: { fontSize: 12, color: C.muted, marginTop: 2 },

  split: { flex: 1, flexDirection: 'row', gap: 8, margin: 16 },
  half: { flex: 1, borderRadius: 18, padding: 10 },
  halfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  halfName: { fontSize: 14, fontWeight: '900' },
  emptyHalf: { fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 20 },

  pRow: { borderRadius: 12, padding: 8, marginBottom: 8 },
  pName: { fontSize: 13, fontWeight: '800' },
  pStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  pStat: { fontSize: 12, fontWeight: '900', marginRight: 6 },
  pStatA: { fontSize: 11, fontWeight: '900', opacity: 0.8 },
  pBtns: { flexDirection: 'row', gap: 6, marginTop: 7 },
  addBtn: { flex: 1, borderRadius: 9, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', minHeight: 28 },
  addBtnGhost: { backgroundColor: 'transparent', borderWidth: 1.5 },
  addText: { fontSize: 11, fontWeight: '900' },

  controls: { paddingHorizontal: 16, paddingBottom: 30, gap: 10 },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  openText: { fontSize: 13, fontWeight: '700', color: C.text },
  ctrlRow: { flexDirection: 'row', gap: 10 },
  ctrlBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 16 },
  ctrlGhost: { backgroundColor: C.surface },
  ctrlEnd: { backgroundColor: '#dc2626' },
  ctrlText: { fontSize: 14, fontWeight: '800' },
  watchHint: { fontSize: 12, color: C.muted, textAlign: 'center' },
  tip: { fontSize: 11, color: C.faint, textAlign: 'center' },
}));
