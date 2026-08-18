/*
# Add ingestion_log table

1. New Tables
   - `ingestion_log` — tracks each data pipeline run (source, status, rows pulled, errors, timestamps).
     This enables the dashboard to show when data was last ingested and whether the pipeline is healthy.

2. Security
   - Single-tenant app (no sign-in). RLS enabled.
   - Policies allow anon + authenticated full CRUD since data is intentionally shared.

3. Notes
   - `source` values: 'meta', 'ga4', 'ai_analysis', 'full_pipeline'
   - `status` values: 'running', 'success', 'failed'
*/

CREATE TABLE IF NOT EXISTS ingestion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  rows_processed integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ingestion_log" ON ingestion_log;
CREATE POLICY "anon_select_ingestion_log" ON ingestion_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ingestion_log" ON ingestion_log;
CREATE POLICY "anon_insert_ingestion_log" ON ingestion_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ingestion_log" ON ingestion_log;
CREATE POLICY "anon_update_ingestion_log" ON ingestion_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ingestion_log" ON ingestion_log;
CREATE POLICY "anon_delete_ingestion_log" ON ingestion_log FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_started ON ingestion_log(started_at DESC);
