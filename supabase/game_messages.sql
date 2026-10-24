-- Game chat: run in Supabase SQL Editor (only after confirming)
CREATE TABLE game_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_messages_game_time ON game_messages (game_id, created_at);

ALTER TABLE game_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players read" ON game_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = game_messages.game_id AND gp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM games g WHERE g.id = game_messages.game_id AND g.host_id = auth.uid())
);
CREATE POLICY "players write" ON game_messages FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = game_messages.game_id AND gp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM games g WHERE g.id = game_messages.game_id AND g.host_id = auth.uid())
  )
);
CREATE POLICY "delete own or host" ON game_messages FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM games g WHERE g.id = game_messages.game_id AND g.host_id = auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE game_messages;
