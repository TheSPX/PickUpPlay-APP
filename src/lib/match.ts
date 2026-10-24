import { Sport } from './constants';

/* Live match helpers — what a "goal" is called per sport, team colours. */

export type Team = 'A' | 'B';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export const SCORE_LABEL: Record<Sport, { one: string; icon: string; assists: boolean }> = {
  football:   { one: 'Goal',   icon: 'football',        assists: true },
  basketball: { one: 'Basket', icon: 'basketball',      assists: true },
  padel:      { one: 'Point',  icon: 'tennisball',      assists: false },
  badminton:  { one: 'Point',  icon: 'medal',           assists: false },
  billiards:  { one: 'Frame',  icon: 'billiards-8',     assists: false },
};

/** Fixed brand colours so each half is instantly recognisable in every theme. */
export const TEAM_COLOR: Record<Team, { bg: string; soft: string; text: string; btn: string; btnText: string; name: string }> = {
  A: { bg: '#001645', soft: '#0b2a6b', text: '#ffffff', btn: '#ffffff', btnText: '#001645', name: 'Team Navy' },
  B: { bg: '#afd43a', soft: '#c6e36a', text: '#001645', btn: '#001645', btnText: '#ffffff', name: 'Team Lime' },
};

export function elapsed(fromIso: string | null, toIso?: string | null) {
  if (!fromIso) return '00:00';
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  const s = Math.max(0, Math.floor((end - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
