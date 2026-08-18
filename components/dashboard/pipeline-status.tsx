'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, Database } from 'lucide-react';

export interface PipelineLogEntry {
  id: string;
  source: string;
  status: string;
  rows_processed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface PipelineStatusProps {
  log: PipelineLogEntry[];
}

const sourceLabels: Record<string, string> = {
  meta: 'Meta Ads',
  ga4: 'GA4',
  ai_analysis: 'AI Analysis',
  full_pipeline: 'Full Pipeline',
};

const statusConfig = {
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', label: 'Running', animate: true },
  success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', label: 'Success', animate: false },
  failed: { icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30', label: 'Failed', animate: false },
} as const;

export function PipelineStatus({ log }: PipelineStatusProps) {
  if (!log.length) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Data Pipeline Status</h3>
        </div>
        <div className="space-y-2">
          {log.slice(0, 5).map((entry) => {
            const config = statusConfig[entry.status as keyof typeof statusConfig] ?? statusConfig.running;
            const Icon = config.icon;
            return (
              <div key={entry.id} className={cn('flex items-center justify-between rounded-md px-3 py-2 text-sm', config.bg)}>
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', config.color, config.animate && 'animate-spin')} />
                  <span className="font-medium">{sourceLabels[entry.source] ?? entry.source}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {entry.rows_processed > 0 && <span>{entry.rows_processed} rows</span>}
                  <span>{new Date(entry.started_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <Badge variant="outline" className={cn('text-xs', config.color)}>
                    {config.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
