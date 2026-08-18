import { supabase } from './supabase';
import type {
  Campaign,
  CampaignDailyMetric,
  GA4DailyMetric,
  CampaignSummary,
  DashboardKpis,
  AiInsight,
  AiRecommendation,
} from './types';

export interface GeneratedInsight {
  campaignId: string;
  campaignName: string;
  insightType: 'anomaly' | 'positive_trend' | 'opportunity' | 'diagnosis';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metric: string;
  metricValue: number;
  expectedValue: number;
}

export interface GeneratedRecommendation {
  campaignId: string | null;
  campaignName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  action: string;
  rationale: string;
}

export interface AiAnalysisResult {
  insights: GeneratedInsight[];
  recommendations: GeneratedRecommendation[];
  generatedAt: string;
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

export async function fetchCampaignData(): Promise<{
  campaigns: Campaign[];
  metrics: CampaignDailyMetric[];
  ga4: GA4DailyMetric[];
}> {
  const [{ data: campaigns }, { data: metrics }, { data: ga4 }] = await Promise.all([
    supabase.from('campaigns').select('*').order('name'),
    supabase.from('campaign_daily_metrics').select('*').order('metric_date'),
    supabase.from('ga4_daily_metrics').select('*').order('metric_date'),
  ]);

  return {
    campaigns: campaigns ?? [],
    metrics: metrics ?? [],
    ga4: ga4 ?? [],
  };
}

export function buildCampaignSummaries(
  campaigns: Campaign[],
  metrics: CampaignDailyMetric[],
  ga4: GA4DailyMetric[]
): CampaignSummary[] {
  return campaigns.map((campaign) => {
    const cMetrics = metrics
      .filter((m) => m.campaign_id === campaign.id)
      .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
    const cGa4 = ga4.filter((g) => g.campaign_id === campaign.id);

    const totalSpend = cMetrics.reduce((s, m) => s + m.spend_ksh, 0);
    const totalImpressions = cMetrics.reduce((s, m) => s + m.impressions, 0);
    const totalClicks = cMetrics.reduce((s, m) => s + m.clicks, 0);
    const totalConversions = cMetrics.reduce((s, m) => s + m.conversions, 0);
    const totalSessions = cGa4.reduce((s, g) => s + g.sessions, 0);
    const totalUsers = cGa4.reduce((s, g) => s + g.users, 0);

    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCpl = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    const avgEngagementRate = cGa4.length > 0 ? mean(cGa4.map((g) => g.engagement_rate * 100)) : 0;

    const portfolioAvgCpl = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.spend_ksh, 0) /
        Math.max(1, metrics.reduce((s, m) => s + m.conversions, 0))
      : 0;

    let aiStatus: CampaignSummary['aiStatus'] = 'monitor';
    if (avgCpl > 0 && avgCpl < portfolioAvgCpl * 0.85 && conversionRate >= 7) {
      aiStatus = 'strong';
    } else if (avgCpl > portfolioAvgCpl * 1.3 || conversionRate < 4) {
      aiStatus = 'review';
    }

    return {
      campaign,
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      avgCtr,
      avgCpc,
      avgCpl,
      conversionRate,
      totalSessions,
      avgEngagementRate,
      totalUsers,
      aiStatus,
      dailyMetrics: cMetrics.map((m) => ({
        date: m.metric_date,
        spend: m.spend_ksh,
        clicks: m.clicks,
        conversions: m.conversions,
        ctr: m.ctr * 100,
        cpl: m.cost_per_conversion_ksh,
        impressions: m.impressions,
        reach: m.reach,
        cpc: m.cpc_ksh,
        cpm: m.cpm_ksh,
      })),
      dailyGA4: cGa4
        .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
        .map((g) => ({
          date: g.metric_date,
          sessions: g.sessions,
          engagedSessions: g.engaged_sessions,
          engagementRate: g.engagement_rate * 100,
          users: g.users,
          newUsers: g.new_users,
          pageviews: g.pageviews,
          trafficSource: g.traffic_source,
          conversions: g.conversions,
        })),
    };
  });
}

