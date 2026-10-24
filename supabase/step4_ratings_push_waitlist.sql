-- ════════════════════════════════════════════════════════════════
-- Step 4 — Peer ratings · Push tokens · Waitlist
-- Run ONLY after 2 confirmations. Adds new objects; existing data untouched.
-- ════════════════════════════════════════════════════════════════

-- ── A. Peer skill ratings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  voter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sport      text NOT NULL,
  vote       smallint NOT NULL CHECK (vote IN (-1, 0, 1)),  -- lower · accurate · higher
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, voter_id, target_id),
  CHECK (voter_id <> target_id)
);
ALTER TABLE skill_votes ENABLE ROW LEVEL SECURITY;

-- Vote only on players you played with, in a game that has started
CREATE POLICY "vote teammates" ON skill_votes FOR INSERT WITH CHECK (
  voter_id = auth.uid()
  AND EXISTS (SELECT 1 FROM game_players a WHERE a.game_id = skill_votes.game_id AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM game_players b WHERE b.game_id = skill_votes.game_id AND b.user_id = skill_votes.target_id)
  AND EXISTS (SELECT 1 FROM games g WHERE g.id = skill_votes.game_id AND g.starts_at <= now() AND g.status <> 'cancelled')
);
CREATE POLICY "read own votes" ON skill_votes FOR SELECT USING (voter_id = auth.uid());

-- Track when a level was last moved by votes (so old votes don't count twice)
ALTER TABLE player_sports ADD COLUMN IF NOT EXISTS level_changed_at timestamptz;

-- After each vote: 5+ distinct voters since last change, net ≥ 5 one way → move one tier
CREATE OR REPLACE FUNCTION apply_skill_votes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since    timestamptz;
  ups      int;
  downs    int;
  cur      text;
  next_lvl text;
BEGIN
  SELECT skill::text, COALESCE(level_changed_at, '1970-01-01') INTO cur, since
  FROM player_sports WHERE user_id = NEW.target_id AND sport::text = NEW.sport;
  IF cur IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(DISTINCT voter_id) FILTER (WHERE vote = 1),
         COUNT(DISTINCT voter_id) FILTER (WHERE vote = -1)
  INTO ups, downs
  FROM skill_votes
  WHERE target_id = NEW.target_id AND sport = NEW.sport AND created_at > since;

  next_lvl := cur;
  IF ups - downs >= 5 THEN
    next_lvl := CASE cur WHEN 'beginner' THEN 'intermediate' WHEN 'intermediate' THEN 'advanced' ELSE cur END;
  ELSIF downs - ups >= 5 THEN
    next_lvl := CASE cur WHEN 'advanced' THEN 'intermediate' WHEN 'intermediate' THEN 'beginner' ELSE cur END;
  END IF;

  IF next_lvl <> cur THEN
    UPDATE player_sports
       SET skill = next_lvl::skill_level, level_changed_at = now()
     WHERE user_id = NEW.target_id AND sport::text = NEW.sport;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_skill_votes ON skill_votes;
CREATE TRIGGER trg_apply_skill_votes AFTER INSERT ON skill_votes
  FOR EACH ROW EXECUTE FUNCTION apply_skill_votes();

-- ── B. Push notification token ──────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token text;

-- ── C. Waitlist ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_waitlist (
  game_id    uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);
ALTER TABLE game_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read waitlist" ON game_waitlist FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "join waitlist" ON game_waitlist FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave waitlist" ON game_waitlist FOR DELETE USING (user_id = auth.uid());

-- When a player leaves / is kicked, the first person on the waitlist takes the spot
CREATE OR REPLACE FUNCTION promote_waitlist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nxt uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM games WHERE id = OLD.game_id AND status = 'open' AND starts_at > now()) THEN
    SELECT user_id INTO nxt FROM game_waitlist
     WHERE game_id = OLD.game_id ORDER BY created_at LIMIT 1;
    IF nxt IS NOT NULL THEN
      DELETE FROM game_waitlist WHERE game_id = OLD.game_id AND user_id = nxt;
      INSERT INTO game_players (game_id, user_id) VALUES (OLD.game_id, nxt) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_promote_waitlist ON game_players;
CREATE TRIGGER trg_promote_waitlist AFTER DELETE ON game_players
  FOR EACH ROW EXECUTE FUNCTION promote_waitlist();
