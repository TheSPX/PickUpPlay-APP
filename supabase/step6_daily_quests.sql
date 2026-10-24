-- ════════════════════════════════════════════════════════════════
-- Step 6 — Daily Quests (Solo Leveling system)
-- Adds new tables/functions only. Existing data untouched.
-- ════════════════════════════════════════════════════════════════

-- Hunter profile: XP, streak
CREATE TABLE IF NOT EXISTS hunter_stats (
  user_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  xp          int  NOT NULL DEFAULT 0,
  streak      int  NOT NULL DEFAULT 0,
  best_streak int  NOT NULL DEFAULT 0,
  last_clear  date,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-day quest progress
CREATE TABLE IF NOT EXISTS quest_log (
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day       date NOT NULL,
  quest     text NOT NULL,
  progress  int  NOT NULL DEFAULT 0,
  target    int  NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, day, quest)
);

-- XP history ("+30 Joined a game")
CREATE TABLE IF NOT EXISTS xp_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     int  NOT NULL,
  reason     text NOT NULL,
  day        date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_events_user_time ON xp_events (user_id, created_at DESC);

-- Read-only for the owner; all writes go through the functions below
ALTER TABLE hunter_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_events    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stats"  ON hunter_stats FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own quests" ON quest_log    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own xp"     ON xp_events    FOR SELECT USING (user_id = auth.uid());

-- Internal: give XP
CREATE OR REPLACE FUNCTION add_xp(p_user uuid, p_amount int, p_reason text, p_day date DEFAULT current_date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO hunter_stats (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  UPDATE hunter_stats SET xp = xp + p_amount, updated_at = now() WHERE user_id = p_user;
  INSERT INTO xp_events (user_id, amount, reason, day) VALUES (p_user, p_amount, p_reason, p_day);
END $$;
REVOKE ALL ON FUNCTION add_xp(uuid, int, text, date) FROM PUBLIC, anon, authenticated;

-- App calls this to save progress. Awards XP once per quest per day,
-- plus the daily-clear bonus + streak when every quest is done.
CREATE OR REPLACE FUNCTION log_quest(
  p_day date, p_quest text, p_label text, p_progress int, p_target int, p_total int
) RETURNS hunter_stats
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  was_done boolean;
  done_count int;
  st hunter_stats;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_day NOT BETWEEN current_date - 1 AND current_date + 1 THEN RAISE EXCEPTION 'bad day'; END IF;
  IF p_target < 1 OR p_target > 100000 OR p_total < 1 OR p_total > 20 THEN RAISE EXCEPTION 'bad target'; END IF;

  INSERT INTO hunter_stats (user_id) VALUES (uid) ON CONFLICT DO NOTHING;

  SELECT completed INTO was_done FROM quest_log WHERE user_id = uid AND day = p_day AND quest = p_quest;

  INSERT INTO quest_log (user_id, day, quest, progress, target, completed)
  VALUES (uid, p_day, p_quest, LEAST(p_progress, p_target), p_target, p_progress >= p_target)
  ON CONFLICT (user_id, day, quest) DO UPDATE
    SET progress  = GREATEST(quest_log.progress, LEAST(EXCLUDED.progress, EXCLUDED.target)),
        target    = EXCLUDED.target,
        completed = quest_log.completed OR EXCLUDED.completed;

  -- Quest XP (once)
  IF p_progress >= p_target AND NOT COALESCE(was_done, false) THEN
    PERFORM add_xp(uid, 20, 'Quest: ' || p_label, p_day);
  END IF;

  -- Daily clear bonus + streak (once per day)
  SELECT COUNT(*) INTO done_count FROM quest_log WHERE user_id = uid AND day = p_day AND completed;
  SELECT * INTO st FROM hunter_stats WHERE user_id = uid;
  IF done_count >= p_total AND (st.last_clear IS NULL OR st.last_clear < p_day) THEN
    UPDATE hunter_stats
       SET streak      = CASE WHEN last_clear = p_day - 1 THEN streak + 1 ELSE 1 END,
           best_streak = GREATEST(best_streak, CASE WHEN last_clear = p_day - 1 THEN streak + 1 ELSE 1 END),
           last_clear  = p_day
     WHERE user_id = uid
     RETURNING * INTO st;
    PERFORM add_xp(uid, 50 + LEAST(st.streak * 5, 50), 'Daily Quest cleared · ' || st.streak || '-day streak', p_day);
  END IF;

  SELECT * INTO st FROM hunter_stats WHERE user_id = uid;
  RETURN st;
END $$;
GRANT EXECUTE ON FUNCTION log_quest(date, text, text, int, int, int) TO authenticated;

-- Sports bonus XP: joining (+30) and hosting (+50) a game
CREATE OR REPLACE FUNCTION xp_on_join() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM games WHERE id = NEW.game_id AND host_id = NEW.user_id) THEN
    PERFORM add_xp(NEW.user_id, 30, 'Joined a game');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_xp_on_join ON game_players;
CREATE TRIGGER trg_xp_on_join AFTER INSERT ON game_players
  FOR EACH ROW EXECUTE FUNCTION xp_on_join();

CREATE OR REPLACE FUNCTION xp_on_host() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM add_xp(NEW.host_id, 50, 'Hosted a game');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_xp_on_host ON games;
CREATE TRIGGER trg_xp_on_host AFTER INSERT ON games
  FOR EACH ROW EXECUTE FUNCTION xp_on_host();
