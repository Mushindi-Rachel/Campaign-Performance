'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ListChecks } from 'lucide-react';
import type { GeneratedRecommendation } from '@/lib/ai-engine';

interface AiRecommendationsProps {
  recommendations: GeneratedRecommendation[];
}

const priorityConfig = {
  critical: { color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-900/50', badge: 'bg-rose-500' },
  high: { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-900/50', badge: 'bg-orange-500' },
  medium: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900/50', badge: 'bg-amber-500' },
  low: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900/50', badge: 'bg-emerald-500' },
} as const;

export function AiRecommendations({ recommendations }: AiRecommendationsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <ListChecks className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Recommended Actions</CardTitle>
            <CardDescription>AI-generated, prioritized by urgency</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No recommendations at this time.</p>
        )}
        {recommendations.map((rec, i) => {
          const config = priorityConfig[rec.priority];
          return (
            <div key={i} className={cn('rounded-lg border p-4', config.bg, config.border)}>
              <div className="flex items-start gap-3">
                <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', config.badge)}>
                  {i + 1}
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-semibold uppercase tracking-wide', config.color)}>
                      {rec.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">· {rec.campaignName}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug">{rec.title}</p>
                  <p className="text-sm text-foreground leading-relaxed">{rec.action}</p>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{rec.rationale}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
