-- Rename delay_days to delay_minutes and convert existing values.
-- 1 day = 1440 minutes. Existing data is multiplied accordingly.

ALTER TABLE public.pipeline_stages
  RENAME COLUMN delay_days TO delay_minutes;

-- Convert existing day values to minutes
UPDATE public.pipeline_stages
  SET delay_minutes = delay_minutes * 1440
  WHERE delay_minutes > 0;

-- Update default for new rows
ALTER TABLE public.pipeline_stages
  ALTER COLUMN delay_minutes SET DEFAULT 1440;
