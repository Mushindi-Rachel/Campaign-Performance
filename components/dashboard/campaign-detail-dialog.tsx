'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, ComposedChart } from 'recharts';
import { cn } from '@/lib/utils';
import { formatKsh, formatKshFull, formatNumber, formatPercent } from '@/lib/format';
import type { CampaignSummary } from '@/lib/types';
import type { GeneratedInsight, GeneratedRecommendation } from '@/lib/ai-engine';
import { AlertTriangle, TrendingUp, Lightbulb, Stethoscope } from 'lucide-react';

interface CampaignDetailDialogProps {
  summary: CampaignSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insights: GeneratedInsight[];
  recommendations: GeneratedRecommendation[];
}

const statusConfig = {
  strong: { label: 'Strong', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  monitor: { label: 'Monitor', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  review: { label: 'Review', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' },
} as const;

const insightTypeIcons = {
  anomaly: AlertTriangle,
  positive_trend: TrendingUp,
  opportunity: Lightbulb,
  diagnosis: Stethoscope,
};

const severityStyles = {
  critical: 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400',
  high: 'border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400',
  medium: 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
  low: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
};

const priorityStyles = {
  critical: 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30',
  high: 'border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30',
  medium: 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30',
  low: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
};

const spendChartConfig: ChartConfig = {
  spend: { label: 'Spend (KSh)', color: 'hsl(var(--chart-1))' },
  conversions: { label: 'Conversions', color: 'hsl(var(--chart-2))' },
};

const ga4ChartConfig: ChartConfig = {
  sessions: { label: 'Sessions', color: 'hsl(var(--chart-3))' },
  engaged: { label: 'Engaged Sessions', color: 'hsl(var(--chart-4))' },
  engagementRate: { label: 'Engagement Rate %', color: 'hsl(var(--chart-5))' },
};

function MetricStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function CampaignDetailDialog({
  summary,
  open,
  onOpenChange,
  insights,
  recommendations,
}: CampaignDetailDialogProps) {
  if (!summary) return null;

  const status = statusConfig[summary.aiStatus];
  const campaignInsights = insights.filter((i) => i.campaignId === summary.campaign.id);
  const campaignRecs = recommendations.filter((r) => r.campaignId === summary.campaign.id);

  const dailyData = summary.dailyMetrics.map((m) => ({
    date: m.date.slice(5),
    spend: Math.round(m.spend),
    conversions: m.conversions,
    clicks: m.clicks,
    ctr: Number(m.ctr.toFixed(2)),
    cpl: Math.round(m.cpl),
    impressions: m.impressions,
    reach: m.reach,
  }));

  const ga4Data = summary.dailyGA4.map((g) => ({
    date: g.date.slice(5),
    sessions: g.sessions,
    engaged: g.engagedSessions,
    engagementRate: Number(g.engagementRate.toFixed(1)),
    users: g.users,
    newUsers: g.newUsers,
    pageviews: g.pageviews,
    conversions: g.conversions,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between pr-8">
            <div>
              <DialogTitle className="text-xl">{summary.campaign.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {summary.campaign.platform} · {summary.campaign.objective} · {summary.campaign.status}
              </DialogDescription>
            </div>
            <Badge variant="outline" className={cn('font-medium', status.className)}>
              {status.label}
            </Badge>
          </div>
        </DialogHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricStat label="Total Spend" value={formatKsh(summary.totalSpend)} />
          <MetricStat label="Leads" value={formatNumber(summary.totalConversions)} />
          <MetricStat label="Conversion Rate" value={formatPercent(summary.conversionRate)} />
          <MetricStat label="CPL" value={formatKsh(summary.avgCpl)} />
          <MetricStat label="Impressions" value={formatNumber(summary.totalImpressions)} />
          <MetricStat label="Clicks" value={formatNumber(summary.totalClicks)} />
          <MetricStat label="CTR" value={formatPercent(summary.avgCtr, 2)} />
          <MetricStat label="CPC" value={formatKsh(summary.avgCpc)} />
          <MetricStat label="Sessions" value={formatNumber(summary.totalSessions)} />
          <MetricStat label="Engagement" value={formatPercent(summary.avgEngagementRate)} />
          <MetricStat label="Users" value={formatNumber(summary.totalUsers)} />
          <MetricStat label="Budget" value={formatKsh(summary.campaign.budget_ksh)} />
        </div>

        <Tabs defaultValue="trends" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="meta">Meta Ads</TabsTrigger>
            <TabsTrigger value="ga4">GA4</TabsTrigger>
            <TabsTrigger value="ai">AI Insights</TabsTrigger>
          </TabsList>

          {/* Trends tab — combined spend + conversions chart */}
          <TabsContent value="trends" className="space-y-3">
            <Card>
              <CardContent className="pt-4">
                <h4 className="mb-2 text-sm font-semibold">Spend vs Conversions (Daily)</h4>
                <ChartContainer config={spendChartConfig} className="h-[220px] w-full">
                  <ComposedChart data={dailyData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis yAxisId="left" tickLine={false} axisLine={false} tickMargin={8} width={40} />
                    <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickMargin={8} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar yAxisId="left" dataKey="spend" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Spend (KSh)" />
                    <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="Conversions" />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Meta Ads tab — daily metrics table */}
          <TabsContent value="meta" className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">CPM</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium">{d.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKsh(d.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(d.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.clicks}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(d.ctr, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKshFull(d.spend / Math.max(1, d.clicks))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKshFull(d.spend / Math.max(1, d.impressions) * 1000)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{d.conversions}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.conversions > 0 ? formatKsh(d.cpl) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* GA4 tab — website engagement data */}
          <TabsContent value="ga4" className="space-y-3">
            <Card>
              <CardContent className="pt-4">
                <h4 className="mb-2 text-sm font-semibold">Sessions & Engagement (Daily)</h4>
                <ChartContainer config={ga4ChartConfig} className="h-[220px] w-full">
                  <ComposedChart data={ga4Data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis yAxisId="left" tickLine={false} axisLine={false} tickMargin={8} width={32} />
                    <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar yAxisId="left" dataKey="sessions" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Sessions" />
                    <Bar yAxisId="left" dataKey="engaged" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} name="Engaged Sessions" />
                    <Line yAxisId="right" type="monotone" dataKey="engagementRate" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={{ r: 3 }} name="Engagement Rate %" />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Engaged</TableHead>
                    <TableHead className="text-right">Eng. Rate</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">New Users</TableHead>
                    <TableHead className="text-right">Pageviews</TableHead>
                    <TableHead className="text-right">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ga4Data.map((g) => (
                    <TableRow key={g.date}>
                      <TableCell className="font-medium">{g.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.sessions}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.engaged}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(g.engagementRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.users}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.newUsers}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.pageviews}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{summary.dailyGA4.find((d) => d.date.slice(5) === g.date)?.trafficSource ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* AI Insights tab — campaign-specific insights and recommendations */}
          <TabsContent value="ai" className="space-y-3">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Insights ({campaignInsights.length})</h4>
              {campaignInsights.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border/60 rounded-lg">
                  No insights detected for this campaign. Performance is within normal ranges.
                </p>
              )}
              {campaignInsights.map((insight, i) => {
                const Icon = insightTypeIcons[insight.insightType] ?? TrendingUp;
                const sevStyle = severityStyles[insight.severity as keyof typeof severityStyles] ?? severityStyles.low;
                return (
                  <div key={i} className={cn('rounded-lg border p-3', sevStyle)}>
                    <div className="flex items-start gap-2.5">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold">Recommendations ({campaignRecs.length})</h4>
              {campaignRecs.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border/60 rounded-lg">
                  No recommendations for this campaign at this time.
                </p>
              )}
              {campaignRecs.map((rec, i) => {
                const prStyle = priorityStyles[rec.priority as keyof typeof priorityStyles] ?? priorityStyles.medium;
                return (
                  <div key={i} className={cn('rounded-lg border p-3', prStyle)}>
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/80 text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide">{rec.priority}</span>
                        <p className="text-sm font-medium">{rec.title}</p>
                        <p className="text-sm text-foreground leading-relaxed">{rec.action}</p>
                        <p className="text-xs text-muted-foreground italic">{rec.rationale}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
