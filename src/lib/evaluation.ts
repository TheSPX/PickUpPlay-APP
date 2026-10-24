import { Skill, SKILLS, Sport } from './constants';

/* ─────────────────────────────────────────────────────────────
   Skill evaluation — questionnaire → 0-100 score → tier
   Weights: experience 20 · frequency 15 · highest level 30 · skill check 35
   ───────────────────────────────────────────────────────────── */

export type Experience   = 'lt1' | '1to3' | '3to5' | '5plus';
export type Frequency    = 'rarely' | 'monthly' | 'weekly' | 'often';
export type HighestLevel = 'casual' | 'school' | 'club' | 'competitive';

export type EvalAnswers = {
  experience?: Experience;
  frequency?: Frequency;
  highest_level?: HighestLevel;
  skill_check?: 0 | 1 | 2 | 3;
  role?: string;
};

type Opt<T> = { value: T; label: string; icon: string; points: 0 | 1 | 2 | 3 };

export const EXPERIENCE_OPTS: Opt<Experience>[] = [
  { value: 'lt1',   label: 'Less than 1 year', icon: 'hourglass-outline', points: 0 },
  { value: '1to3',  label: '1 – 3 years',      icon: 'time-outline',      points: 1 },
  { value: '3to5',  label: '3 – 5 years',      icon: 'calendar-outline',  points: 2 },
  { value: '5plus', label: '5+ years',         icon: 'ribbon-outline',    points: 3 },
];

export const FREQUENCY_OPTS: Opt<Frequency>[] = [
  { value: 'rarely',  label: 'Rarely',          icon: 'moon-outline',          points: 0 },
  { value: 'monthly', label: 'A few times a month', icon: 'calendar-clear-outline', points: 1 },
  { value: 'weekly',  label: 'Every week',      icon: 'repeat-outline',        points: 2 },
  { value: 'often',   label: '2+ times a week', icon: 'flame-outline',         points: 3 },
];

export const LEVEL_OPTS: Opt<HighestLevel>[] = [
  { value: 'casual',      label: 'Casual with friends', icon: 'people-outline',  points: 0 },
  { value: 'school',      label: 'School / uni team',   icon: 'school-outline',  points: 1 },
  { value: 'club',        label: 'Club or league',      icon: 'shield-outline',  points: 2 },
  { value: 'competitive', label: 'Competitive / pro',   icon: 'trophy-outline',  points: 3 },
];

/** Sport-specific "what can you actually do" question */
export const SKILL_CHECK: Record<Sport, { question: string; options: string[] }> = {
  football: {
    question: 'Can you use both feet, control a long ball and hold your position for a full match?',
    options: ['Not really', 'Some of it', 'Most of it', 'Yes, comfortably'],
  },
  padel: {
    question: 'Can you play off the back wall and hit a controlled bandeja?',
    options: ['Not yet', 'Learning', 'Usually', 'Consistently'],
  },
  basketball: {
    question: 'Can you hit 3 of 10 threes, use both hands to dribble and run a pick-and-roll?',
    options: ['Not really', 'Some of it', 'Most of it', 'Yes, comfortably'],
  },
  badminton: {
    question: 'Can you clear baseline-to-baseline, play net shots and hit a jump smash?',
    options: ['Not yet', 'Learning', 'Usually', 'Consistently'],
  },
  billiards: {
    question: 'Can you control the cue ball (stun, follow, draw) and run 3+ balls in a row?',
    options: ['Not yet', 'Learning', 'Usually', 'Consistently'],
  },
};
export const SKILL_CHECK_ICONS = ['close-circle-outline', 'ellipse-outline', 'checkmark-circle-outline', 'checkmark-done-circle-outline'];

/** Playing roles per sport (stored as info, not scored) */
export const ROLES: Record<Sport, { value: string; label: string; icon: string }[]> = {
  football: [
    { value: 'goalkeeper', label: 'Goalkeeper', icon: 'hand-left-outline' },
    { value: 'defender',   label: 'Defender',   icon: 'shield-outline' },
    { value: 'midfielder', label: 'Midfielder', icon: 'git-network-outline' },
    { value: 'forward',    label: 'Forward',    icon: 'flash-outline' },
  ],
  padel: [
    { value: 'drive', label: 'Right side (drive)', icon: 'arrow-forward-outline' },
    { value: 'reves', label: 'Left side (revés)',  icon: 'arrow-back-outline' },
    { value: 'both',  label: 'Both sides',         icon: 'swap-horizontal-outline' },
  ],
  basketball: [
    { value: 'guard',   label: 'Guard',   icon: 'navigate-outline' },
    { value: 'forward', label: 'Forward', icon: 'flash-outline' },
    { value: 'center',  label: 'Center',  icon: 'barbell-outline' },
  ],
  badminton: [
    { value: 'singles', label: 'Singles', icon: 'person-outline' },
    { value: 'doubles', label: 'Doubles', icon: 'people-outline' },
    { value: 'mixed',   label: 'Mixed',   icon: 'people-circle-outline' },
  ],
  billiards: [
    { value: 'eightball', label: '8-ball',     icon: 'billiards-8' },
    { value: 'nineball',  label: '9-ball',     icon: 'ellipse-outline' },
    { value: 'snooker',   label: 'Snooker',    icon: 'color-filter-outline' },
    { value: 'any',       label: 'Any game',   icon: 'shuffle-outline' },
  ],
};

export function roleLabel(sport: Sport, role?: string | null) {
  return ROLES[sport].find((r) => r.value === role)?.label ?? null;
}
export function roleIcon(sport: Sport, role?: string | null) {
  return ROLES[sport].find((r) => r.value === role)?.icon ?? 'person-outline';
}
export function experienceLabel(e?: string | null) {
  return EXPERIENCE_OPTS.find((o) => o.value === e)?.label ?? null;
}

/** Weighted 0-100 score */
export function computeScore(a: EvalAnswers): number {
  const p = (opts: Opt<any>[], v?: string) => opts.find((o) => o.value === v)?.points ?? 0;
  const raw =
    (p(EXPERIENCE_OPTS, a.experience) / 3) * 20 +
    (p(FREQUENCY_OPTS,  a.frequency)  / 3) * 15 +
    (p(LEVEL_OPTS,      a.highest_level) / 3) * 30 +
    ((a.skill_check ?? 0) / 3) * 35;
  return Math.round(raw);
}

export function scoreToSkill(score: number): Skill {
  if (score >= 70) return 'competitive';
  if (score >= 40) return 'intermediate';
  return 'beginner';
}

/** Allowed manual adjustment: ±1 tier from computed */
export function allowedSkills(computed: Skill): Skill[] {
  const i = SKILLS.indexOf(computed);
  return SKILLS.filter((_, j) => Math.abs(j - i) <= 1);
}

export function isComplete(a: EvalAnswers) {
  return !!(a.experience && a.frequency && a.highest_level && a.skill_check !== undefined && a.role);
}
