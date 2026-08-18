"""
Google Analytics 4 Data API ingestion.

Pulls daily website metrics from GA4 and upserts them into the
ga4_daily_metrics table, mapping traffic source to campaigns.

API docs: https://developers.google.com/analytics/devguides/reporting/data/v1
"""

import sys
import os
from datetime import date, timedelta, datetime
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config
from db import get_client, upsert_rows, log_ingestion


def _build_ga4_client():
    """Create an authenticated GA4 Data API client using service account creds."""
    from google.analytics.data import BetaAnalyticsDataClient
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info({
        "client_email": config.GA4_CLIENT_EMAIL,
        "private_key": config.GA4_PRIVATE_KEY.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    return BetaAnalyticsDataClient(credentials=credentials)


def fetch_ga4_metrics(days_back: int = 1) -> list[dict]:
    """
    Fetch daily metrics from GA4, broken down by date and session source/medium.
    Returns a list of normalized dicts.
    """
    if not config.has_ga4():
        raise RuntimeError("GA4 credentials not configured (GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)")

    from google.analytics.data import (
        RunReportRequest,
        DateRange,
        Dimension,
        Metric,
    )

    client = _build_ga4_client()

    start_date = (date.today() - timedelta(days=days_back)).isoformat()
    end_date = date.today().isoformat()

    request = RunReportRequest(
        property=f"properties/{config.GA4_PROPERTY_ID}",
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        dimensions=[
            Dimension(name="date"),
            Dimension(name="sessionSource"),
            Dimension(name="sessionMedium"),
            Dimension(name="sessionCampaignName"),
            Dimension(name="landingPagePlusQueryString"),
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="engagedSessions"),
            Metric(name="engagementRate"),
            Metric(name="totalUsers"),
            Metric(name="newUsers"),
            Metric(name="screenPageViews"),
            Metric(name="conversions"),
        ],
    )

    response = client.run_report(request)

    rows: list[dict] = []
    for row in response.rows:
        dim_values = {d.name: row.dimension_values[i].value for i, d in enumerate(response.dimension_headers)}
        metric_values = {m.name: row.metric_values[i].value for i, m in enumerate(response.metric_headers)}

        # Parse GA4 date format (YYYYMMDD)
        raw_date = dim_values.get("date", "")
        try:
            parsed_date = datetime.strptime(raw_date, "%Y%m%d").date().isoformat()
        except ValueError:
            continue

        rows.append({
            "date": parsed_date,
            "session_source": dim_values.get("sessionSource", ""),
            "session_medium": dim_values.get("sessionMedium", ""),
            "session_campaign_name": dim_values.get("sessionCampaignName", ""),
            "landing_page": dim_values.get("landingPagePlusQueryString", ""),
            "sessions": int(float(metric_values.get("sessions", 0))),
            "engaged_sessions": int(float(metric_values.get("engagedSessions", 0))),
            "engagement_rate": float(metric_values.get("engagementRate", 0)),
            "users": int(float(metric_values.get("totalUsers", 0))),
            "new_users": int(float(metric_values.get("newUsers", 0))),
            "pageviews": int(float(metric_values.get("screenPageViews", 0))),
            "conversions": int(float(metric_values.get("conversions", 0))),
        })

    return rows


def _normalize(name: str) -> str:
    """Lowercase and strip anything that isn't a letter/digit, for fuzzy name matching."""
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _map_source_to_campaign(
    campaign_name_dim: str,
    source: str,
    landing_page: str,
    campaigns: dict[str, str],
) -> str | None:
    """
    Map a GA4 row to a campaign UUID.

    Preferred path: GA4's `sessionCampaignName` dimension reflects the utm_campaign
    tag on the ad/link, which should match the Meta campaign name (or a close
    variant of it) exactly. We match on a normalized (lowercased, punctuation-
    stripped) basis so "Enterprise eBook" matches "enterprise_ebook" or
    "Enterprise-eBook-Q3" etc.

    This requires your Meta ads to be UTM-tagged with utm_campaign matching (or
    containing) the campaign name stored in the `campaigns` table. If that tagging
    discipline isn't in place yet, this falls back to a keyword heuristic on
    source/landing page, which is best-effort only and should be treated as a
    stopgap, not a long-term attribution strategy.
    """
    norm_campaign_dim = _normalize(campaign_name_dim)

    if norm_campaign_dim and norm_campaign_dim not in ("(notset)", "(direct)none"):
        for name, campaign_id in campaigns.items():
            norm_name = _normalize(name)
            if norm_name and (norm_name in norm_campaign_dim or norm_campaign_dim in norm_name):
                return campaign_id

    # Fallback heuristic — only used when no utm_campaign tag was present or it
    # didn't match any known campaign name. Keep this list in sync with real
    # campaign names, and prefer fixing UTM tagging over expanding this map.
    source_lower = source.lower()
    landing_lower = landing_page.lower()

    keyword_map = {
        "Enterprise eBook": ["ebook", "enterprise-ebook"],
        "Leadership Webinar": ["webinar", "leadership"],
        "Brand Awareness": ["brand", "about"],
        "LinkedIn Outreach": ["linkedin"],
        "Retargeting Flow": ["retarget", "retargeting"],
    }

    for campaign_name, keywords in keyword_map.items():
        for kw in keywords:
            if kw in source_lower or kw in landing_lower:
                return campaigns.get(campaign_name)

    if any(x in source_lower for x in ["facebook", "instagram", "meta"]):
        return campaigns.get("Enterprise eBook")

    if "linkedin" in source_lower:
        return campaigns.get("LinkedIn Outreach")

    return None


def transform_ga4_rows(raw_rows: list[dict]) -> list[dict]:
    """Transform GA4 rows into database-ready dicts, mapping to campaigns."""
    client = get_client()

    existing = client.table("campaigns").select("id, name").execute()
    name_to_id: dict[str, str] = {}
    if existing.data:
        name_to_id = {row["name"]: row["id"] for row in existing.data}

    transformed: list[dict] = []
    for row in raw_rows:
        campaign_id = _map_source_to_campaign(
            row.get("session_campaign_name", ""),
            row.get("session_source", ""),
            row.get("landing_page", ""),
            name_to_id,
        )
        if not campaign_id:
            continue

        traffic_source = "LinkedIn" if "linkedin" in row.get("session_source", "").lower() else "Meta"

        transformed.append({
            "campaign_id": campaign_id,
            "metric_date": row["date"],
            "sessions": row["sessions"],
            "engaged_sessions": row["engaged_sessions"],
            "engagement_rate": round(row["engagement_rate"], 3),
            "users": row["users"],
            "new_users": row["new_users"],
            "pageviews": row["pageviews"],
            "landing_page": row["landing_page"],
            "traffic_source": traffic_source,
            "conversions": row["conversions"],
        })

    return transformed


def run(days_back: int = 1) -> int:
    """
    Full GA4 ingestion: fetch → transform → upsert.
    Returns the number of rows upserted.
    """
    log_ingestion("ga4", "running")
    try:
        raw = fetch_ga4_metrics(days_back)
        transformed = transform_ga4_rows(raw)
        count = upsert_rows("ga4_daily_metrics", transformed, on_conflict="campaign_id,metric_date")
        log_ingestion("ga4", "success", rows=count)
        print(f"[GA4] Ingested {count} rows from {len(raw)} raw API records")
        return count
    except Exception as e:
        log_ingestion("ga4", "failed", error=str(e))
        print(f"[GA4] Ingestion failed: {e}")
        raise


if __name__ == "__main__":
    run()
