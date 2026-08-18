'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, TrendingUp, Lightbulb, Stethoscope, Sparkles } from 'lucide-react';
import type { GeneratedInsight } from '@/lib/ai-engine';

interface AiInsightsPanelProps {
  insights: GeneratedInsight[];
  generatedAt: string;
}

const severityConfig = {
  critical: { color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-900/50', dot: 'bg-rose-500', label: 'Critical' },
  high: { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-900/50', dot: 'bg-orange-500', label: 'High' },
  medium: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900/50', dot: 'bg-amber-500', label: 'Medium' },
  low: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900/50', dot: 'bg-emerald-500', label: 'Low' },
} as const;

const typeIcons = {
  anomaly: AlertTriangle,
  positive_trend: TrendingUp,
  opportunity: Lightbulb,
  diagnosis: Stethoscope,
};

export function AiInsightsPanel({ insights, generatedAt }: AiInsightsPanelProps) {
  const sorted = [...insights].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Campaign Intelligence</CardTitle>
              <CardDescription>{insights.length} insights detected</CardDescription>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            Updated {new Date(generatedAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })} EAT
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No insights detected. All campaigns performing within normal ranges.</p>
        )}
        {sorted.map((insight, i) => {
          const config = severityConfig[insight.severity];
          const Icon = typeIcons[insight.insightType];
          return (
            <div
              key={i}
              className={cn('rounded-lg border p-4 transition-all hover:shadow-sm', config.bg, config.border)}
            >
              <div className="flex items-start gap-3">
                <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/80', config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', config.dot)} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wide', config.color)}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">· {insight.campaignName}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug">{insight.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
