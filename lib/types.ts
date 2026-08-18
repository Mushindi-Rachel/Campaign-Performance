export interface Campaign {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budget_ksh: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface CampaignDailyMetric {
  id: string;
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
  created_at: string;
}

export interface GA4DailyMetric {
  id: string;
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
  created_at: string;
}

export interface AiInsight {
  id: string;
  campaign_id: string | null;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  metric: string | null;
  metric_value: number | null;
  expected_value: number | null;
  created_at: string;
}

export interface AiRecommendation {
  id: string;
  campaign_id: string | null;
  priority: string;
  title: string;
  action: string;
  rationale: string;
  created_at: string;
}

export interface CampaignSummary {
  campaign: Campaign;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgCtr: number;
  avgCpc: number;
  avgCpl: number;
  conversionRate: number;
  totalSessions: number;
  avgEngagementRate: number;
  totalUsers: number;
  aiStatus: 'strong' | 'monitor' | 'review';
  dailyMetrics: Array<{
    date: string;
    spend: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpl: number;
    impressions: number;
    reach: number;
    cpc: number;
    cpm: number;
  }>;
  dailyGA4: Array<{
    date: string;
    sessions: number;
    engagedSessions: number;
    engagementRate: number;
    users: number;
    newUsers: number;
    pageviews: number;
    trafficSource: string;
    conversions: number;
  }>;
}

export interface DashboardKpis {
  totalSpend: number;
  totalLeads: number;
  conversionRate: number;
  avgCpl: number;
  engagementRate: number;
  highValueLeads: number;
  spendTrend: number;
  leadsTrend: number;
  conversionTrend: number;
  cplTrend: number;
  engagementTrend: number;
}
