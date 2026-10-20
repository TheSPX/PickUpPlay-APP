-- Step 5 — schedule the "starts in 1 hour" reminder (every 10 minutes)
-- 1) Database → Extensions: enable pg_cron and pg_net
-- 2) Replace YOUR_PROJECT_REF below, then run:

SELECT cron.schedule(
  'game-reminders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"type": "reminders"}'::jsonb
  );
  $$
);

-- To stop it later:  SELECT cron.unschedule('game-reminders');
