import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budget_ksh: number;
}

interface MetricRow {
  campaign_id: string;
  metric_date: string;
  spend_ksh: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc_ksh: number;
  cpm_ksh: number;
  conversions: number;
  cost_per_conversion_ksh: number;
}

interface GA4Row {
  campaign_id: string;
  metric_date: string;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number;
  users: number;
  new_users: number;
  pageviews: number;
  landing_page: string;
  traffic_source: string;
  conversions: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Log pipeline start
    const logRes = await sb.from("ingestion_log").insert({
      source: "full_pipeline",
      status: "running",
    }).select().single();
    const logId = logRes.data?.id;

    // Fetch all existing data
    const [{ data: campaigns }, { data: metrics }, { data: ga4 }] = await Promise.all([
      sb.from("campaigns").select("*").order("name"),
      sb.from("campaign_daily_metrics").select("*").order("metric_date"),
      sb.from("ga4_daily_metrics").select("*").order("metric_date"),
    ]);

    const allCampaigns: CampaignRow[] = campaigns ?? [];
    const allMetrics: MetricRow[] = metrics ?? [];
    const allGA4: GA4Row[] = ga4 ?? [];

    // --- AI Analysis (same logic as Python ai/engine.py) ---
    const portfolioSpend = allMetrics.reduce((s, m) => s + m.spend_ksh, 0);
    const portfolioConv = allMetrics.reduce((s, m) => s + m.conversions, 0);
    const portfolioAvgCpl = portfolioSpend / Math.max(1, portfolioConv);

    const summaries = allCampaigns.map((campaign) => {
      const cMetrics = allMetrics
        .filter((m) => m.campaign_id === campaign.id)
        .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
      const cGA4 = allGA4.filter((g) => g.campaign_id === campaign.id);

      const totalSpend = cMetrics.reduce((s, m) => s + m.spend_ksh, 0);
      const totalImpressions = cMetrics.reduce((s, m) => s + m.impressions, 0);
      const totalClicks = cMetrics.reduce((s, m) => s + m.clicks, 0);
      const totalConversions = cMetrics.reduce((s, m) => s + m.conversions, 0);
      const totalSessions = cGA4.reduce((s, g) => s + g.sessions, 0);

      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCpl = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
      const avgEngagement = cGA4.length > 0 ? mean(cGA4.map((g) => g.engagement_rate * 100)) : 0;

      let aiStatus: "strong" | "monitor" | "review" = "monitor";
      if (avgCpl > 0 && avgCpl < portfolioAvgCpl * 0.85 && conversionRate >= 7) {
        aiStatus = "strong";
      } else if (avgCpl > portfolioAvgCpl * 1.3 || conversionRate < 4) {
        aiStatus = "review";
      }

      return {
        campaign,
        totalSpend,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalSessions,
        avgCtr,
        avgCpl,
        conversionRate,
        avgEngagement,
        aiStatus,
        cMetrics,
        cGA4,
      };
    });

    const insights: any[] = [];
    const recommendations: any[] = [];

