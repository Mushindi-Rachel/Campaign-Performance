/*
# Campaign Performance Intelligence — Schema

1. Purpose
   Stores Meta Ads and GA4 marketing data for Pathways' campaigns, enabling
   an AI layer that detects anomalies, predicts performance, diagnoses
   underperforming campaigns, and generates recommendations.

2. New Tables
   - `campaigns` — one row per campaign (name, platform, objective, status, budget).
   - `campaign_daily_metrics` — daily Meta-side metrics per campaign (spend, impressions, clicks, conversions, etc.).
   - `ga4_daily_metrics` — daily GA4 website metrics per campaign (sessions, engaged sessions, engagement rate, landing page, etc.).
   - `ai_insights` — AI-generated insights (anomalies, trends, opportunities) with severity.
   - `ai_recommendations` — AI-generated actionable recommendations with priority.

3. Security
   - Single-tenant app (no sign-in). RLS enabled on all tables.
   - Policies allow anon + authenticated full CRUD since data is intentionally shared/public.

4. Notes
   - All tables use gen_random_uuid() primary keys.
   - Timestamps default to now().
   - Foreign keys with ON DELETE CASCADE so deleting a campaign removes its metrics.
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'Meta',
  objective text NOT NULL DEFAULT 'Conversions',
  status text NOT NULL DEFAULT 'Active',
  budget_ksh numeric(12,2) NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_campaigns" ON campaigns;
CREATE POLICY "anon_select_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_campaigns" ON campaigns;
CREATE POLICY "anon_insert_campaigns" ON campaigns FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_campaigns" ON campaigns;
CREATE POLICY "anon_update_campaigns" ON campaigns FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_campaigns" ON campaigns;
CREATE POLICY "anon_delete_campaigns" ON campaigns FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS campaign_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  spend_ksh numeric(12,2) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  ctr numeric(6,3) NOT NULL DEFAULT 0,
  cpc_ksh numeric(10,2) NOT NULL DEFAULT 0,
  cpm_ksh numeric(10,2) NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  cost_per_conversion_ksh numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (campaign_id, metric_date)
);

ALTER TABLE campaign_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cdm" ON campaign_daily_metrics;
CREATE POLICY "anon_select_cdm" ON campaign_daily_metrics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cdm" ON campaign_daily_metrics;
CREATE POLICY "anon_insert_cdm" ON campaign_daily_metrics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cdm" ON campaign_daily_metrics;
CREATE POLICY "anon_update_cdm" ON campaign_daily_metrics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cdm" ON campaign_daily_metrics;
CREATE POLICY "anon_delete_cdm" ON campaign_daily_metrics FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS ga4_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  engagement_rate numeric(6,3) NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  pageviews integer NOT NULL DEFAULT 0,
  landing_page text NOT NULL DEFAULT '',
  traffic_source text NOT NULL DEFAULT 'Meta',
  conversions integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (campaign_id, metric_date)
);

ALTER TABLE ga4_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ga4" ON ga4_daily_metrics;
CREATE POLICY "anon_select_ga4" ON ga4_daily_metrics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ga4" ON ga4_daily_metrics;
CREATE POLICY "anon_insert_ga4" ON ga4_daily_metrics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ga4" ON ga4_daily_metrics;
CREATE POLICY "anon_update_ga4" ON ga4_daily_metrics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ga4" ON ga4_daily_metrics;
CREATE POLICY "anon_delete_ga4" ON ga4_daily_metrics FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text NOT NULL,
  metric text,
  metric_value numeric(12,2),
  expected_value numeric(12,2),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_insights" ON ai_insights;
CREATE POLICY "anon_select_insights" ON ai_insights FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_insights" ON ai_insights;
CREATE POLICY "anon_insert_insights" ON ai_insights FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_insights" ON ai_insights;
CREATE POLICY "anon_update_insights" ON ai_insights FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_insights" ON ai_insights;
CREATE POLICY "anon_delete_insights" ON ai_insights FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  action text NOT NULL,
  rationale text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recs" ON ai_recommendations;
CREATE POLICY "anon_select_recs" ON ai_recommendations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recs" ON ai_recommendations;
CREATE POLICY "anon_insert_recs" ON ai_recommendations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recs" ON ai_recommendations;
CREATE POLICY "anon_update_recs" ON ai_recommendations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recs" ON ai_recommendations;
CREATE POLICY "anon_delete_recs" ON ai_recommendations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cdm_campaign_date ON campaign_daily_metrics(campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ga4_campaign_date ON ga4_daily_metrics(campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON ai_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recs_campaign ON ai_recommendations(campaign_id);
