-- `Finding.errorTitle` is user/import supplied text and can exceed the original 255-character
-- index column. Keep the full value so backfill and later read-through sync cannot fail on a valid
-- finding; the complete object remains in `payload` either way.
ALTER TABLE public.finding_records
  ALTER COLUMN error_title TYPE TEXT;
