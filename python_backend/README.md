# Campaign Intelligence — Python Backend

A Python data pipeline for pulling Meta Ads and GA4 data into Supabase/PostgreSQL,
running AI/ML analysis (anomaly detection, performance prediction, campaign diagnosis,
recommendations), and storing results for the Next.js dashboard.

## Architecture

```
Meta Marketing API ─┐
                    ├─→ ingestion/  ─→  Supabase (PostgreSQL)
GA4 Data API ────────┘                        │
                                              ▼
                                         ai/ (anomaly detection,
                                              prediction, diagnosis,
                                              recommendations)
                                              │
                                              ▼
                                    Supabase (ai_insights,
                                              ai_recommendations)
                                              │
                                              ▼
                                    Next.js Dashboard
```

## Quick Start

```bash
cd python_backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit environment config
cp .env.example .env
# Edit .env with your Meta and GA4 credentials

# Run the full pipeline (ingest + AI analysis)
python main.py

# Or run individual components:
python -m ingestion.meta_ads        # Pull Meta Ads data only
python -m ingestion.ga4             # Pull GA4 data only
python -m ai.engine                 # Run AI analysis only
```

## Scheduling

### Option 1: Cron (simplest)

```bash
# Every 30 minutes
*/30 * * * * cd /path/to/python_backend && /path/to/venv/bin/python main.py >> /var/log/campaign-intel.log 2>&1
```

### Option 2: Dagster (recommended for production)

See `orchestrator/dagster_pipeline.py` for a Dagster job definition.

### Option 3: Trigger from dashboard

The Next.js dashboard can trigger the pipeline via the `ingest-data` Supabase Edge Function,
which calls the same ingestion logic server-side.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `META_ACCESS_TOKEN` | Meta Marketing API access token |
| `META_AD_ACCOUNT_ID` | Meta Ad Account ID (with `act_` prefix) |
| `GA4_PROPERTY_ID` | GA4 Property ID (numeric) |
| `GA4_CLIENT_EMAIL` | Google service account email |
| `GA4_PRIVATE_KEY` | Google service account private key |

## What Each Module Does

### ingestion/meta_ads.py
- Pulls campaign-level daily metrics from the Meta Marketing API Insights endpoint
- Fields: spend, impressions, reach, clicks, CTR, CPC, CPM, conversions, cost_per_conversion
- Upserts into `campaign_daily_metrics` table (avoids duplicates via unique constraint)

### ingestion/ga4.py
- Pulls daily website metrics from the Google Analytics Data API
- Fields: sessions, engaged_sessions, engagement_rate, users, new_users, pageviews, conversions
- Maps traffic source to campaign, upserts into `ga4_daily_metrics` table

### ai/engine.py
- **Anomaly detection**: Z-score based (mean ± 2σ) on CTR and CPL
- **Performance prediction**: Linear projection of conversions to month-end
- **Campaign diagnosis**: Cross-references Meta metrics with GA4 engagement to detect traffic-conversion mismatches
- **Recommendations**: Compares each campaign against portfolio averages, generates prioritized actions
- Results stored in `ai_insights` and `ai_recommendations` tables

### utils/db.py
- Shared Supabase client (uses service role key to bypass RLS for server-side writes)
- Upsert helper that handles unique constraint conflicts

### main.py
- Orchestrates the full pipeline: Meta → GA4 → AI analysis
- Logs each step to `ingestion_log` table
- Can be run on a schedule
