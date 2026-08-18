"""
AI/ML Engine — Campaign Performance Intelligence

Analyzes stored campaign data to produce:
  A. Anomaly detection (Z-score on CTR and CPL)
  B. Performance prediction (linear projection to month-end)
  C. Campaign diagnosis (cross-reference Meta metrics with GA4 engagement)
  D. Automated recommendations (portfolio comparison, prioritized actions)

Results are stored in ai_insights and ai_recommendations tables.
"""

import sys
import os
import statistics
from datetime import date
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_client, log_ingestion


def _mean(values: list[float]) -> float:
    return statistics.mean(values) if values else 0.0


def _stdev(values: list[float]) -> float:
    return statistics.stdev(values) if len(values) >= 2 else 0.0


def _fetch_all_data() -> tuple[list[dict], list[dict], list[dict]]:
    """Fetch all campaigns, daily metrics, and GA4 metrics from Supabase."""
    client = get_client()
    campaigns = client.table("campaigns").select("*").order("name").execute().data or []
    metrics = client.table("campaign_daily_metrics").select("*").order("metric_date").execute().data or []
    ga4 = client.table("ga4_daily_metrics").select("*").order("metric_date").execute().data or []
    return campaigns, metrics, ga4


def _portfolio_averages(summaries: list[dict]) -> dict[str, float]:
    cpls = [s["avg_cpl"] for s in summaries if s["avg_cpl"] > 0]
    ctrs = [s["avg_ctr"] for s in summaries]
    cvrs = [s["conversion_rate"] for s in summaries]
    return {
        "avg_cpl": _mean(cpls),
        "avg_ctr": _mean(ctrs),
        "avg_cvr": _mean(cvrs),
    }


def _build_summaries(campaigns: list[dict], metrics: list[dict], ga4: list[dict]) -> list[dict]:
    summaries: list[dict] = []
    portfolio_cpl_total = sum(m["spend_ksh"] for m in metrics)
    portfolio_conv_total = sum(m["conversions"] for m in metrics)
    portfolio_avg_cpl = portfolio_cpl_total / max(1, portfolio_conv_total)

    for camp in campaigns:
        c_metrics = sorted(
            [m for m in metrics if m["campaign_id"] == camp["id"]],
            key=lambda x: x["metric_date"],
        )
        c_ga4 = [g for g in ga4 if g["campaign_id"] == camp["id"]]

        total_spend = sum(m["spend_ksh"] for m in c_metrics)
        total_impressions = sum(m["impressions"] for m in c_metrics)
        total_clicks = sum(m["clicks"] for m in c_metrics)
        total_conversions = sum(m["conversions"] for m in c_metrics)
        total_sessions = sum(g["sessions"] for g in c_ga4)

        avg_ctr = (total_clicks / total_impressions * 100) if total_impressions else 0
        avg_cpl = (total_spend / total_conversions) if total_conversions else 0
        conversion_rate = (total_conversions / total_clicks * 100) if total_clicks else 0
        avg_engagement = _mean([g["engagement_rate"] * 100 for g in c_ga4]) if c_ga4 else 0

        ai_status = "monitor"
        if avg_cpl > 0 and avg_cpl < portfolio_avg_cpl * 0.85 and conversion_rate >= 7:
            ai_status = "strong"
        elif avg_cpl > portfolio_avg_cpl * 1.3 or conversion_rate < 4:
            ai_status = "review"

        summaries.append({
            "campaign": camp,
            "total_spend": total_spend,
            "total_impressions": total_impressions,
            "total_clicks": total_clicks,
            "total_conversions": total_conversions,
            "total_sessions": total_sessions,
            "avg_ctr": avg_ctr,
            "avg_cpl": avg_cpl,
            "conversion_rate": conversion_rate,
            "avg_engagement": avg_engagement,
            "ai_status": ai_status,
            "daily_metrics": c_metrics,
            "daily_ga4": c_ga4,
        })

    return summaries


