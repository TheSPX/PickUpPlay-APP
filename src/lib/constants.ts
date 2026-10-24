import { C, themed } from './palette';
export const SPORTS = ['padel', 'football', 'basketball', 'badminton', 'billiards'] as const;
export const SKILLS = ['beginner', 'intermediate', 'competitive'] as const;
/** DB stores 'advanced' but the app uses 'competitive' — normalise on read */
export const fromDbSkill = (s: string): Skill =>
  s === 'advanced' ? 'competitive' : s as Skill;

export type Sport = (typeof SPORTS)[number];
export type Skill = (typeof SKILLS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  padel: 'Padel',
  football: 'Football',
  basketball: 'Basketball',
  badminton: 'Badminton',
  billiards: 'Billiards',
};

export const SKILL_LABEL: Record<Skill, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  competitive: 'Competitive',
};

export const SKILL_ICON: Record<Skill, string> = {
  beginner:     'leaf-outline',
  intermediate: 'flash-outline',
  competitive:  'trophy-outline',
};

export const SKILL_DESC: Record<Skill, string> = {
  beginner: 'Learning the basics',
  intermediate: 'Plays regularly',
  competitive: 'Club / team experience',
};

export const SKILL_COLOR: Record<Skill, { bg: string; text: string; border: string }> = themed(() => ({
  beginner:     { bg: C.greenBg, text: C.greenFg, border: C.greenBd },
  intermediate: { bg: C.amberBg, text: C.amberFg, border: C.amberBd },
  competitive:  { bg: C.blueBg, text: C.blueFg, border: C.blueBd },
}));

export function skillRangeText(min: Skill, max: Skill) {
  return min === max ? SKILL_LABEL[min] : `${SKILL_LABEL[min]} → ${SKILL_LABEL[max]}`;
}

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type LocationPreset = {
  name: string;
  lat: number;
  lng: number;
};

export const LOCATION_PRESETS: LocationPreset[] = [
  { name: 'East Football Field', lat: 32.116603, lng: 118.928912 },
  { name: 'East Tennis Courts', lat: 32.117557, lng: 118.92992 },
  { name: 'East Volleyball Courts', lat: 32.117332, lng: 118.929928 },
  { name: 'East Basketball Courts', lat: 32.116777, lng: 118.929738 },
  { name: 'North Football Stadium', lat: 32.120998, lng: 118.924325 },
  { name: 'North Tennis Courts', lat: 32.122377, lng: 118.925883 },
  { name: 'North Volleyball Courts', lat: 32.121671, lng: 118.926514 },
  { name: 'North Basketball Courts', lat: 32.121977, lng: 118.926141 },
];

/* ── Game types (sport-specific formats) ── */
export type GameTypeOpt = { value: string; label: string; icon: string; desc: string };

export const GAME_TYPES: Partial<Record<Sport, GameTypeOpt[]>> & { billiards: GameTypeOpt[] } = {
  billiards: [
    { value: 'eightball', label: '8-Ball',   icon: 'billiards-8',          desc: 'Solids vs stripes, sink the 8 last' },
    { value: 'nineball',  label: '9-Ball',   icon: 'ellipse-outline',      desc: 'Hit the lowest ball, pot the 9 to win' },
    { value: 'tenball',   label: '10-Ball',  icon: 'radio-button-off-outline', desc: 'Call-shot rotation up to the 10' },
    { value: 'snooker',   label: 'Snooker',  icon: 'color-filter-outline', desc: 'Reds and colours on a full-size table' },
  ],
};

export function gameTypeLabel(sport: Sport, value?: string | null): string | null {
  if (!value) return null;
  return GAME_TYPES[sport]?.find((t) => t.value === value)?.label ?? null;
}

/** A game stays visible in lists until 4 hours after it starts. */
export const GAME_VISIBLE_MS = 4 * 60 * 60 * 1000;
export const visibleSince = () => new Date(Date.now() - GAME_VISIBLE_MS).toISOString();
export const isStillVisible = (startsAt: string) =>
  new Date(startsAt).getTime() > Date.now() - GAME_VISIBLE_MS;
