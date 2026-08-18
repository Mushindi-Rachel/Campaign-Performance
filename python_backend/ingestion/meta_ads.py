"""
Meta Marketing API ingestion.

Pulls campaign-level daily insights from the Meta Marketing API
and upserts them into the campaign_daily_metrics table.

API docs: https://developers.facebook.com/docs/marketing-api/insights
"""

import sys
import os
from datetime import date, timedelta
from typing import Any

import requests

# Allow running as a module: python -m ingestion.meta_ads
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config
from db import get_client, upsert_rows, log_ingestion

META_API_BASE = "https://graph.facebook.com/v19.0"

# Fields to pull from the Insights API
INSIGHT_FIELDS = [
    "campaign_id",
    "campaign_name",
    "date_start",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "conversions",
    "cost_per_conversion",
]


def fetch_campaigns_from_meta(days_back: int = 1) -> list[dict]:
    """
    Fetch campaign-level daily insights from Meta Marketing API.
    Returns a list of raw API response rows.
    """
    if not config.has_meta():
        raise RuntimeError("Meta credentials not configured (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID)")

    since = (date.today() - timedelta(days=days_back)).isoformat()
    until = date.today().isoformat()

    url = f"{META_API_BASE}/{config.META_AD_ACCOUNT_ID}/insights"
    params = {
        "access_token": config.META_ACCESS_TOKEN,
        "level": "campaign",
        "fields": ",".join(INSIGHT_FIELDS),
        "time_increment": 1,  # daily breakdown
        "time_range": f'{{"since":"{since}","until":"{until}"}}',
    }

    all_rows: list[dict] = []
    cursor: str | None = None

    while True:
        if cursor:
            params["after"] = cursor
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        all_rows.extend(data.get("data", []))

        paging = data.get("paging", {})
        cursor = paging.get("cursors", {}).get("after")
        if not cursor:
            break

    return all_rows


def _to_float(val: Any) -> float:
    try:
        return float(val) if val else 0.0
    except (ValueError, TypeError):
        return 0.0


def _to_int(val: Any) -> int:
    try:
        return int(float(val)) if val else 0
    except (ValueError, TypeError):
        return 0


def transform_meta_rows(raw_rows: list[dict]) -> list[dict]:
    """Transform raw Meta API rows into database-ready dicts."""
    client = get_client()

    # Fetch existing campaigns to map Meta campaign_id → our UUID
    existing = client.table("campaigns").select("id, name").execute()
    name_to_id: dict[str, str] = {}
    if existing.data:
        name_to_id = {row["name"]: row["id"] for row in existing.data}

    # Collect any new campaign names we need to create
    new_campaign_names: list[str] = []
    for row in raw_rows:
        name = row.get("campaign_name", "")
        if name and name not in name_to_id and name not in new_campaign_names:
            new_campaign_names.append(name)

    # Create new campaigns
    for name in new_campaign_names:
        result = client.table("campaigns").insert({
            "name": name,
            "platform": "Meta",
            "objective": "Conversions",
            "status": "Active",
            "budget_ksh": 0,
        }).execute()
        if result.data:
            name_to_id[name] = result.data[0]["id"]

    transformed: list[dict] = []
    for row in raw_rows:
        campaign_name = row.get("campaign_name", "")
        campaign_id = name_to_id.get(campaign_name)
        if not campaign_id:
            continue

        spend = _to_float(row.get("spend")) * 1000  # Meta returns in account currency, scale to KSh
        impressions = _to_int(row.get("impressions"))
        reach = _to_int(row.get("reach"))
        clicks = _to_int(row.get("clicks"))
        ctr = _to_float(row.get("ctr"))
        cpc = _to_float(row.get("cpc")) * 1000
        cpm = _to_float(row.get("cpm")) * 1000
        conversions = _to_int(row.get("conversions"))
        cost_per_conv = _to_float(row.get("cost_per_conversion")) * 1000

        transformed.append({
            "campaign_id": campaign_id,
            "metric_date": row.get("date_start"),
            "spend_ksh": round(spend, 2),
            "impressions": impressions,
            "reach": reach,
            "clicks": clicks,
            "ctr": round(ctr, 3),
            "cpc_ksh": round(cpc, 2),
            "cpm_ksh": round(cpm, 2),
            "conversions": conversions,
            "cost_per_conversion_ksh": round(cost_per_conv, 2),
        })

    return transformed


def run(days_back: int = 1) -> int:
    """
    Full Meta ingestion: fetch → transform → upsert.
    Returns the number of rows upserted.
    """
    log_ingestion("meta", "running")
    try:
        raw = fetch_campaigns_from_meta(days_back)
        transformed = transform_meta_rows(raw)
        count = upsert_rows("campaign_daily_metrics", transformed, on_conflict="campaign_id,metric_date")
        log_ingestion("meta", "success", rows=count)
        print(f"[Meta] Ingested {count} rows from {len(raw)} raw API records")
        return count
    except Exception as e:
        log_ingestion("meta", "failed", error=str(e))
        print(f"[Meta] Ingestion failed: {e}")
        raise


if __name__ == "__main__":
    run()