    for (const s of summaries) {
      if (s.cMetrics.length < 4) continue;

      const recent = s.cMetrics.slice(-3);
      const historical = s.cMetrics.slice(0, -3);

      // A. Anomaly detection — CTR
      const histCtrs = historical.map((m) => m.ctr * 100);
      const recentCtr = mean(recent.map((m) => m.ctr * 100));
      const histCtr = mean(histCtrs);
      const ctrStd = stdDev(histCtrs);

      if (histCtr > 0 && ctrStd > 0 && Math.abs(recentCtr - histCtr) > 2 * ctrStd) {
        const isDrop = recentCtr < histCtr;
        insights.push({
          campaign_id: s.campaign.id,
          insight_type: "anomaly",
          severity: isDrop ? "high" : "medium",
          title: `${isDrop ? "Drop" : "Spike"} in CTR detected`,
          description: `${s.campaign.name} CTR ${isDrop ? "fell" : "rose"} to ${recentCtr.toFixed(2)}% from a historical average of ${histCtr.toFixed(2)}%, exceeding 2 standard deviations.`,
          metric: "CTR",
          metric_value: Math.round(recentCtr * 100) / 100,
          expected_value: Math.round(histCtr * 100) / 100,
        });
      }

      // A. Anomaly detection — CPL
      const histCpls = historical.map((m) => m.cost_per_conversion_ksh);
      const recentCpl = mean(recent.map((m) => m.cost_per_conversion_ksh));
      const histCpl = mean(histCpls);
      const cplStd = stdDev(histCpls);

      if (histCpl > 0 && cplStd > 0 && recentCpl > histCpl + 2 * cplStd) {
        const pct = ((recentCpl - histCpl) / histCpl) * 100;
        insights.push({
          campaign_id: s.campaign.id,
          insight_type: "anomaly",
          severity: "critical",
          title: "Cost per lead anomaly",
          description: `${s.campaign.name} CPL increased by ${pct.toFixed(0)}% over the last 3 days (KSh ${Math.round(recentCpl).toLocaleString()} vs historical KSh ${Math.round(histCpl).toLocaleString()}).`,
          metric: "CPL",
          metric_value: Math.round(recentCpl * 100) / 100,
          expected_value: Math.round(histCpl * 100) / 100,
        });
      }

      // B. Performance prediction
      const recentConv = recent.reduce((a, m) => a + m.conversions, 0);
      const histConv = historical.reduce((a, m) => a + m.conversions, 0);
      const dailyAvg = histConv / Math.max(1, historical.length);
      const daysRemaining = 31 - new Date().getDate();
      const projected = recentConv + dailyAvg * daysRemaining;

      if (dailyAvg > 0) {
        insights.push({
          campaign_id: s.campaign.id,
          insight_type: "positive_trend",
          severity: "low",
          title: "End-of-month projection",
          description: `${s.campaign.name} is projected to reach ~${Math.round(projected)} conversions by month-end (currently ${s.totalConversions}), based on a daily average of ${dailyAvg.toFixed(1)}.`,
          metric: "Projected Conversions",
          metric_value: Math.round(projected * 100) / 100,
          expected_value: Math.round(dailyAvg * 31 * 100) / 100,
        });
      }

      // C. Campaign diagnosis
      const recentSessions = s.cGA4.slice(-3).reduce((a, g) => a + g.sessions, 0);
      const histSessions = s.cGA4.slice(0, -3).reduce((a, g) => a + g.sessions, 0);

      if (histSessions > 0 && recentSessions > histSessions * 1.1 && recentConv < histConv * 0.85) {
        const pct = Math.round((recentSessions / Math.max(1, histSessions) - 1) * 100);
        insights.push({
          campaign_id: s.campaign.id,
          insight_type: "diagnosis",
          severity: "high",
          title: "Traffic-conversion mismatch",
          description: `Traffic is increasing (${pct}% more sessions) but conversions have declined. This may indicate a mismatch between the campaign audience/message and the landing-page experience.`,
          metric: "Conversion Rate",
          metric_value: Math.round((recentConv / Math.max(1, recentSessions)) * 100 * 100) / 100,
          expected_value: Math.round((histConv / Math.max(1, histSessions)) * 100 * 100) / 100,
        });
        recommendations.push({
          campaign_id: s.campaign.id,
          priority: "high",
          title: `Investigate ${s.campaign.name} landing page`,
          action: `Review the landing page at ${s.campaign.name} and the call-to-action. Consider testing a shorter form and a more specific enterprise-focused message.`,
          rationale: "Traffic remains stable while conversions have declined, suggesting the landing page experience is not converting the incoming audience.",
        });
      }

      // D. Strong performer recommendation
      if (s.avgCpl > 0 && s.avgCpl < portfolioAvgCpl * 0.85) {
        const pctBelow = Math.round((1 - s.avgCpl / portfolioAvgCpl) * 100);
        recommendations.push({
          campaign_id: s.campaign.id,
          priority: "medium",
          title: `Increase ${s.campaign.name} promotion`,
          action: `Consider increasing budget allocation for ${s.campaign.name}. Conversion performance is consistently above the campaign portfolio average.`,
          rationale: `CPL is ${pctBelow}% below the portfolio average and conversions are trending upward.`,
        });
      }

      // D. Underperformer recommendation
      const portfolioAvgCvr = mean(summaries.map((x) => x.conversionRate));
      if (s.avgCpl > portfolioAvgCpl * 1.3 && s.conversionRate < portfolioAvgCvr * 0.7) {
        const cvrBelow = Math.round((s.conversionRate / Math.max(0.1, portfolioAvgCvr) - 1) * 100);
        const cplAbove = Math.round((s.avgCpl / Math.max(1, portfolioAvgCpl) - 1) * 100);
        recommendations.push({
          campaign_id: s.campaign.id,
          priority: "critical",
          title: `Review ${s.campaign.name} strategy`,
          action: `${s.campaign.name} has a ${s.conversionRate.toFixed(1)}% conversion rate (${cvrBelow}% below average) and CPL ${cplAbove}% above average. Consider pausing or restructuring the audience targeting and creative.`,
          rationale: "Consistently below-average performance across both conversion rate and cost efficiency.",
        });
      }
    }

