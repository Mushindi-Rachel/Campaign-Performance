"""
Main orchestrator — runs the full data pipeline:

  1. Meta Ads ingestion
  2. GA4 ingestion
  3. AI analysis (anomaly detection, prediction, diagnosis, recommendations)

Usage:
    python main.py                    # Full pipeline (today's data)
    python main.py --days 7           # Backfill last 7 days
    python main.py --skip-meta        # Skip Meta ingestion
    python main.py --skip-ga4         # Skip GA4 ingestion
    python main.py --ai-only           # Only run AI analysis on existing data
"""

import sys
import os
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import config
from db import log_ingestion


def run_pipeline(days_back: int = 1, skip_meta: bool = False, skip_ga4: bool = False, ai_only: bool = False) -> None:
    start = datetime.now()
    print("=" * 60)
    print(f"  Campaign Intelligence Pipeline — {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    if not ai_only:
        if not skip_meta and config.has_meta():
            from ingestion.meta_ads import run as run_meta
            run_meta(days_back)
        elif not skip_meta:
            print("[Meta] Skipped — credentials not configured")

        if not skip_ga4 and config.has_ga4():
            from ingestion.ga4 import run as run_ga4
            run_ga4(days_back)
        elif not skip_ga4:
            print("[GA4] Skipped — credentials not configured")
    else:
        print("[Ingestion] Skipped — AI-only mode")

    # Always run AI analysis
    from ai.engine import run as run_ai
    run_ai()

    elapsed = (datetime.now() - start).total_seconds()
    print("=" * 60)
    print(f"  Pipeline complete in {elapsed:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Campaign Intelligence Pipeline")
    parser.add_argument("--days", type=int, default=1, help="Number of days to pull (default: 1)")
    parser.add_argument("--skip-meta", action="store_true", help="Skip Meta ingestion")
    parser.add_argument("--skip-ga4", action="store_true", help="Skip GA4 ingestion")
    parser.add_argument("--ai-only", action="store_true", help="Only run AI analysis")
    args = parser.parse_args()

    run_pipeline(
        days_back=args.days,
        skip_meta=args.skip_meta,
        skip_ga4=args.skip_ga4,
        ai_only=args.ai_only,
    )