def _detect_anomalies(summary: dict) -> list[dict]:
    """A. Anomaly detection using Z-scores on CTR and CPL."""
    insights: list[dict] = []
    metrics = summary["daily_metrics"]
    if len(metrics) < 4:
        return insights

    recent = metrics[-3:]
    historical = metrics[:-3]

    # CTR anomaly
    hist_ctrs = [m["ctr"] * 100 for m in historical]
    recent_ctr = _mean([m["ctr"] * 100 for m in recent])
    hist_ctr = _mean(hist_ctrs)
    ctr_std = _stdev(hist_ctrs)

    if hist_ctr > 0 and ctr_std > 0 and abs(recent_ctr - hist_ctr) > 2 * ctr_std:
        is_drop = recent_ctr < hist_ctr
        insights.append({
            "campaign_id": summary["campaign"]["id"],
            "insight_type": "anomaly",
            "severity": "high" if is_drop else "medium",
            "title": f"{'Drop' if is_drop else 'Spike'} in CTR detected",
            "description": (
                f"{summary['campaign']['name']} CTR {'fell' if is_drop else 'rose'} to "
                f"{recent_ctr:.2f}% from a historical average of {hist_ctr:.2f}%, "
                f"exceeding 2 standard deviations."
            ),
            "metric": "CTR",
            "metric_value": round(recent_ctr, 2),
            "expected_value": round(hist_ctr, 2),
        })

    # CPL anomaly
    hist_cpls = [m["cost_per_conversion_ksh"] for m in historical]
    recent_cpl = _mean([m["cost_per_conversion_ksh"] for m in recent])
    hist_cpl = _mean(hist_cpls)
    cpl_std = _stdev(hist_cpls)

    if hist_cpl > 0 and cpl_std > 0 and recent_cpl > hist_cpl + 2 * cpl_std:
        pct = ((recent_cpl - hist_cpl) / hist_cpl) * 100
        insights.append({
            "campaign_id": summary["campaign"]["id"],
            "insight_type": "anomaly",
            "severity": "critical",
            "title": "Cost per lead anomaly",
            "description": (
                f"{summary['campaign']['name']} CPL increased by {pct:.0f}% over the last 3 days "
                f"(KSh {round(recent_cpl):,} vs historical KSh {round(hist_cpl):,})."
            ),
            "metric": "CPL",
            "metric_value": round(recent_cpl, 2),
            "expected_value": round(hist_cpl, 2),
        })

    return insights


def _predict_performance(summary: dict) -> list[dict]:
    """B. Performance prediction — linear projection to month-end."""
    insights: list[dict] = []
    metrics = summary["daily_metrics"]
    if len(metrics) < 4:
        return insights

    historical = metrics[:-3]
    recent = metrics[-3:]
    recent_conv = sum(m["conversions"] for m in recent)
    hist_conv = sum(m["conversions"] for m in historical)
    daily_avg = hist_conv / max(1, len(historical))

    if daily_avg <= 0:
        return insights

    days_remaining = 31 - date.today().day
    projected = recent_conv + daily_avg * days_remaining

    insights.append({
        "campaign_id": summary["campaign"]["id"],
        "insight_type": "positive_trend",
        "severity": "low",
        "title": "End-of-month projection",
        "description": (
            f"{summary['campaign']['name']} is projected to reach ~{round(projected)} conversions "
            f"by month-end (currently {summary['total_conversions']}), "
            f"based on a daily average of {daily_avg:.1f}."
        ),
        "metric": "Projected Conversions",
        "metric_value": round(projected, 2),
        "expected_value": round(daily_avg * 31, 2),
    })

    return insights


def _diagnose_campaign(summary: dict) -> tuple[list[dict], list[dict]]:
    """C. Campaign diagnosis — traffic up but conversions down."""
    insights: list[dict] = []
    recommendations: list[dict] = []
    ga4 = summary["daily_ga4"]
    metrics = summary["daily_metrics"]

    if len(ga4) < 4 or len(metrics) < 4:
        return insights, recommendations

    recent_sessions = sum(g["sessions"] for g in ga4[-3:])
    hist_sessions = sum(g["sessions"] for g in ga4[:-3])
    recent_conv = sum(m["conversions"] for m in metrics[-3:])
    hist_conv = sum(m["conversions"] for m in metrics[:-3])

    if hist_sessions > 0 and recent_sessions > hist_sessions * 1.1 and recent_conv < hist_conv * 0.85:
        pct = round((recent_sessions / max(1, hist_sessions) - 1) * 100)
        insights.append({
            "campaign_id": summary["campaign"]["id"],
            "insight_type": "diagnosis",
            "severity": "high",
            "title": "Traffic-conversion mismatch",
            "description": (
                f"Traffic is increasing ({pct}% more sessions) but conversions have declined. "
                f"This may indicate a mismatch between the campaign audience/message and the landing-page experience."
            ),
            "metric": "Conversion Rate",
            "metric_value": round((recent_conv / max(1, recent_sessions)) * 100, 2),
            "expected_value": round((hist_conv / max(1, hist_sessions)) * 100, 2),
        })
        recommendations.append({
            "campaign_id": summary["campaign"]["id"],
            "priority": "high",
            "title": f"Investigate {summary['campaign']['name']} landing page",
            "action": (
                f"Review the landing page at {summary['campaign']['name']} and the call-to-action. "
                f"Consider testing a shorter form and a more specific enterprise-focused message."
            ),
            "rationale": "Traffic remains stable while conversions have declined, suggesting the landing page experience is not converting the incoming audience.",
        })

    return insights, recommendations


