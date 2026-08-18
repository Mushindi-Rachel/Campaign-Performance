"""
Dagster pipeline definition for the Campaign Intelligence pipeline.

Install Dagster:
    pip install dagster dagster-webserver

Run:
    dagster dev -f orchestrator/dagster_pipeline.py

This defines a job with three ops:
  1. ingest_meta   — pull Meta Ads data
  2. ingest_ga4    — pull GA4 data
  3. run_ai_analysis — analyze data and store insights/recommendations
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dagster import job, op, Out, In, Nothing, graph

from config import config
from db import log_ingestion


@op(out=Out(Nothing))
def ingest_meta_op():
    if not config.has_meta():
        print("[Meta] Skipped — credentials not configured")
        return
    from ingestion.meta_ads import run as run_meta
    run_meta(1)


@op(ins={"meta": In(Nothing)}, out=Out(Nothing))
def ingest_ga4_op(meta):
    if not config.has_ga4():
        print("[GA4] Skipped — credentials not configured")
        return
    from ingestion.ga4 import run as run_ga4
    run_ga4(1)


@op(ins={"ga4": In(Nothing)})
def run_ai_analysis_op(ga4):
    from ai.engine import run as run_ai
    run_ai()


@graph
def campaign_intelligence_graph():
    run_ai_analysis_op(ingest_ga4_op(ingest_meta_op()))


campaign_intelligence_job = campaign_intelligence_graph.to_job(
    name="campaign_intelligence",
    description="Pull Meta + GA4 data, run AI analysis, store insights and recommendations.",
)
