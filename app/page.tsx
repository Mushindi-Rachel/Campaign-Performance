'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { CampaignTable } from '@/components/dashboard/campaign-table';
import { AiInsightsPanel } from '@/components/dashboard/ai-insights-panel';
import { AiRecommendations } from '@/components/dashboard/ai-recommendations';
import { AiAssistant } from '@/components/dashboard/ai-assistant';
import { PipelineStatus, type PipelineLogEntry } from '@/components/dashboard/pipeline-status';
import {
  DollarSign,
  Users,
  Target,
  TrendingDown,
  Activity,
  Award,
  RefreshCw,
  Radio,
  Zap,
} from 'lucide-react';
import {
  fetchCampaignData,
  buildCampaignSummaries,
  computeDashboardKpis,
  runAiAnalysis,
  type GeneratedInsight,
  type GeneratedRecommendation,
} from '@/lib/ai-engine';
import { formatKsh, formatNumber, formatPercent } from '@/lib/format';
import type { CampaignSummary, DashboardKpis } from '@/lib/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function Dashboard() {
  const [summaries, setSummaries] = useState<CampaignSummary[]>([]);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [insights, setInsights] = useState<GeneratedInsight[]>([]);
  const [recommendations, setRecommendations] = useState<GeneratedRecommendation[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [pipelineLog, setPipelineLog] = useState<PipelineLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  async function fetchPipelineStatus() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-analysis`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.pipelineLog) {
        setPipelineLog(data.pipelineLog);
      }
    } catch {
      // Pipeline status is non-critical — ignore errors
    }
  }

  async function runServerPipeline() {
    setRunningPipeline(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-data`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Pipeline failed (${res.status})`);
      }
      // After server pipeline completes, refresh data
      await loadData();
      await fetchPipelineStatus();
    } catch (e) {
      console.error('Pipeline error:', e);
    } finally {
      setRunningPipeline(false);
    }
  }

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const { campaigns, metrics, ga4 } = await fetchCampaignData();
      const s = buildCampaignSummaries(campaigns, metrics, ga4);
      const k = computeDashboardKpis(s);
      const analysis = runAiAnalysis(campaigns, metrics, ga4);

      setSummaries(s);
      setKpis(k);
      setInsights(analysis.insights);
      setRecommendations(analysis.recommendations);
      setGeneratedAt(analysis.generatedAt);
      setLastUpdated(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchPipelineStatus();
  }, [loadData]);

  if (loading || !kpis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading campaign intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-sm">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight">Campaign Intelligence</h1>
                <p className="text-xs text-muted-foreground">Pathways Marketing · Meta + GA4</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live · Last updated {lastUpdated} EAT
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={runServerPipeline}
                disabled={runningPipeline}
                className="gap-1.5"
              >
                <Zap className={`h-3.5 w-3.5 ${runningPipeline ? 'animate-pulse' : ''}`} />
                {runningPipeline ? 'Running Pipeline...' : 'Run Pipeline'}
              </Button>
              <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Pipeline Status */}
        {pipelineLog.length > 0 && <PipelineStatus log={pipelineLog} />}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Ad Spend"
            value={formatKsh(kpis.totalSpend)}
            trend={kpis.spendTrend}
            icon={<DollarSign className="h-5 w-5" />}
            accent="blue"
          />
          <KpiCard
            label="Leads"
            value={formatNumber(kpis.totalLeads)}
            trend={kpis.leadsTrend}
            icon={<Users className="h-5 w-5" />}
            accent="teal"
          />
          <KpiCard
            label="Conversion Rate"
            value={formatPercent(kpis.conversionRate)}
            trend={kpis.conversionTrend}
            icon={<Target className="h-5 w-5" />}
            accent="green"
          />
          <KpiCard
            label="CPL"
            value={formatKsh(kpis.avgCpl)}
            trend={kpis.cplTrend}
            trendLabel="lower is better"
            icon={<TrendingDown className="h-5 w-5" />}
            accent="amber"
          />
          <KpiCard
            label="Engagement"
            value={formatPercent(kpis.engagementRate)}
            trend={kpis.engagementTrend}
            icon={<Activity className="h-5 w-5" />}
            accent="violet"
          />
          <KpiCard
            label="High-Value Leads"
            value={formatNumber(kpis.highValueLeads)}
            trend={kpis.highValueLeadsTrend}
            icon={<Award className="h-5 w-5" />}
            accent="rose"
          />
        </div>

        {/* Performance Chart */}
        <PerformanceChart summaries={summaries} />

        {/* AI Insights + Recommendations side by side */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AiInsightsPanel insights={insights} generatedAt={generatedAt} />
          <AiRecommendations recommendations={recommendations} />
        </div>

        {/* Campaign Table */}
        <CampaignTable summaries={summaries} insights={insights} recommendations={recommendations} />

        {/* AI Assistant */}
        <AiAssistant
          summaries={summaries}
          insights={insights}
          recommendations={recommendations}
        />

        {/* Footer */}
        <footer className="border-t border-border/60 pt-6 pb-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>Campaign Performance Intelligence — Continuous data, analytics, AI, insight, recommendation.</p>
            <p>Next update in 30 minutes</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
