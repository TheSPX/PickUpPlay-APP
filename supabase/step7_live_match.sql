-- ════════════════════════════════════════════════════════════════
-- Step 7 — Live match: teams, goals/assists, score, winner
-- Adds columns/tables/functions only. Existing games become 'scheduled'.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'scheduled'
    CHECK (match_status IN ('scheduled','live','finished')),
  ADD COLUMN IF NOT EXISTS score_a int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_b int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS winner text CHECK (winner IN ('A','B','draw')),
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_recording boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS game_teams (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team    text NOT NULL CHECK (team IN ('A','B')),
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team       text NOT NULL CHECK (team IN ('A','B')),
  kind       text NOT NULL CHECK (kind IN ('goal','assist')),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_events_game ON match_events (game_id, created_at);

ALTER TABLE game_teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- Players in the game (and the host) can read; writes only via functions below
CREATE POLICY "players read teams" ON game_teams FOR SELECT USING (
  EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = game_teams.game_id AND gp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM games g WHERE g.id = game_teams.game_id AND g.host_id = auth.uid())
);
CREATE POLICY "players read events" ON match_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = match_events.game_id AND gp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM games g WHERE g.id = match_events.game_id AND g.host_id = auth.uid())
);

-- Who may record: host always; players only when open_recording is on
CREATE OR REPLACE FUNCTION can_record(p_game uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM games g WHERE g.id = p_game AND g.match_status = 'live' AND (
      g.host_id = auth.uid()
      OR (g.open_recording AND EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.user_id = auth.uid()))
    )
  );
$$;

-- Host starts the match with the two teams
CREATE OR REPLACE FUNCTION start_match(p_game uuid, p_team_a uuid[], p_team_b uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM games WHERE id = p_game AND host_id = auth.uid()
                 AND status <> 'cancelled' AND match_status = 'scheduled') THEN
    RAISE EXCEPTION 'Only the host can start this game';
  END IF;
  DELETE FROM game_teams WHERE game_id = p_game;
  INSERT INTO game_teams (game_id, user_id, team)
    SELECT p_game, u, 'A' FROM unnest(p_team_a) u
     WHERE EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = p_game AND gp.user_id = u)
  UNION ALL
    SELECT p_game, u, 'B' FROM unnest(p_team_b) u
     WHERE EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = p_game AND gp.user_id = u);
  UPDATE games SET match_status = 'live', live_started_at = now(), score_a = 0, score_b = 0, winner = NULL
   WHERE id = p_game;
END $$;

-- Move a player to the other team (host only, while live)
CREATE OR REPLACE FUNCTION switch_team(p_game uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM games WHERE id = p_game AND host_id = auth.uid() AND match_status = 'live') THEN
    RAISE EXCEPTION 'Only the host can change teams';
  END IF;
  UPDATE game_teams SET team = CASE team WHEN 'A' THEN 'B' ELSE 'A' END
   WHERE game_id = p_game AND user_id = p_user;
END $$;

-- Record a goal or assist; goals update the team score
CREATE OR REPLACE FUNCTION record_event(p_game uuid, p_user uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF NOT can_record(p_game) THEN RAISE EXCEPTION 'You can''t record in this game'; END IF;
  IF p_kind NOT IN ('goal','assist') THEN RAISE EXCEPTION 'bad kind'; END IF;
  SELECT team INTO t FROM game_teams WHERE game_id = p_game AND user_id = p_user;
  IF t IS NULL THEN RAISE EXCEPTION 'Player is not on a team'; END IF;
  INSERT INTO match_events (game_id, user_id, team, kind, created_by)
  VALUES (p_game, p_user, t, p_kind, auth.uid());
  IF p_kind = 'goal' THEN
    UPDATE games SET score_a = score_a + (t = 'A')::int, score_b = score_b + (t = 'B')::int WHERE id = p_game;
  END IF;
END $$;

-- Undo the most recent event
CREATE OR REPLACE FUNCTION undo_last_event(p_game uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e match_events;
BEGIN
  IF NOT can_record(p_game) THEN RAISE EXCEPTION 'You can''t record in this game'; END IF;
  SELECT * INTO e FROM match_events WHERE game_id = p_game ORDER BY created_at DESC LIMIT 1;
  IF e.id IS NULL THEN RETURN; END IF;
  DELETE FROM match_events WHERE id = e.id;
  IF e.kind = 'goal' THEN
    UPDATE games SET score_a = GREATEST(0, score_a - (e.team = 'A')::int),
                     score_b = GREATEST(0, score_b - (e.team = 'B')::int) WHERE id = p_game;
  END IF;
END $$;

-- Host toggles whether every player can record
CREATE OR REPLACE FUNCTION set_open_recording(p_game uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE games SET open_recording = p_on WHERE id = p_game AND host_id = auth.uid();
END $$;

-- End match: save winner, award XP once (needs step 6 add_xp)
CREATE OR REPLACE FUNCTION end_match(p_game uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games; w text; r record;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game AND host_id = auth.uid() AND match_status = 'live';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Only the host can end a live game'; END IF;
  w := CASE WHEN g.score_a > g.score_b THEN 'A' WHEN g.score_b > g.score_a THEN 'B' ELSE 'draw' END;
  UPDATE games SET match_status = 'finished', winner = w, ended_at = now() WHERE id = p_game;

  FOR r IN SELECT user_id,
                  COUNT(*) FILTER (WHERE kind = 'goal')   AS goals,
                  COUNT(*) FILTER (WHERE kind = 'assist') AS assists
             FROM match_events WHERE game_id = p_game GROUP BY user_id LOOP
    IF r.goals > 0   THEN PERFORM add_xp(r.user_id, 15 * r.goals::int,   r.goals || ' goal(s) scored'); END IF;
    IF r.assists > 0 THEN PERFORM add_xp(r.user_id, 10 * r.assists::int, r.assists || ' assist(s)'); END IF;
  END LOOP;
  IF w <> 'draw' THEN
    FOR r IN SELECT user_id FROM game_teams WHERE game_id = p_game AND team = w LOOP
      PERFORM add_xp(r.user_id, 25, 'Won a match');
    END LOOP;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION start_match(uuid, uuid[], uuid[]), switch_team(uuid, uuid),
  record_event(uuid, uuid, text), undo_last_event(uuid), set_open_recording(uuid, boolean),
  end_match(uuid) TO authenticated;

-- Realtime so every phone sees the score live
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['match_events','game_teams','games'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
