import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Sport } from './constants';
import { supabase } from './supabase';

/* ─────────────────────────────────────────────────────────────
   Daily Quests — Solo Leveling style
   XP → Level (every 100 XP) and Hunter Rank (E → S).
   Quest targets scale with rank.
   ───────────────────────────────────────────────────────────── */

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export const RANKS: { rank: Rank; minXp: number; title: string }[] = [
  { rank: 'E', minXp: 0,     title: 'E-Rank Hunter' },
  { rank: 'D', minXp: 500,   title: 'D-Rank Hunter' },
  { rank: 'C', minXp: 1500,  title: 'C-Rank Hunter' },
  { rank: 'B', minXp: 3500,  title: 'B-Rank Hunter' },
  { rank: 'A', minXp: 7000,  title: 'A-Rank Hunter' },
  { rank: 'S', minXp: 12000, title: 'S-Rank Hunter' },
];

export const RANK_COLOR: Record<Rank, string> = {
  E: '#9ca3af', D: '#22c55e', C: '#3b82f6', B: '#a855f7', A: '#f59e0b', S: '#ef4444',
};

export function rankFor(xp: number) {
  let i = 0;
  RANKS.forEach((r, j) => { if (xp >= r.minXp) i = j; });
  const cur = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const pct = next ? (xp - cur.minXp) / (next.minXp - cur.minXp) : 1;
  return { ...cur, index: i, next, pct: Math.max(0, Math.min(1, pct)) };
}
export const levelFor = (xp: number) => Math.floor(xp / 100) + 1;

export type QuestDef = {
  id: string;
  label: string;
  unit: string;
  target: number;
  icon: string;          // Ionicons / AppIcon name
  kind: 'steps' | 'manual';
};

const SCALE: Record<Rank, { steps: number; reps: number }> = {
  E: { steps: 5000,  reps: 10 },
  D: { steps: 6000,  reps: 20 },
  C: { steps: 7500,  reps: 30 },
  B: { steps: 9000,  reps: 50 },
  A: { steps: 10000, reps: 75 },
  S: { steps: 12000, reps: 100 },
};

/** One sport drill per day, rotating through the player's sports. */
const SPORT_DRILL: Record<Sport, { label: string; unit: string; icon: string; perRank: number[] }> = {
  football:   { label: 'Ball juggles',        unit: 'touches', icon: 'football-outline',   perRank: [20, 30, 50, 75, 100, 150] },
  padel:      { label: 'Wall rally practice', unit: 'min',     icon: 'tennisball-outline', perRank: [10, 15, 20, 25, 30, 40] },
  basketball: { label: 'Free throws',         unit: 'shots',   icon: 'basketball-outline', perRank: [20, 30, 50, 75, 100, 150] },
  badminton:  { label: 'Shadow footwork',     unit: 'reps',    icon: 'medal-outline',      perRank: [30, 50, 75, 100, 150, 200] },
  billiards:  { label: 'Cue-ball drills',     unit: 'min',     icon: 'billiards-8',        perRank: [10, 15, 20, 25, 30, 40] },
};

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyQuests(xp: number, sports: Sport[], d = new Date()): QuestDef[] {
  const { rank, index } = rankFor(xp);
  const s = SCALE[rank];
  const list: QuestDef[] = [
    { id: 'steps',   label: 'Walk',      unit: 'steps', target: s.steps, icon: 'footsteps-outline', kind: 'steps' },
    { id: 'pushups', label: 'Push-ups',  unit: 'reps',  target: s.reps,  icon: 'barbell-outline',   kind: 'manual' },
    { id: 'situps',  label: 'Sit-ups',   unit: 'reps',  target: s.reps,  icon: 'body-outline',      kind: 'manual' },
    { id: 'squats',  label: 'Squats',    unit: 'reps',  target: s.reps,  icon: 'fitness-outline',   kind: 'manual' },
  ];
  if (sports.length) {
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
    const sport = sports[dayOfYear % sports.length];
    const drill = SPORT_DRILL[sport];
    if (drill) {
      list.push({
        id: `sport_${sport}`, label: drill.label, unit: drill.unit,
        target: drill.perRank[index], icon: drill.icon, kind: 'manual',
      });
    }
  }
  return list;
}

/* ── Server ─────────────────────────────────────────────────── */

export type HunterStats = { xp: number; streak: number; best_streak: number; last_clear: string | null };
export type XpEvent = { id: string; amount: number; reason: string; created_at: string };
export type QuestRow = { quest: string; progress: number; target: number; completed: boolean };

export async function loadHunter(uid: string, day: string) {
  const [stats, log, events] = await Promise.all([
    supabase.from('hunter_stats').select('xp, streak, best_streak, last_clear').eq('user_id', uid).maybeSingle(),
    supabase.from('quest_log').select('quest, progress, target, completed').eq('user_id', uid).eq('day', day),
    supabase.from('xp_events').select('id, amount, reason, created_at').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(15),
  ]);
  const err = stats.error ?? log.error ?? events.error;
  return {
    error: err?.message ?? null,
    stats: (stats.data as HunterStats | null) ?? { xp: 0, streak: 0, best_streak: 0, last_clear: null },
    log: Object.fromEntries(((log.data ?? []) as QuestRow[]).map((r) => [r.quest, r])) as Record<string, QuestRow>,
    events: (events.data ?? []) as XpEvent[],
  };
}