    // LinkedIn opportunity
    const linkedinGA4 = allGA4.filter((g) => g.traffic_source === "LinkedIn");
    const metaGA4 = allGA4.filter((g) => g.traffic_source === "Meta");
    const linkedinEng = linkedinGA4.length > 0 ? mean(linkedinGA4.map((g) => g.engagement_rate * 100)) : 0;
    const metaEng = metaGA4.length > 0 ? mean(metaGA4.map((g) => g.engagement_rate * 100)) : 0;
    const linkedinSessions = linkedinGA4.reduce((s, g) => s + g.sessions, 0);
    const totalSessions = linkedinSessions + metaGA4.reduce((s, g) => s + g.sessions, 0);
    const linkedinShare = totalSessions > 0 ? (linkedinSessions / totalSessions) * 100 : 0;

    if (linkedinEng > metaEng * 1.15 && linkedinShare < 20) {
      const linkedinCamp = allCampaigns.find((c) => c.name === "LinkedIn Outreach");
      insights.push({
        campaign_id: linkedinCamp?.id ?? null,
        insight_type: "opportunity",
        severity: "medium",
        title: "LinkedIn engagement opportunity",
        description: `Visitors arriving from LinkedIn have ${linkedinEng.toFixed(1)}% engagement vs ${metaEng.toFixed(1)}% from Meta, but represent only ${linkedinShare.toFixed(0)}% of campaign traffic.`,
        metric: "Engagement Rate",
        metric_value: Math.round(linkedinEng * 100) / 100,
        expected_value: Math.round(metaEng * 100) / 100,
      });
      recommendations.push({
        campaign_id: linkedinCamp?.id ?? null,
        priority: "medium",
        title: "Develop LinkedIn campaign",
        action: "Increase LinkedIn campaign budget and audience reach. High engagement suggests potential for additional qualified traffic.",
        rationale: `LinkedIn traffic shows ${Math.round((linkedinEng / Math.max(0.1, metaEng) - 1) * 100)}% higher engagement than Meta but represents only ${linkedinShare.toFixed(0)}% of total traffic.`,
      });
    }

    // Sort recommendations by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Store results — clear old, insert new
    await sb.from("ai_insights").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await sb.from("ai_recommendations").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (insights.length > 0) {
      await sb.from("ai_insights").insert(insights);
    }
    if (recommendations.length > 0) {
      await sb.from("ai_recommendations").insert(recommendations);
    }

    // Update pipeline log
    if (logId) {
      await sb.from("ingestion_log").update({
        status: "success",
        rows_processed: insights.length + recommendations.length,
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        insights: insights.length,
        recommendations: recommendations.length,
        campaigns: allCampaigns.length,
        metrics: allMetrics.length,
        ga4Rows: allGA4.length,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    await sb.from("ingestion_log").insert({
      source: "full_pipeline",
      status: "failed",
      error_message: err.message,
      completed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