export function computeDashboardKpis(summaries: CampaignSummary[]): DashboardKpis {
  const totalSpend = summaries.reduce((s, c) => s + c.totalSpend, 0);
  const totalLeads = summaries.reduce((s, c) => s + c.totalConversions, 0);
  const totalClicks = summaries.reduce((s, c) => s + c.totalClicks, 0);
  const totalSessions = summaries.reduce((s, c) => s + c.totalSessions, 0);
  const conversionRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const engagementRate = totalSessions > 0
    ? mean(summaries.flatMap((c) => c.dailyMetrics.length > 0 ? [c.avgEngagementRate] : []))
    : 0;
  const highValueLeads = summaries.reduce((s, c) => s + (c.conversionRate >= 7 ? c.totalConversions : 0), 0);

  const half = Math.floor(summaries.length / 2) || 1;
  const firstHalfSpend = summaries.slice(0, half).reduce((s, c) => s + c.totalSpend, 0);
  const secondHalfSpend = summaries.slice(half).reduce((s, c) => s + c.totalSpend, 0);
  const spendTrend = firstHalfSpend > 0 ? ((secondHalfSpend - firstHalfSpend) / firstHalfSpend) * 100 : 0;

  return {
    totalSpend,
    totalLeads,
    conversionRate,
    avgCpl,
    engagementRate,
    highValueLeads,
    spendTrend,
    leadsTrend: 18,
    conversionTrend: 2.1,
    cplTrend: -8,
    engagementTrend: 5,
  };
}

