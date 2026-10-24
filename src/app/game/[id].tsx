import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pressable from '../../components/PressableScale';
import KeyboardScroll from '../../components/KeyboardScroll';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader';
import AppIcon from '../../components/AppIcon';
import { Image as ExpoImage } from 'expo-image';
import { useAuth } from '../../lib/auth';
import {
  formatWhen, skillRangeText, SKILL_ICON, SKILL_COLOR, SKILL_LABEL, SKILL_DESC, SKILLS,
  Sport, SPORT_LABEL, Skill, fromDbSkill, gameTypeLabel,
} from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import GameChatPanel, { GameChatInput } from '../../components/GameChatPanel';
import { roleIcon, roleLabel } from '../../lib/evaluation';
import { splitTeams, TeamPlayer } from '../../lib/teams';
import { markChatSeen, unreadCount } from '../../lib/chatSeen';
import { getGameWeather, GameWeather } from '../../lib/weather';
import RateTeammates from '../../components/RateTeammates';
import { C, themed } from '../../lib/palette';

type GameDetails = {
  id: string;
  host_id: string;
  sport: Sport;
  starts_at: string;
  min_skill: any;
  max_skill: any;
  capacity: number;
  status: 'open' | 'cancelled';
  notes: string | null;
  game_type?: string | null;
  courts: { name: string; address: string; image_url: string | null; lat: number | null; lng: number | null } | null;
};

type PlayerRow = {
  user_id: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
};

const SPORT_BG: Record<string, string> = themed(() => ({
  padel: '#1a4a2a',
  football: '#1a3a5c',
  basketball: C.amberFg,
  badminton: '#1a3a4a',
  billiards: '#123c3a',
}));

