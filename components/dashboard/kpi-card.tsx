'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon: React.ReactNode;
  accent?: 'blue' | 'green' | 'amber' | 'teal' | 'rose' | 'violet';
}

const accentStyles: Record<string, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-100 dark:ring-blue-900/40' },
  green: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-100 dark:ring-emerald-900/40' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-100 dark:ring-amber-900/40' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-100 dark:ring-teal-900/40' },
  rose: { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-100 dark:ring-rose-900/40' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-100 dark:ring-violet-900/40' },
};

export function KpiCard({ label, value, trend, trendLabel, icon, accent = 'blue' }: KpiCardProps) {
  const styles = accentStyles[accent];
  const isPositive = (trend ?? 0) >= 0;
  const isGoodTrend = trendLabel === 'lower' ? !isPositive : isPositive;

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg ring-1', styles.bg, styles.text, styles.ring)}>
            {icon}
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                isGoodTrend ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">{trendLabel ?? 'vs last period'}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