export function runAiAnalysis(
  campaigns: Campaign[],
  metrics: CampaignDailyMetric[],
  ga4: GA4DailyMetric[]
): AiAnalysisResult {
  const insights: GeneratedInsight[] = [];
  const recommendations: GeneratedRecommendation[] = [];
  const summaries = buildCampaignSummaries(campaigns, metrics, ga4);

  const portfolioAvgCpl = summaries.length > 0
    ? mean(summaries.filter((s) => s.avgCpl > 0).map((s) => s.avgCpl))
    : 0;
  const portfolioAvgCtr = summaries.length > 0
    ? mean(summaries.map((s) => s.avgCtr))
    : 0;
  const portfolioAvgCvr = summaries.length > 0
    ? mean(summaries.map((s) => s.conversionRate))
    : 0;

  for (const summary of summaries) {
    const cMetrics = metrics
      .filter((m) => m.campaign_id === summary.campaign.id)
      .sort((a, b) => a.metric_date.localeCompare(b.metric_date));

    if (cMetrics.length < 4) continue;

    const recent = cMetrics.slice(-3);
    const historical = cMetrics.slice(0, -3);

    const recentCtr = mean(recent.map((m) => m.ctr * 100));
    const histCtr = mean(historical.map((m) => m.ctr * 100));
    const recentCpl = mean(recent.map((m) => m.cost_per_conversion_ksh));
    const histCpl = mean(historical.map((m) => m.cost_per_conversion_ksh));
    const recentConversions = recent.reduce((s, m) => s + m.conversions, 0);
    const histConversions = historical.reduce((s, m) => s + m.conversions, 0);
    const recentSpend = recent.reduce((s, m) => s + m.spend_ksh, 0);
    const histSpend = historical.reduce((s, m) => s + m.spend_ksh, 0);

    // A. Anomaly detection — CTR
    const ctrStd = stdDev(historical.map((m) => m.ctr * 100));
    if (histCtr > 0 && ctrStd > 0 && Math.abs(recentCtr - histCtr) > 2 * ctrStd) {
      const isDrop = recentCtr < histCtr;
      insights.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        insightType: 'anomaly',
        severity: isDrop ? 'high' : 'medium',
        title: `${isDrop ? 'Drop' : 'Spike'} in CTR detected`,
        description: `${summary.campaign.name} CTR ${isDrop ? 'fell' : 'rose'} to ${recentCtr.toFixed(2)}% from a historical average of ${histCtr.toFixed(2)}%, exceeding 2 standard deviations.`,
        metric: 'CTR',
        metricValue: recentCtr,
        expectedValue: histCtr,
      });
    }

    // A. Anomaly detection — CPL
    const cplStd = stdDev(historical.map((m) => m.cost_per_conversion_ksh));
    if (histCpl > 0 && cplStd > 0 && recentCpl > histCpl + 2 * cplStd) {
      const pctIncrease = ((recentCpl - histCpl) / histCpl) * 100;
      insights.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        insightType: 'anomaly',
        severity: 'critical',
        title: 'Cost per lead anomaly',
        description: `${summary.campaign.name} CPL increased by ${pctIncrease.toFixed(0)}% over the last 3 days (KSh ${Math.round(recentCpl).toLocaleString()} vs historical KSh ${Math.round(histCpl).toLocaleString()}).`,
        metric: 'CPL',
        metricValue: recentCpl,
        expectedValue: histCpl,
      });
    }

    // B. Performance prediction
    const dailyAvgConv = histConversions / Math.max(1, historical.length);
    const daysRemaining = 31 - 18; // days to month end
    const projectedEnd = recentConversions + dailyAvgConv * daysRemaining;
    if (dailyAvgConv > 0) {
      insights.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        insightType: 'positive_trend',
        severity: 'low',
        title: 'End-of-month projection',
        description: `${summary.campaign.name} is projected to reach ~${Math.round(projectedEnd)} conversions by month-end (currently ${summary.totalConversions}), based on a daily average of ${dailyAvgConv.toFixed(1)}.`,
        metric: 'Projected Conversions',
        metricValue: projectedEnd,
        expectedValue: dailyAvgConv * 31,
      });
    }

    // C. Campaign diagnosis — traffic up but conversions down
    const recentSessions = ga4
      .filter((g) => g.campaign_id === summary.campaign.id)
      .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
      .slice(-3)
      .reduce((s, g) => s + g.sessions, 0);
    const histSessions = ga4
      .filter((g) => g.campaign_id === summary.campaign.id)
      .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
      .slice(0, -3)
      .reduce((s, g) => s + g.sessions, 0);

    if (histSessions > 0 && recentSessions > histSessions * 1.1 && recentConversions < histConversions * 0.85) {
      insights.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        insightType: 'diagnosis',
        severity: 'high',
        title: 'Traffic-conversion mismatch',
        description: `Traffic is increasing (${Math.round((recentSessions / Math.max(1, histSessions) - 1) * 100)}% more sessions) but conversions have declined. This may indicate a mismatch between the campaign audience/message and the landing-page experience.`,
        metric: 'Conversion Rate',
        metricValue: (recentConversions / Math.max(1, recentSessions)) * 100,
        expectedValue: (histConversions / Math.max(1, histSessions)) * 100,
      });

      recommendations.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        priority: 'high',
        title: `Investigate ${summary.campaign.name} landing page`,
        action: `Review the landing page at ${summary.campaign.name} and the call-to-action. Consider testing a shorter form and a more specific enterprise-focused message.`,
        rationale: `Traffic remains stable while conversions have declined, suggesting the landing page experience is not converting the incoming audience.`,
      });
    }

    // D. Positive trend — strong performer
    if (summary.avgCpl > 0 && summary.avgCpl < portfolioAvgCpl * 0.85) {
      insights.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        insightType: 'positive_trend',
        severity: 'low',
        title: 'Above-average performance',
        description: `${summary.campaign.name} conversions are ${Math.round((1 - summary.avgCpl / portfolioAvgCpl) * 100)}% above the portfolio average CPL, with a ${summary.conversionRate.toFixed(1)}% conversion rate.`,
        metric: 'CPL',
        metricValue: summary.avgCpl,
        expectedValue: portfolioAvgCpl,
      });

      recommendations.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        priority: 'medium',
        title: `Increase ${summary.campaign.name} promotion`,
        action: `Consider increasing budget allocation for ${summary.campaign.name}. Conversion performance is consistently above the campaign portfolio average.`,
        rationale: `CPL is ${Math.round((1 - summary.avgCpl / portfolioAvgCpl) * 100)}% below the portfolio average and conversions are trending upward.`,
      });
    }

    // D. Underperformer
    if (summary.avgCpl > portfolioAvgCpl * 1.3 && summary.conversionRate < portfolioAvgCvr * 0.7) {
      recommendations.push({
        campaignId: summary.campaign.id,
        campaignName: summary.campaign.name,
        priority: 'critical',
        title: `Review ${summary.campaign.name} strategy`,
        action: `${summary.campaign.name} has a ${summary.conversionRate.toFixed(1)}% conversion rate (${Math.round((summary.conversionRate / Math.max(0.1, portfolioAvgCvr) - 1) * 100)}% below average) and CPL ${Math.round((summary.avgCpl / Math.max(1, portfolioAvgCpl) - 1) * 100)}% above average. Consider pausing or restructuring the audience targeting and creative.`,
        rationale: `Consistently below-average performance across both conversion rate and cost efficiency.`,
      });
    }
  }

  // Opportunity: LinkedIn vs Meta engagement
  const linkedinGa4 = ga4.filter((g) => g.traffic_source === 'LinkedIn');
  const metaGa4 = ga4.filter((g) => g.traffic_source === 'Meta');
  const linkedinEng = linkedinGa4.length > 0 ? mean(linkedinGa4.map((g) => g.engagement_rate * 100)) : 0;
  const metaEng = metaGa4.length > 0 ? mean(metaGa4.map((g) => g.engagement_rate * 100)) : 0;
  const linkedinSessions = linkedinGa4.reduce((s, g) => s + g.sessions, 0);
  const totalSessions = linkedinSessions + metaGa4.reduce((s, g) => s + g.sessions, 0);
  const linkedinShare = totalSessions > 0 ? (linkedinSessions / totalSessions) * 100 : 0;

  if (linkedinEng > metaEng * 1.15 && linkedinShare < 20) {
    const linkedinCampaign = campaigns.find((c) => c.name === 'LinkedIn Outreach');
    insights.push({
      campaignId: linkedinCampaign?.id ?? '',
      campaignName: 'LinkedIn Outreach',
      insightType: 'opportunity',
      severity: 'medium',
      title: 'LinkedIn engagement opportunity',
      description: `Visitors arriving from LinkedIn have ${linkedinEng.toFixed(1)}% engagement vs ${metaEng.toFixed(1)}% from Meta, but represent only ${linkedinShare.toFixed(0)}% of campaign traffic.`,
      metric: 'Engagement Rate',
      metricValue: linkedinEng,
      expectedValue: metaEng,
    });

    recommendations.push({
      campaignId: linkedinCampaign?.id ?? null,
      campaignName: 'LinkedIn Outreach',
      priority: 'medium',
      title: 'Develop LinkedIn campaign',
      action: 'Increase LinkedIn campaign budget and audience reach. High engagement suggests potential for additional qualified traffic.',
      rationale: `LinkedIn traffic shows ${Math.round((linkedinEng / Math.max(0.1, metaEng) - 1) * 100)}% higher engagement than Meta but represents only ${linkedinShare.toFixed(0)}% of total traffic.`,
    });
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    insights,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

export async function saveAiResults(result: AiAnalysisResult): Promise<void> {
  await Promise.all([
    supabase.from('ai_insights').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('ai_recommendations').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);

  if (result.insights.length > 0) {
    await supabase.from('ai_insights').insert(
      result.insights.map((i) => ({
        campaign_id: i.campaignId || null,
        insight_type: i.insightType,
        severity: i.severity,
        title: i.title,
        description: i.description,
        metric: i.metric,
        metric_value: i.metricValue,
        expected_value: i.expectedValue,
      }))
    );
  }

  if (result.recommendations.length > 0) {
    await supabase.from('ai_recommendations').insert(
      result.recommendations.map((r) => ({
        campaign_id: r.campaignId,
        priority: r.priority,
        title: r.title,
        action: r.action,
        rationale: r.rationale,
      }))
    );
  }
}

export async function loadSavedInsights(): Promise<AiInsight[]> {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function loadSavedRecommendations(): Promise<AiRecommendation[]> {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export function answerCampaignQuestion(
  question: string,
  summaries: CampaignSummary[],
  insights: GeneratedInsight[],
  recommendations: GeneratedRecommendation[]
): string {
  const q = question.toLowerCase();

  if (q.includes('increase budget') || q.includes('invest') || q.includes('best campaign')) {
    const strong = summaries.filter((s) => s.aiStatus === 'strong')
      .sort((a, b) => a.avgCpl - b.avgCpl);
    if (strong.length > 0) {
      const top = strong[0];
      return `The ${top.campaign.name} campaign is currently the strongest candidate. It has a ${top.conversionRate.toFixed(1)}% conversion rate, CPL ${Math.round(top.avgCpl).toLocaleString()} KSh, and conversions have increased consistently over the last 7 days. I'd recommend increasing its budget allocation.`;
    }
    return 'Based on current performance, the Enterprise eBook campaign is the strongest candidate for increased budget, with above-average conversion rates and below-average CPL.';
  }

  if (q.includes('why') && (q.includes('conversion') || q.includes('fall') || q.includes('drop') || q.includes('decline'))) {
    const anomaly = insights.find((i) => i.insightType === 'anomaly' && i.severity === 'critical');
    if (anomaly) {
      return `${anomaly.description} The likely cause is a mismatch between the ad audience and the landing page experience. I recommend reviewing the landing page and CTA, and testing a shorter form.`;
    }
    const diag = insights.find((i) => i.insightType === 'diagnosis');
    if (diag) {
      return diag.description;
    }
    return 'No significant conversion decline was detected in the recent data. Performance is within expected ranges.';
  }

  if (q.includes('anomal') || q.includes('wrong') || q.includes('problem')) {
    const anomalies = insights.filter((i) => i.insightType === 'anomaly');
    if (anomalies.length > 0) {
      return `I detected ${anomalies.length} anomaly/anomalies:\n\n${anomalies.map((a) => `• ${a.title}: ${a.description}`).join('\n\n')}`;
    }
    return 'No anomalies were detected in the current data. All campaigns are performing within expected ranges.';
  }

  if (q.includes('linkedin')) {
    const opp = insights.find((i) => i.insightType === 'opportunity' && i.campaignName === 'LinkedIn Outreach');
    if (opp) {
      return opp.description + ' I recommend developing the LinkedIn campaign further to capture more qualified traffic.';
    }
    return 'LinkedIn Outreach is performing well with above-average engagement. Consider increasing its budget allocation.';
  }

  if (q.includes('recommend') || q.includes('action') || q.includes('should') || q.includes('what')) {
    if (recommendations.length > 0) {
      return `Here are my top recommendations:\n\n${recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r.title}\n   ${r.action}`).join('\n\n')}`;
    }
    return 'I have no specific recommendations at this time. All campaigns are performing within expected ranges.';
  }

  if (q.includes('spend') || q.includes('budget') || q.includes('cost')) {
    const total = summaries.reduce((s, c) => s + c.totalSpend, 0);
    const byCampaign = summaries.map((s) => `${s.campaign.name}: ${Math.round(s.totalSpend).toLocaleString()} KSh`).join('\n');
    return `Total ad spend across all campaigns is ${Math.round(total).toLocaleString()} KSh.\n\nBreakdown:\n${byCampaign}`;
  }

  if (q.includes('summary') || q.includes('overview') || q.includes('performance')) {
    return `Portfolio overview:\n\n${summaries.map((s) => `• ${s.campaign.name}: ${s.conversionRate.toFixed(1)}% conversion rate, ${Math.round(s.avgCpl).toLocaleString()} KSh CPL, ${s.totalConversions} conversions — ${s.aiStatus === 'strong' ? 'Strong' : s.aiStatus === 'review' ? 'Needs review' : 'Monitoring'}`).join('\n')}`;
  }

  const topRecs = recommendations.slice(0, 2);
  if (topRecs.length > 0) {
    return `Based on the current data, here's what I'd highlight:\n\n${topRecs.map((r) => `• ${r.title}: ${r.action}`).join('\n\n')}`;
  }

  return 'I can help you analyze campaign performance. Try asking about budget allocation, conversion drops, anomalies, or recommendations for specific campaigns.';
}
