import { Skill, Sport } from './constants';

/* Balanced team split — uses evaluation score (fallback: tier) and role. */

export type TeamPlayer = {
  user_id: string;
  name: string;
  skill?: Skill;
  role?: string | null;
  score?: number | null;
};

const TIER_FALLBACK: Record<Skill, number> = { beginner: 20, intermediate: 55, competitive: 85 };

export function strength(p: TeamPlayer) {
  if (typeof p.score === 'number') return p.score;
  return p.skill ? TIER_FALLBACK[p.skill] : 40;
}

/** Roles that should be spread one per team first */
const ANCHOR_ROLE: Partial<Record<Sport, string>> = {
  football: 'goalkeeper',
  basketball: 'center',
};

export function splitTeams(players: TeamPlayer[], sport: Sport) {
  const cap = Math.ceil(players.length / 2);
  const A: TeamPlayer[] = [];
  const B: TeamPlayer[] = [];
  const sum = (t: TeamPlayer[]) => t.reduce((n, p) => n + strength(p), 0);

  const place = (p: TeamPlayer) => {
    if (A.length >= cap) return B.push(p);
    if (B.length >= cap) return A.push(p);
    // add to the weaker team (tie → fewer players)
    const sa = sum(A), sb = sum(B);
    if (sa < sb || (sa === sb && A.length <= B.length)) A.push(p); else B.push(p);
  };

  const anchor = ANCHOR_ROLE[sport];
  const anchors = players.filter((p) => anchor && p.role === anchor).sort((a, b) => strength(b) - strength(a));
  const rest    = players.filter((p) => !(anchor && p.role === anchor)).sort((a, b) => strength(b) - strength(a));

  // anchors alternate first so each side gets one
  anchors.forEach((p, i) => {
    if (i === 0) A.push(p);
    else if (i === 1) B.push(p);
    else place(p);
  });
  rest.forEach(place);

  return { A, B, totalA: sum(A), totalB: sum(B) };
}