def _generate_recommendations(summary: dict, portfolio: dict[str, float]) -> list[dict]:
    """D. Automated recommendations based on portfolio comparison."""
    recommendations: list[dict] = []
    name = summary["campaign"]["name"]
    avg_cpl = summary["avg_cpl"]
    cvr = summary["conversion_rate"]

    # Strong performer — recommend budget increase
    if avg_cpl > 0 and avg_cpl < portfolio["avg_cpl"] * 0.85:
        pct_below = round((1 - avg_cpl / portfolio["avg_cpl"]) * 100)
        recommendations.append({
            "campaign_id": summary["campaign"]["id"],
            "priority": "medium",
            "title": f"Increase {name} promotion",
            "action": f"Consider increasing budget allocation for {name}. Conversion performance is consistently above the campaign portfolio average.",
            "rationale": f"CPL is {pct_below}% below the portfolio average and conversions are trending upward.",
        })

    # Underperformer — recommend review
    if avg_cpl > portfolio["avg_cpl"] * 1.3 and cvr < portfolio["avg_cvr"] * 0.7:
        cvr_below = round((cvr / max(0.1, portfolio["avg_cvr"]) - 1) * 100)
        cpl_above = round((avg_cpl / max(1, portfolio["avg_cpl"]) - 1) * 100)
        recommendations.append({
            "campaign_id": summary["campaign"]["id"],
            "priority": "critical",
            "title": f"Review {name} strategy",
            "action": (
                f"{name} has a {cvr:.1f}% conversion rate ({cvr_below}% below average) and "
                f"CPL {cpl_above}% above average. Consider pausing or restructuring the audience targeting and creative."
            ),
            "rationale": "Consistently below-average performance across both conversion rate and cost efficiency.",
        })

    return recommendations


def _detect_linkedin_opportunity(
    campaigns: list[dict], ga4: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Opportunity: LinkedIn vs Meta engagement comparison."""
    insights: list[dict] = []
    recommendations: list[dict] = []

    linkedin_ga4 = [g for g in ga4 if g["traffic_source"] == "LinkedIn"]
    meta_ga4 = [g for g in ga4 if g["traffic_source"] == "Meta"]

    linkedin_eng = _mean([g["engagement_rate"] * 100 for g in linkedin_ga4]) if linkedin_ga4 else 0
    meta_eng = _mean([g["engagement_rate"] * 100 for g in meta_ga4]) if meta_ga4 else 0
    linkedin_sessions = sum(g["sessions"] for g in linkedin_ga4)
    total_sessions = linkedin_sessions + sum(g["sessions"] for g in meta_ga4)
    linkedin_share = (linkedin_sessions / total_sessions * 100) if total_sessions else 0

    if linkedin_eng > meta_eng * 1.15 and linkedin_share < 20:
        linkedin_id = next((c["id"] for c in campaigns if c["name"] == "LinkedIn Outreach"), None)
        insights.append({
            "campaign_id": linkedin_id,
            "insight_type": "opportunity",
            "severity": "medium",
            "title": "LinkedIn engagement opportunity",
            "description": (
                f"Visitors arriving from LinkedIn have {linkedin_eng:.1f}% engagement vs "
                f"{meta_eng:.1f}% from Meta, but represent only {linkedin_share:.0f}% of campaign traffic."
            ),
            "metric": "Engagement Rate",
            "metric_value": round(linkedin_eng, 2),
            "expected_value": round(meta_eng, 2),
        })
        recommendations.append({
            "campaign_id": linkedin_id,
            "priority": "medium",
            "title": "Develop LinkedIn campaign",
            "action": "Increase LinkedIn campaign budget and audience reach. High engagement suggests potential for additional qualified traffic.",
            "rationale": f"LinkedIn traffic shows {round((linkedin_eng / max(0.1, meta_eng) - 1) * 100)}% higher engagement than Meta but represents only {linkedin_share:.0f}% of total traffic.",
        })

    return insights, recommendations


def run() -> dict[str, Any]:
    """
    Full AI analysis: fetch data, run all four AI components, store results.
    Returns a summary of what was generated.
    """
    log_ingestion("ai_analysis", "running")
    try:
        campaigns, metrics, ga4 = _fetch_all_data()
        summaries = _build_summaries(campaigns, metrics, ga4)
        portfolio = _portfolio_averages(summaries)

        all_insights: list[dict] = []
        all_recommendations: list[dict] = []

        for summary in summaries:
            all_insights.extend(_detect_anomalies(summary))
            all_insights.extend(_predict_performance(summary))
            diag_insights, diag_recs = _diagnose_campaign(summary)
            all_insights.extend(diag_insights)
            all_recommendations.extend(diag_recs)
            all_recommendations.extend(_generate_recommendations(summary, portfolio))

        opp_insights, opp_recs = _detect_linkedin_opportunity(campaigns, ga4)
        all_insights.extend(opp_insights)
        all_recommendations.extend(opp_recs)

        # Sort recommendations by priority
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        all_recommendations.sort(key=lambda r: priority_order.get(r["priority"], 3))

        # Store results — clear old, insert new
        client = get_client()
        client.table("ai_insights").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        client.table("ai_recommendations").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

        if all_insights:
            client.table("ai_insights").insert(all_insights).execute()
        if all_recommendations:
            client.table("ai_recommendations").insert(all_recommendations).execute()

        log_ingestion("ai_analysis", "success", rows=len(all_insights) + len(all_recommendations))
        print(f"[AI] Generated {len(all_insights)} insights and {len(all_recommendations)} recommendations")
        return {
            "insights": len(all_insights),
            "recommendations": len(all_recommendations),
        }
    except Exception as e:
        log_ingestion("ai_analysis", "failed", error=str(e))
        print(f"[AI] Analysis failed: {e}")
        raise


if __name__ == "__main__":
    run()
