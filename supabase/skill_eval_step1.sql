-- Step 1 — Skill evaluation answers on player_sports
-- Adds columns only. Existing rows and data are untouched (all new columns nullable).
ALTER TABLE player_sports
  ADD COLUMN IF NOT EXISTS experience    text CHECK (experience    IN ('lt1','1to3','3to5','5plus')),
  ADD COLUMN IF NOT EXISTS frequency     text CHECK (frequency     IN ('rarely','monthly','weekly','often')),
  ADD COLUMN IF NOT EXISTS highest_level text CHECK (highest_level IN ('casual','school','club','competitive')),
  ADD COLUMN IF NOT EXISTS skill_check   smallint CHECK (skill_check BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS role          text,
  ADD COLUMN IF NOT EXISTS score         smallint CHECK (score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS evaluated_at  timestamptz;
