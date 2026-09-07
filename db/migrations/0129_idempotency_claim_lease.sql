ALTER TABLE public.idempotency_keys
  ADD COLUMN IF NOT EXISTS claim_token TEXT NOT NULL DEFAULT 'legacy';

-- Existing pending rows become deliberately uncompletable after rollout: they expire naturally,
-- while every new runtime claim supplies a random token. This is safer than letting old work own
-- a newly reclaimed key.
UPDATE public.idempotency_keys
   SET claim_token = 'legacy'
 WHERE claim_token IS NULL;