export async function saveQuest(day: string, q: QuestDef, progress: number, total: number) {
  return supabase.rpc('log_quest', {
    p_day: day, p_quest: q.id, p_label: q.label,
    p_progress: Math.max(0, Math.round(progress)), p_target: q.target, p_total: total,
  });
}

/** Streak still alive? (cleared today or yesterday) */
export function liveStreak(s: HunterStats, today = dayKey()) {
  if (!s.last_clear) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return s.last_clear === today || s.last_clear === dayKey(y) ? s.streak : 0;
}

/** Missed yesterday after having a streak → Penalty notice */
export function inPenalty(s: HunterStats, today = dayKey()) {
  return s.streak > 0 && liveStreak(s, today) === 0;
}

/* ── Steps ──────────────────────────────────────────────────── */

const STEP_KEY = (d: string) => `steps_${d}`;

/**
 * Today's steps.
 * iOS: read straight from the phone's step history.
 * Android: count live while the app is open and keep a running total for the day
 *          (Android doesn't expose step history to apps).
 */
export function useTodaySteps() {
  const [steps, setSteps] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const base = useRef(0);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let alive = true;
    const today = dayKey();

    (async () => {
      try {
        const perm = await Pedometer.requestPermissionsAsync();
        const ok = perm.granted && (await Pedometer.isAvailableAsync());
        if (!alive) return;
        setAvailable(ok);
        if (!ok) return;

        if (Platform.OS === 'ios') {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const r = await Pedometer.getStepCountAsync(start, new Date());
          if (alive) setSteps(r.steps);
          sub = Pedometer.watchStepCount(async () => {
            const r2 = await Pedometer.getStepCountAsync(start, new Date());
            if (alive) setSteps(r2.steps);
          });
        } else {
          base.current = Number((await AsyncStorage.getItem(STEP_KEY(today))) ?? 0);
          if (alive) setSteps(base.current);
          sub = Pedometer.watchStepCount((r) => {
            const total = base.current + r.steps;
            setSteps(total);
            AsyncStorage.setItem(STEP_KEY(today), String(total)).catch(() => {});
          });
        }
      } catch {
        if (alive) setAvailable(false);
      }
    })();

    return () => { alive = false; sub?.remove(); };
  }, []);

  return { steps, available };
}

/* ── One hook for the card and the screen ───────────────────── */

export function useDailyQuests(uid: string | undefined) {
  const today = dayKey();
  const [stats, setStats]   = useState<HunterStats>({ xp: 0, streak: 0, best_streak: 0, last_clear: null });
  const [log, setLog]       = useState<Record<string, QuestRow>>({});
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { steps, available: stepsAvailable } = useTodaySteps();
  const lastSavedSteps = useRef(0);

  const reload = async () => {
    if (!uid) return;
    const [h, ps] = await Promise.all([
      loadHunter(uid, today),
      supabase.from('player_sports').select('sport').eq('user_id', uid),
    ]);
    setError(h.error);
    setStats(h.stats); setLog(h.log); setEvents(h.events);
    setSports(((ps.data ?? []) as any[]).map((r) => r.sport as Sport));
    setLoading(false);
  };

  useEffect(() => { reload(); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const quests = dailyQuests(stats.xp, sports);

  const progressOf = (q: QuestDef) => {
    const saved = log[q.id]?.progress ?? 0;
    return q.kind === 'steps' ? Math.max(saved, steps) : saved;
  };
  const isDone = (q: QuestDef) => !!log[q.id]?.completed || progressOf(q) >= q.target;

  async function setProgress(q: QuestDef, value: number) {
    // optimistic
    setLog((p) => ({ ...p, [q.id]: { quest: q.id, progress: Math.min(value, q.target), target: q.target, completed: value >= q.target } }));
    const { data, error: e } = await saveQuest(today, q, value, quests.length);
    if (e) { setError(e.message); return; }
    if (data) setStats(data as any);
    // refresh XP history
    const h = await loadHunter(uid!, today);
    setEvents(h.events); setLog(h.log);
  }

  // Push step progress to the server in chunks (and when the target is hit)
  useEffect(() => {
    if (!uid || loading) return;
    const q = quests.find((x) => x.kind === 'steps');
    if (!q) return;
    const reached = steps >= q.target && !log[q.id]?.completed;
    if (reached || steps - lastSavedSteps.current >= 500) {
      lastSavedSteps.current = steps;
      setProgress(q, steps);
    }
  }, [steps, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneCount = quests.filter(isDone).length;

  return {
    today, stats, events, quests, error, loading, steps, stepsAvailable,
    progressOf, isDone, doneCount, setProgress, reload,
    complete: (q: QuestDef) => setProgress(q, q.target),
  };
}