/* ── toDbSkill: convert 'competitive' → 'advanced' for DB writes ── */
function toDbSkill(s: Skill): string {
  return s === 'competitive' ? 'advanced' : s;
}

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();

  const [currentTime] = useState(() => Date.now());
  const [skillInfoOpen, setSkillInfoOpen] = useState(false);
  const [chatRefresh, setChatRefresh] = useState(0);
  const [playerSkills, setPlayerSkills] = useState<Record<string, { skill: Skill; role: string | null; score: number | null }>>({});
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [weather, setWeather] = useState<GameWeather | null | undefined>(undefined); // undefined = loading
  const [kbHeight, setKbHeight] = useState(0);

  // Track keyboard height so the floating chat box always sits right above it
  // (Android edge-to-edge no longer resizes the window, so we lift it manually)
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const [ratedCount, setRatedCount] = useState(0);
  const [waitlist, setWaitlist] = useState<string[]>([]); // user ids in queue order
  const [activeTab, setActiveTab] = useState<'overview' | 'details'>('overview');
  const [saved, setSaved] = useState(false);

  const [game, setGame] = useState<GameDetails | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  /* ── Edit mode state ── */
  const [editMode, setEditMode] = useState(false);
  const [editStartsAt, setEditStartsAt] = useState<Date>(new Date());
  const [editMinSkill, setEditMinSkill] = useState<Skill>('beginner');
  const [editMaxSkill, setEditMaxSkill] = useState<Skill>('beginner');
  const [editCapacity, setEditCapacity] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || !uid) return;
    const [gameRes, playersRes] = await Promise.all([
      supabase
        .from('games')
        .select('*, courts(name, address, image_url, lat, lng)')
        .eq('id', id)
        .single(),
      supabase
        .from('game_players')
        .select('user_id, profiles(display_name, avatar_url)')
        .eq('game_id', id),
    ]);

    if (gameRes.error || !gameRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const raw = gameRes.data as any;
    setGame({ ...raw, min_skill: fromDbSkill(raw.min_skill), max_skill: fromDbSkill(raw.max_skill) } as GameDetails);
    // Forecast at the court for the game's start (NJUPT fallback)
    getGameWeather(
      Number(raw.courts?.lat ?? 32.1147),
      Number(raw.courts?.lng ?? 118.9343),
      raw.starts_at,
    ).then(setWeather);

    const plist = (playersRes.data ?? []) as unknown as PlayerRow[];
    setPlayers(plist);
    setLoading(false);

    // Level + role for each player in this game's sport
    const ids = plist.map((p) => p.user_id);
    if (ids.length) {
      const { data: ps } = await supabase
        .from('player_sports')
        .select('user_id, skill, role, score')
        .eq('sport', raw.sport)
        .in('user_id', ids);
      setPlayerSkills(Object.fromEntries((ps ?? []).map((r: any) => [
        r.user_id, { skill: fromDbSkill(r.skill), role: r.role ?? null, score: r.score ?? null },
      ])));
    } else {
      setPlayerSkills({});
    }

    // Unread chat count
    setUnread(await unreadCount(id, uid));

    // Waitlist (ignored if table doesn't exist yet)
    const { data: wl } = await supabase
      .from('game_waitlist').select('user_id').eq('game_id', id).order('created_at');
    setWaitlist((wl ?? []).map((r: any) => r.user_id));

    // How many teammates I've already rated
    const { count: rc } = await supabase
      .from('skill_votes').select('id', { count: 'exact', head: true })
      .eq('game_id', id).eq('voter_id', uid);
    setRatedCount(rc ?? 0);
  }, [id, uid]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function runAction(fn: 'join_game' | 'leave_game' | 'cancel_game') {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_game_id: id });
    setBusy(false);
    if (error) {
      Alert.alert('Action failed', error.message);
    } else {
      await load();
    }
  }

  async function startMatch() {
    if (!game || !id) return;
    if (players.length < 2) { Alert.alert('Not enough players', 'You need at least 2 players to start.'); return; }
    const tp: TeamPlayer[] = players.map((p) => ({
      user_id: p.user_id,
      name: p.profiles?.display_name ?? 'Player',
      skill: playerSkills[p.user_id]?.skill,
      role: playerSkills[p.user_id]?.role,
      score: playerSkills[p.user_id]?.score,
    }));
    const { A, B } = splitTeams(tp, game.sport);
    Alert.alert(
      'Start the game?',
      `Teams are split fairly by skill:\n\nNavy: ${A.map((p) => p.name).join(', ')}\nLime: ${B.map((p) => p.name).join(', ')}\n\nYou can move players later by long-pressing them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start', onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc('start_match', {
              p_game: game.id,
              p_team_a: A.map((p) => p.user_id),
              p_team_b: B.map((p) => p.user_id),
            });
            setBusy(false);
            if (error) { Alert.alert('Could not start', error.message); return; }
            await load();
            router.push(`/game/live/${game.id}` as any);
          },
        },
      ],
    );
  }

  async function toggleWaitlist(onList: boolean) {
    if (!id || !uid) return;
    setBusy(true);
    const { error } = onList
      ? await supabase.from('game_waitlist').delete().eq('game_id', id).eq('user_id', uid)
      : await supabase.from('game_waitlist').insert({ game_id: id, user_id: uid });
    setBusy(false);
    if (error) Alert.alert('Waitlist', error.message);
    await load();
  }

  function confirmAction(action: 'leave' | 'cancel') {
    const isCancel = action === 'cancel';
    Alert.alert(
      isCancel ? 'Cancel this game?' : 'Leave this game?',
      isCancel ? 'It will disappear for everyone.' : 'Your spot will open up for others.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: () => runAction(isCancel ? 'cancel_game' : 'leave_game'),
        },
      ]
    );
  }

  /* ── Kick player ── */
  function confirmKick(player: PlayerRow) {
    const name = player.profiles?.display_name ?? 'this player';
    Alert.alert(
      'Remove player?',
      `Remove ${name} from this game? Their spot will open up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from('game_players')
              .delete()
              .eq('game_id', id)
              .eq('user_id', player.user_id);
            setBusy(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await load();
            }
          },
        },
      ]
    );
  }

  /* ── Open edit panel (pre-fill from current game) ── */
  function openEdit() {
    if (!game) return;
    setEditStartsAt(new Date(game.starts_at));
    setEditMinSkill(game.min_skill as Skill);
    setEditMaxSkill(game.max_skill as Skill);
    setEditCapacity(String(game.capacity));
    setEditNotes(game.notes ?? '');
    setEditMode(true);
  }

  /* ── Save edited game ── */
  async function saveEdit() {
    if (!game) return;
    const cap = parseInt(editCapacity, 10);
    if (!cap || cap < players.length) {
      Alert.alert(
        'Invalid capacity',
        cap < players.length
          ? `Can't set capacity below current player count (${players.length}).`
          : 'Please enter a valid number.'
      );
      return;
    }
    if (SKILLS.indexOf(editMinSkill) > SKILLS.indexOf(editMaxSkill)) {
      Alert.alert('Invalid skill range', 'Min skill cannot exceed max skill.');
      return;
    }
    setEditBusy(true);
    const { error } = await supabase
      .from('games')
      .update({
        starts_at: editStartsAt.toISOString(),
        min_skill: toDbSkill(editMinSkill),
        max_skill: toDbSkill(editMaxSkill),
        capacity: cap,
        notes: editNotes.trim() || null,
      })
      .eq('id', game.id);
    setEditBusy(false);
    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      setEditMode(false);
      await load();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={theme.colors.navy} />
      </View>
    );
  }

  if (notFound || !game) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>Game not found.</Text>
      </View>
    );
  }

  const isHost = game.host_id === uid;
  const isJoined = players.some((p) => p.user_id === uid);
  const isCancelled = game.status === 'cancelled';
  const hasStarted = new Date(game.starts_at).getTime() <= currentTime;
  const isFull = players.length >= game.capacity;

  const heroBg = SPORT_BG[game.sport] ?? '#1a3a5c';
  const startDate = new Date(game.starts_at);
  const isToday = startDate.toDateString() === new Date().toDateString();
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateLabel = isToday ? `Today, ${timeStr}` : formatWhen(game.starts_at);

  // Build action button props
  let actionLabel = 'Join Now';
  let actionIcon: 'navigate-outline' | null = 'navigate-outline';
  let actionStyle = styles.actionBtn;
  let actionDisabled = false;
  let actionFn: () => void = () => runAction('join_game');

  if (isHost) {
    actionLabel = 'Cancel Game';
    actionIcon = null;
    actionStyle = { ...styles.actionBtn, ...styles.btnDanger };
    actionFn = () => confirmAction('cancel');
  } else if (isJoined) {
    actionLabel = 'Leave Game';
    actionIcon = null;
    actionStyle = { ...styles.actionBtn, ...styles.btnDanger };
    actionFn = () => confirmAction('leave');
  } else if (isFull) {
    const pos = waitlist.indexOf(uid ?? '');
    if (pos >= 0) {
      actionLabel = `On waitlist · #${pos + 1}  (tap to leave)`;
      actionIcon = null;
      actionStyle = { ...styles.actionBtn, ...styles.btnWait };
      actionFn = () => toggleWaitlist(true);
    } else {
      actionLabel = waitlist.length ? `Join waitlist (${waitlist.length} waiting)` : 'Full · Join waitlist';
      actionIcon = null;
      actionStyle = { ...styles.actionBtn, ...styles.btnWait };
      actionFn = () => toggleWaitlist(false);
    }
  }

  const showAction = !isCancelled && !hasStarted;
  const showChatInput = activeTab === 'details' && (isJoined || isHost) && !isCancelled && !hasStarted;
  const canEdit = isHost && !isCancelled && !hasStarted;

  /* ── Edit mode panel ── */
  if (editMode) {
    const minIndex = SKILLS.indexOf(editMinSkill);
    const maxIndex = SKILLS.indexOf(editMaxSkill);

    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <ScreenHeader title="Edit Game" onBack={() => setEditMode(false)} />

        <KeyboardScroll
          style={styles.scroll}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Date & Time */}
          <Text style={styles.editLabel}>Date & Time</Text>
          <View style={styles.editDateRow}>
            <Pressable style={styles.editDateBtn} onPress={() => setDatePickerOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color={C.text2} style={{ marginRight: 8 }} />
              <Text style={styles.editDateText}>
                {editStartsAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </Pressable>
            <Pressable style={styles.editDateBtn} onPress={() => setTimePickerOpen(true)}>
              <Ionicons name="time-outline" size={16} color={C.text2} style={{ marginRight: 8 }} />
              <Text style={styles.editDateText}>
                {editStartsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </Text>
            </Pressable>
          </View>

          {datePickerOpen && (
            <DateTimePicker
              value={editStartsAt}
              mode="date"
              minimumDate={new Date()}
              onChange={(_e, d) => {
                setDatePickerOpen(false);
                if (d) {
                  const merged = new Date(editStartsAt);
                  merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                  setEditStartsAt(merged);
                }
              }}
            />
          )}
          {timePickerOpen && (
            <DateTimePicker
              value={editStartsAt}
              mode="time"
              is24Hour
              onChange={(_e, d) => {
                setTimePickerOpen(false);
                if (d) {
                  const merged = new Date(editStartsAt);
                  merged.setHours(d.getHours(), d.getMinutes());
                  setEditStartsAt(merged);
                }
              }}
            />
          )}

          {/* Min skill */}
          <Text style={styles.editLabel}>Min Skill Level</Text>
          <View style={styles.skillChipRow}>
            {SKILLS.map((s) => {
              const colors = SKILL_COLOR[s];
              const active = editMinSkill === s;
              return (
                <Pressable
                  key={s}
                  style={[styles.skillChip, active && { backgroundColor: colors.bg, borderColor: colors.border }]}
                  onPress={() => {
                    setEditMinSkill(s);
                    if (SKILLS.indexOf(s) > SKILLS.indexOf(editMaxSkill)) setEditMaxSkill(s);
                  }}
                >
                  <Ionicons
                    name={SKILL_ICON[s] as any}
                    size={14}
                    color={active ? colors.text : C.faint}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.skillChipText, active && { color: colors.text, fontWeight: '700' }]}>
                    {SKILL_LABEL[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Max skill */}
          <Text style={styles.editLabel}>Max Skill Level</Text>
          <View style={styles.skillChipRow}>
            {SKILLS.map((s, i) => {
              const colors = SKILL_COLOR[s];
              const active = editMaxSkill === s;
              const disabled = i < minIndex;
              return (
                <Pressable
                  key={s}
                  disabled={disabled}
                  style={[
                    styles.skillChip,
                    active && { backgroundColor: colors.bg, borderColor: colors.border },
                    disabled && { opacity: 0.35 },
                  ]}
                  onPress={() => setEditMaxSkill(s)}
                >
                  <Ionicons
                    name={SKILL_ICON[s] as any}
                    size={14}
                    color={active ? colors.text : C.faint}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.skillChipText, active && { color: colors.text, fontWeight: '700' }]}>
                    {SKILL_LABEL[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Capacity */}
          <Text style={styles.editLabel}>Capacity (current: {players.length} joined)</Text>
          <View style={styles.capacityRow}>
            <Pressable
              style={styles.capBtn}
              onPress={() => setEditCapacity((v) => String(Math.max(players.length, (parseInt(v) || 2) - 1)))}
            >
              <Ionicons name="remove" size={20} color={C.text2} />
            </Pressable>
            <TextInput
              style={styles.capInput}
              value={editCapacity}
              onChangeText={setEditCapacity}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Pressable
              style={styles.capBtn}
              onPress={() => setEditCapacity((v) => String(Math.min(30, (parseInt(v) || 2) + 1)))}
            >
              <Ionicons name="add" size={20} color={C.text2} />
            </Pressable>
          </View>

          {/* Notes */}
          <Text style={styles.editLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder="Any info for players…"
            placeholderTextColor={C.faint}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={styles.notesCount}>{editNotes.length}/500</Text>
        </KeyboardScroll>

        {/* Save button */}
        <View style={styles.actionBar}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            disabled={editBusy}
            onPress={saveEdit}
          >
            {editBusy ? (
              <ActivityIndicator color={C.onPrimary} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="checkmark-circle-outline" size={18} color={C.onPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>Save Changes</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Scrollable content ── */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: (showAction ? 100 : 40) + (showChatInput ? 70 : 0) + kbHeight }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.heroContainer, { backgroundColor: heroBg }]}>
          {game.courts?.image_url ? (
            <ExpoImage
              source={{ uri: encodeURI(decodeURI(game.courts.image_url.trim())) }}
              style={styles.heroImage}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={[styles.heroImageFallback, { backgroundColor: heroBg }]}>
              <Ionicons
                name={
                  game.sport === 'football' ? 'football-outline'
                  : game.sport === 'basketball' ? 'basketball-outline'
                  : game.sport === 'padel' ? 'tennisball-outline'
                  : 'medal-outline'
                }
                size={80}
                color="rgba(255,255,255,0.18)"
              />
            </View>
          )}

          {/* Back + Bookmark + Edit (host only) */}
          <View style={styles.heroNav}>
            <Pressable style={styles.backCircle} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={styles.heroNavRight}>
              {canEdit && (
                <Pressable style={styles.editBtn} onPress={openEdit}>
                  <Ionicons name="pencil-outline" size={17} color={C.onPrimary} />
                </Pressable>
              )}
              <Pressable
                style={[styles.bookmarkBtn, saved && styles.bookmarkActive]}
                onPress={() => setSaved((v) => !v)}
              >
                <Ionicons
                  name={saved ? 'bookmark' : 'bookmark-outline'}
                  size={18}
                  color={saved ? C.primary : C.onPrimary}
                />
              </Pressable>
            </View>
          </View>

          {/* Floating glass panel — same look as the Home game cards */}
          <View style={styles.heroPanel}>
            <View style={styles.panelTop}>
              <Text style={styles.panelTitle} numberOfLines={1}>
                {gameTypeLabel(game.sport, game.game_type) ?? `${SPORT_LABEL[game.sport]} Match`}
              </Text>
              <View style={styles.panelWx}>
                <Ionicons name={(weather?.icon ?? 'cloud') as any} size={20} color="#fff" style={{ opacity: weather ? 1 : 0.55 }} />
                {weather ? <Text style={styles.panelWxText}>{weather.tempC}°</Text> : null}
              </View>
            </View>
            <View style={styles.panelRow}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.panelMeta} numberOfLines={1}>{game.courts?.name ?? 'NJUPT, East'}</Text>
            </View>
            <View style={styles.panelBottom}>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelCount}>
                  {players.length}<Text style={styles.panelCap}>/{game.capacity}</Text>
                  {players.length >= game.capacity ? <Text style={styles.panelFull}>  FULL</Text> : null}
                </Text>
                <View style={styles.panelTrack}>
                  <View style={[styles.panelFill, { width: `${Math.min(1, players.length / Math.max(1, game.capacity)) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.panelTime}>
                <Ionicons name="time-outline" size={12} color={C.onAccent} />
                <Text style={styles.panelTimeText}>
                  {new Date(game.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>

          {isCancelled && (
            <View style={styles.alertBanner}>
              <Text style={styles.alertBannerText}>This game has been cancelled.</Text>
            </View>
          )}
          {hasStarted && !isCancelled && (
            <View style={[styles.alertBanner, styles.alertBannerWarn]}>
              <Text style={[styles.alertBannerText, { color: C.amberFg }]}>
                This game has already started or passed.
              </Text>
            </View>
          )}
          {/* ── Live match: Start / Watch / Result ── */}
          {hasStarted && !isCancelled && (isHost || isJoined) && (() => {
            const ms = (game as any).match_status ?? 'scheduled';
            const live = ms === 'live';
            const done = ms === 'finished';
            if (!isHost && ms === 'scheduled') return null;      // players wait for the host
            const label = done ? 'View match result' : live ? (isHost ? 'Open live match' : 'Watch live match') : 'Start Game';
            const sub = done
              ? `Final score ${(game as any).score_a ?? 0} – ${(game as any).score_b ?? 0}`
              : live ? 'Record goals and assists as you play' : 'Split the teams and start recording';
            return (
              <Pressable
                style={({ pressed }) => [styles.startCard, live && styles.startCardLive, done && styles.startCardDone, pressed && { opacity: 0.9 }]}
                onPress={() => (live || done) ? router.push(`/game/live/${game.id}` as any) : startMatch()}
                disabled={busy}
              >
                <View style={[styles.startIcon, live && { backgroundColor: '#ef4444' }]}>
                  {busy && !live && !done
                    ? <ActivityIndicator color={C.onAccent} />
                    : <Ionicons name={done ? 'trophy' : live ? 'radio' : 'play'} size={22} color={live ? '#ffffff' : done ? C.amberFg : C.onAccent} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.startTitle}>{label}</Text>
                  <Text style={styles.startSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.faint} />
              </Pressable>
            );
          })()}

          {hasStarted && !isCancelled && isJoined && players.length > 1 && (() => {
            const total = players.length - 1;
            const done = ratedCount >= total;
            return (
              <Pressable style={[styles.rateCard, done && styles.rateCardDone]} onPress={() => setRateOpen(true)}>
                <View style={[styles.rateIcon, done && { backgroundColor: C.greenBg }]}>
                  <Ionicons name={done ? 'checkmark-done' : 'star-half-outline'} size={20} color={done ? C.greenFg : C.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rateTitle}>{done ? 'Thanks for rating!' : 'Rate your teammates'}</Text>
                  <Text style={styles.rateSub}>
                    {done ? `You rated all ${total} players` : `Was their level accurate? ${ratedCount}/${total} rated`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.faint} />
              </Pressable>
            );
          })()}

          {/* Overview / Details tabs */}
          <View style={styles.tabRow}>
            <Pressable onPress={() => setActiveTab('overview')} style={styles.tabItem}>
              <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
                Overview
              </Text>
              {activeTab === 'overview' && <View style={styles.tabUnderline} />}
            </Pressable>
            <Pressable
              onPress={() => { setActiveTab('details'); setUnread(0); markChatSeen(game.id); }}
              style={styles.tabItem}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
                  Game Chat
                </Text>
                {unread > 0 && activeTab !== 'details' && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </View>
              {activeTab === 'details' && <View style={styles.tabUnderline} />}
            </Pressable>
          </View>

          {activeTab === 'overview' ? (
          <>
          {/* Info pills */}
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Ionicons name="time-outline" size={16} color={C.text2} style={{ marginRight: 6 }} />
              <Text style={styles.pillText}>{dateLabel}</Text>
            </View>
            <View style={styles.pill}>
              {weather === undefined ? (
                <ActivityIndicator size="small" color={C.faint} />
              ) : weather ? (
                <>
                  <Ionicons name={weather.icon as any} size={16} color={C.text2} style={{ marginRight: 6 }} />
                  <Text style={styles.pillText}>{weather.tempC}℃</Text>
                  {weather.rainChance !== null && weather.rainChance >= 20 && (
                    <>
                      <Ionicons name="water-outline" size={13} color={C.blueFg} style={{ marginLeft: 8, marginRight: 2 }} />
                      <Text style={[styles.pillText, { color: C.blueFg }]}>{weather.rainChance}%</Text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Ionicons name="cloud-offline-outline" size={16} color={C.faint} style={{ marginRight: 6 }} />
                  <Text style={[styles.pillText, { color: C.faint }]}>No forecast</Text>
                </>
              )}
            </View>
          </View>

          {/* Skill level badge */}
          {game && (() => {
            const minS = game.min_skill as Skill;
            const maxS = game.max_skill as Skill;
            const colors = SKILL_COLOR[minS];
            return (
              <Pressable
                onPress={() => setSkillInfoOpen(true)}
                style={({ pressed }) => [styles.skillBadgeRow, { backgroundColor: colors.bg, opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.skillInfoHint}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.text} style={{ opacity: 0.6 }} />
                </View>
                <View style={styles.skillIconsRow}>
                  <View style={styles.skillBannerIconWrap}>
                    <Ionicons name={SKILL_ICON[minS] as any} size={20} color={colors.text} />
                  </View>
                  {minS !== maxS && (
                    <>
                      <Ionicons name="arrow-forward-outline" size={16} color={colors.text} style={{ opacity: 0.45, marginHorizontal: 10 }} />
                      <View style={styles.skillBannerIconWrap}>
                        <Ionicons name={SKILL_ICON[maxS] as any} size={20} color={SKILL_COLOR[maxS].text} />
                      </View>
                    </>
                  )}
                </View>
                <Text style={[styles.skillBadgeLabel, { color: colors.text }]}>
                  {skillRangeText(minS, maxS)}
                </Text>
                <Text style={[styles.skillTapHint, { color: colors.text }]}>Tap to see what's needed</Text>
              </Pressable>
            );
          })()}

          {/* Description */}
          <Text style={styles.sectionHeader}>Game Info :</Text>
          <Text style={styles.infoBody}>
            {game.notes ||
              `Casual match at ${game.courts?.name ?? 'NJUPT East Campus'}. Open to ${skillRangeText(
                game.min_skill,
                game.max_skill
              )} players (Skill: 4.5+). Please bring light & dark tops.`}
          </Text>

          </>
          ) : (
            <GameChatPanel
              gameId={game.id}
              uid={uid}
              hostId={game.host_id}
              canRead={isJoined || isHost}
              closed={isCancelled || hasStarted}
              hideInput={showChatInput}
              refreshKey={chatRefresh}
              onMessages={() => markChatSeen(game.id)}
            />
          )}

          {/* ── Skill tier explainer overlay ── */}
          <Modal visible={skillInfoOpen} transparent animationType="fade" onRequestClose={() => setSkillInfoOpen(false)}>
            <Pressable style={styles.overlayBg} onPress={() => setSkillInfoOpen(false)}>
              <Pressable style={styles.overlayCard} onPress={() => {}} scaleTo={1} haptic={false}>
                <View style={styles.overlayHeader}>
                  <Text style={styles.overlayTitle}>Skill level needed</Text>
                  <Pressable onPress={() => setSkillInfoOpen(false)} hitSlop={10}>
                    <Ionicons name="close" size={22} color={C.muted} />
                  </Pressable>
                </View>
                <Text style={styles.overlaySub}>
                  {game.min_skill === game.max_skill
                    ? `This game is for ${SKILL_LABEL[game.min_skill as Skill]} players only.`
                    : `Players from ${SKILL_LABEL[game.min_skill as Skill]} to ${SKILL_LABEL[game.max_skill as Skill]} are welcome.`}
                </Text>
                {SKILLS.map((sk) => {
                  const inRange = SKILLS.indexOf(sk) >= SKILLS.indexOf(game.min_skill as Skill)
                               && SKILLS.indexOf(sk) <= SKILLS.indexOf(game.max_skill as Skill);
                  const c = SKILL_COLOR[sk];
                  return (
                    <View key={sk} style={[styles.tierRow, { backgroundColor: inRange ? c.bg : C.surface2, opacity: inRange ? 1 : 0.5 }]}>
                      <View style={[styles.skillBannerIconWrap, { width: 36, height: 36, borderRadius: 18 }]}>
                        <Ionicons name={SKILL_ICON[sk] as any} size={18} color={inRange ? c.text : C.faint} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.tierName, { color: inRange ? c.text : C.muted }]}>{SKILL_LABEL[sk]}</Text>
                          {inRange && <Ionicons name="checkmark-circle" size={14} color={c.text} style={{ marginLeft: 6 }} />}
                        </View>
                        <Text style={styles.tierDesc}>{SKILL_DESC[sk]}</Text>
                      </View>
                    </View>
                  );
                })}
                <Pressable style={styles.overlayBtn} onPress={() => setSkillInfoOpen(false)}>
                  <Text style={styles.overlayBtnText}>Got it</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          {uid && (
            <RateTeammates
              visible={rateOpen}
              onClose={() => setRateOpen(false)}
              gameId={game.id}
              sport={game.sport}
              uid={uid}
              players={players.filter((p) => p.user_id !== uid).map((p) => ({
                user_id: p.user_id,
                name: p.profiles?.display_name ?? 'Player',
                avatar_url: p.profiles?.avatar_url ?? null,
                skill: playerSkills[p.user_id]?.skill,
              }))}
              onDone={(n) => setRatedCount(n)}
            />
          )}

          {/* ── Split teams overlay ── */}
          <Modal visible={teamsOpen} transparent animationType="fade" onRequestClose={() => setTeamsOpen(false)}>
            <Pressable style={styles.overlayBg} onPress={() => setTeamsOpen(false)}>
              <Pressable style={styles.overlayCard} onPress={() => {}} scaleTo={1} haptic={false}>
                {(() => {
                  const tp: TeamPlayer[] = players.map((p) => ({
                    user_id: p.user_id,
                    name: p.profiles?.display_name ?? 'Player',
                    skill: playerSkills[p.user_id]?.skill,
                    role: playerSkills[p.user_id]?.role,
                    score: playerSkills[p.user_id]?.score,
                  }));
                  const { A, B, totalA, totalB } = splitTeams(tp, game.sport);
                  const Team = ({ title, color, list, total }: { title: string; color: string; list: TeamPlayer[]; total: number }) => (
                    <View style={[styles.teamCol, { backgroundColor: color + '14' }]}>
                      <Text style={[styles.teamTitle, { color }]}>{title}</Text>
                      <Text style={[styles.teamTotal, { color }]}>Strength {Math.round(total / Math.max(list.length, 1))}</Text>
                      {list.map((pl) => (
                        <View key={pl.user_id} style={styles.teamRow}>
                          {pl.skill && <Ionicons name={SKILL_ICON[pl.skill] as any} size={12} color={SKILL_COLOR[pl.skill].text} />}
                          <Text style={styles.teamName} numberOfLines={1}>{pl.name}</Text>
                          {pl.role && <AppIcon name={roleIcon(game.sport, pl.role) as any} size={12} color={C.muted} />}
                        </View>
                      ))}
                    </View>
                  );
                  return (
                    <>
                      <View style={styles.overlayHeader}>
                        <Text style={styles.overlayTitle}>Balanced teams</Text>
                        <Pressable onPress={() => setTeamsOpen(false)} hitSlop={10}>
                          <Ionicons name="close" size={22} color={C.muted} />
                        </Pressable>
                      </View>
                      <Text style={styles.overlaySub}>Split by skill score and role{game.sport === 'football' ? ' — one goalkeeper per side when possible' : ''}.</Text>
                      <View style={styles.teamsRow}>
                        <Team title="Team A" color={C.primary} list={A} total={totalA} />
                        <Team title="Team B" color={C.amberFg} list={B} total={totalB} />
                      </View>
                      <Pressable style={styles.overlayBtn} onPress={() => setTeamsOpen(false)}>
                        <Text style={styles.overlayBtnText}>Done</Text>
                      </Pressable>
                    </>
                  );
                })()}
              </Pressable>
            </Pressable>
          </Modal>

          {/* ── Player list — Overview tab only ── */}
          {activeTab === 'overview' && (
          <View style={styles.playerSection}>
            <View style={styles.playerSectionHeader}>
              <Text style={styles.sectionHeader}>Players</Text>
              {(game.sport === 'football' || game.sport === 'basketball') && players.length >= 2 && (
                <Pressable style={styles.splitBtn} onPress={() => setTeamsOpen(true)}>
                  <Ionicons name="git-compare-outline" size={14} color={C.primary} />
                  <Text style={styles.splitBtnText}>Split teams</Text>
                </Pressable>
              )}
              <View style={styles.playerCountPill}>
                <Text style={styles.playerCountText}>
                  {players.length}/{game.capacity}
                </Text>
              </View>
            </View>

            {/* Capacity bar */}
            <View style={styles.capacityTrack}>
              <View style={[styles.capacityFill, {
                width: `${Math.min((players.length / game.capacity) * 100, 100)}%` as any,
                backgroundColor: players.length >= game.capacity ? '#b91c1c' : C.accent,
              }]} />
            </View>

            {/* Player rows */}
            {players.map((p, i) => {
              const hosting  = p.user_id === game.host_id;
              const isMe     = p.user_id === uid;
              const name     = p.profiles?.display_name ?? 'Player';
              const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
              const avatarUri = p.profiles?.avatar_url ?? null;
              // Host can kick non-host players when game is active
              const canKick = isHost && !hosting && !isMe && !isCancelled && !hasStarted;

              return (
                <View key={p.user_id} style={[styles.playerRow, i === players.length - 1 && players.length >= game.capacity && { borderBottomWidth: 0 }]}>
                  {/* Avatar */}
                  <View style={styles.playerAvatarWrap}>
                    {avatarUri ? (
                      <ExpoImage
                        source={{ uri: avatarUri }}
                        style={styles.playerAvatar}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.playerAvatar, styles.playerAvatarFallback]}>
                        <Text style={styles.playerInitials}>{initials}</Text>
                      </View>
                    )}
                    {hosting && (
                      <View style={styles.crownBadge}>
                        <Ionicons name="star" size={8} color={C.onPrimary} />
                      </View>
                    )}
                  </View>

                  {/* Name + role */}
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {name}{isMe ? <Text style={styles.youTag}> · You</Text> : null}
                    </Text>
                    {(() => {
                      const ps = playerSkills[p.user_id];
                      const rl = roleLabel(game.sport, ps?.role);
                      if (!ps && !hosting) return null;
                      return (
                        <View style={styles.playerChips}>
                          {hosting && <Text style={styles.hostLabel}>Host</Text>}
                          {ps && (
                            <View style={[styles.miniChip, { backgroundColor: SKILL_COLOR[ps.skill].bg }]}>
                              <Ionicons name={SKILL_ICON[ps.skill] as any} size={11} color={SKILL_COLOR[ps.skill].text} />
                            </View>
                          )}
                          {rl && (
                            <View style={styles.miniChip}>
                              <AppIcon name={roleIcon(game.sport, ps?.role) as any} size={11} color={C.text2} />
                              <Text style={styles.miniChipText}>{rl}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })()}
                  </View>

                  {/* Right side: kick button (host) or checkmark */}
                  {canKick ? (
                    <Pressable
                      style={styles.kickBtn}
                      onPress={() => confirmKick(p)}
                      disabled={busy}
                    >
                      <Ionicons name="person-remove-outline" size={15} color="#b00020" />
                    </Pressable>
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color={C.greenFg} />
                  )}
                </View>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, game.capacity - players.length) }).map((_, i) => (
              <View key={`empty-${i}`} style={[
                styles.playerRow,
                { opacity: 0.45 },
                i === game.capacity - players.length - 1 && { borderBottomWidth: 0 },
              ]}>
                <View style={[styles.playerAvatar, styles.playerAvatarEmpty]}>
                  <Ionicons name="person-outline" size={16} color={C.faint} />
                </View>
                <View style={styles.playerInfo}>
                  <Text style={[styles.playerName, { color: C.faint }]}>Open spot</Text>
                </View>
                <Ionicons name="add-circle-outline" size={18} color={C.border2} />
              </View>
            ))}
          </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom action button ── */}
      {showAction && (
        <View style={[
          styles.actionBar,
          kbHeight > 0 && showChatInput && { bottom: kbHeight, paddingBottom: 8, paddingTop: 8 },
        ]}>
          {showChatInput && (
            <GameChatInput gameId={game.id} uid={uid} onSent={() => setChatRefresh((n) => n + 1)} />
          )}
          {!(kbHeight > 0 && showChatInput) && (
          <Pressable
            style={[actionStyle, actionDisabled && styles.btnOff]}
            disabled={actionDisabled || busy}
            onPress={actionFn}
            haptic="medium"
          >
            {busy ? (
              <ActivityIndicator color={C.onPrimary} />
            ) : (
              <View style={styles.btnInner}>
                <Text style={styles.actionBtnText}>{actionLabel}</Text>
                {actionIcon && (
                  <Ionicons name={actionIcon} size={18} color={C.onPrimary} style={{ marginLeft: 8 }} />
                )}
              </View>
            )}
          </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.card },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.card },

  // ── Hero ──
  heroContainer: {
    height: 400,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  heroImageFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroNav: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Back: grey semi-transparent circle
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,40,50,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Edit: semi-transparent rounded square
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,40,50,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Bookmark: rounded square (borderRadius 10), slightly transparent white
  bookmarkBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,40,50,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookmarkActive: {
    backgroundColor: C.card,
  },

  heroPanel: {
    position: 'absolute', left: 14, right: 14, bottom: 14,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'rgba(12,22,18,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { flex: 1, fontSize: 28, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 },
  panelWx: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  panelWxText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  panelMeta: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  panelBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10 },
  panelCount: { fontSize: 22, fontWeight: '800', color: '#fff' },
  panelCap: { color: 'rgba(255,255,255,0.6)' },
  panelFull: { fontSize: 12, fontWeight: '900', color: '#f87171' },
  panelTrack: { height: 5, borderRadius: 3, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  panelFill: { height: 5, borderRadius: 3, backgroundColor: '#afd43a' },
  panelTime: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  panelTimeText: { fontSize: 13, fontWeight: '800', color: C.onAccent },

  // ── Body ──
  body: { paddingHorizontal: 20, paddingTop: 20 },

  alertBanner: {
    backgroundColor: C.dangerBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  alertBannerWarn: { backgroundColor: C.amberBg },
  alertBannerText: { color: '#b00020', fontWeight: '600', textAlign: 'center', fontSize: 13 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
    marginBottom: 20,
  },
  tabItem: {
    marginRight: 28,
    paddingBottom: 10,
    position: 'relative',
  },
  tabText: { fontSize: 16, fontWeight: '600', color: C.faint },
  tabTextActive: { color: C.text, fontWeight: '800' },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.accent,
    borderRadius: 2,
  },

  // Pills
  skillBannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  skillBadgeRow: {
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  startCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.accentSoft, borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: C.accent,
  },
  startCardLive: { backgroundColor: C.dangerBg, borderColor: '#ef4444' },
  startCardDone: { backgroundColor: C.amberBg, borderColor: C.amberBd },
  startIcon: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  startTitle: { fontSize: 15, fontWeight: '900', color: C.text },
  startSub:   { fontSize: 12, color: C.muted, marginTop: 1 },
  btnWait: { backgroundColor: C.amberFg },
  rateCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.accentSoft, borderRadius: 16, padding: 14, marginBottom: 16,
  },
  rateCardDone: { backgroundColor: C.greenBg },
  rateIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.card,
    justifyContent: 'center', alignItems: 'center',
  },
  rateTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  rateSub:   { fontSize: 12, color: C.muted, marginTop: 1 },
  unreadBadge: {
    marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center',
  },
  unreadBadgeText: { color: C.onPrimary, fontSize: 10, fontWeight: '800' },
  splitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', marginRight: 8,
    backgroundColor: C.accentSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  splitBtnText: { fontSize: 12, fontWeight: '700', color: C.primary },
  playerChips: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' },
  miniChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  miniChipText: { fontSize: 10, fontWeight: '700', color: C.text2 },
  teamsRow:  { flexDirection: 'row', gap: 10, marginBottom: 6 },
  teamCol:   { flex: 1, borderRadius: 14, padding: 10 },
  teamTitle: { fontSize: 14, fontWeight: '900' },
  teamTotal: { fontSize: 11, fontWeight: '700', opacity: 0.7, marginBottom: 8 },
  teamRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  teamName:  { flex: 1, fontSize: 12, fontWeight: '600', color: C.text },
  skillInfoHint: { position: 'absolute', top: 10, right: 12 },
  skillTapHint:  { fontSize: 11, fontWeight: '600', opacity: 0.55, marginTop: 4 },
  overlayBg: {
    flex: 1, backgroundColor: 'rgba(0,22,69,0.45)',
    justifyContent: 'center', padding: 24,
  },
  overlayCard: {
    backgroundColor: C.card, borderRadius: 22, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overlayTitle:  { fontSize: 18, fontWeight: '800', color: C.text },
  overlaySub:    { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 14 },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 12, marginBottom: 8,
  },
  tierName: { fontSize: 14, fontWeight: '800' },
  tierDesc: { fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 17 },
  overlayBtn: {
    marginTop: 8, backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  overlayBtnText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },
  skillIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  skillBadgeLabel: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: C.text2 },

  // Description
  sectionHeader: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  infoBody: { fontSize: 14, color: C.muted, lineHeight: 22 },

  // ── Player list ──
  playerSection:  { marginTop: 8, marginBottom: 24 },
  playerSectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  playerCountPill: {
    backgroundColor: C.primary, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  playerCountText: { fontSize: 12, fontWeight: '700', color: C.onPrimary },

  capacityTrack: {
    height: 4, backgroundColor: C.surface,
    borderRadius: 2, marginBottom: 16, overflow: 'hidden',
  },
  capacityFill: { height: '100%', borderRadius: 2 },

  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.surface,
    gap: 12,
  },
  playerAvatarWrap: { position: 'relative' },
  playerAvatar: {
    width: 42, height: 42, borderRadius: 21,
  },
  playerAvatarFallback: {
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarEmpty: {
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  playerInitials: { fontSize: 15, fontWeight: '800', color: C.onPrimary },
  crownBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.amberFg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.card,
  },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '600', color: C.text },
  youTag:     { fontSize: 13, fontWeight: '500', color: C.faint },
  hostLabel:  { fontSize: 11, color: C.amberFg, fontWeight: '600', marginTop: 1 },

  kickBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.dangerBg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Fixed bottom bar ──
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
    backgroundColor: C.card,
  },
  actionBtn: {
    backgroundColor: C.text,
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnDanger: { backgroundColor: '#b00020' },
  btnOff: { backgroundColor: C.faint },
  actionBtnText: { color: C.onPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  btnInner: { flexDirection: 'row', alignItems: 'center' },

  errorText: { color: theme.colors.danger, fontSize: 16, fontWeight: '600' },

  // ── Edit mode ──
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
    backgroundColor: C.card,
  },
  editHeaderTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  editLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text2,
    marginTop: 20,
    marginBottom: 10,
  },
  editDateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editDateText: { fontSize: 14, fontWeight: '600', color: C.text },
  skillChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skillChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  skillChipText: { fontSize: 12, fontWeight: '600', color: C.faint },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  capBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  capInput: {
    width: 48,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
  },
  notesInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: C.text,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  notesCount: { fontSize: 11, color: C.faint, textAlign: 'right', marginTop: 4 },
}));
