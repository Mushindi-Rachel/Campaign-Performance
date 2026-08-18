'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { CampaignSummary } from '@/lib/types';

const chartConfig: ChartConfig = {
  conversions: { label: 'Conversions', color: 'hsl(var(--chart-1))' },
  spend: { label: 'Spend (KSh)', color: 'hsl(var(--chart-2))' },
};

interface PerformanceChartProps {
  summaries: CampaignSummary[];
}

export function PerformanceChart({ summaries }: PerformanceChartProps) {
  const dates = summaries[0]?.dailyMetrics.map((m) => m.date) ?? [];

  const data = dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const s of summaries) {
      const m = s.dailyMetrics.find((d) => d.date === date);
      if (m) {
        row[s.campaign.name] = m.conversions;
      }
    }
    return row;
  });

  const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Campaign Performance Trend</CardTitle>
        <CardDescription>Daily conversions across all campaigns (Aug 5 – Aug 18)</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              {summaries.map((s, i) => (
                <linearGradient key={s.campaign.id} id={`grad-${s.campaign.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {summaries.map((s, i) => (
              <Area
                key={s.campaign.id}
                type="monotone"
                dataKey={s.campaign.name}
                stroke={colors[i % colors.length]}
                fill={`url(#grad-${s.campaign.id})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
