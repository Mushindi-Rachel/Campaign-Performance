'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatKsh, formatPercent } from '@/lib/format';
import type { CampaignSummary } from '@/lib/types';
import type { GeneratedInsight, GeneratedRecommendation } from '@/lib/ai-engine';
import { CampaignDetailDialog } from '@/components/dashboard/campaign-detail-dialog';
import { ChevronRight } from 'lucide-react';

interface CampaignTableProps {
  summaries: CampaignSummary[];
  insights: GeneratedInsight[];
  recommendations: GeneratedRecommendation[];
}

const statusConfig = {
  strong: { label: 'Strong', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  monitor: { label: 'Monitor', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  review: { label: 'Review', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' },
} as const;

export function CampaignTable({ summaries, insights, recommendations }: CampaignTableProps) {
  const [selected, setSelected] = useState<CampaignSummary | null>(null);
  const sorted = [...summaries].sort((a, b) => b.totalConversions - a.totalConversions);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaign Performance</CardTitle>
          <CardDescription>Click any campaign to view detailed metrics, trends, and AI insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">Conv. Rate</TableHead>
                  <TableHead className="text-center">AI Status</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => {
                  const status = statusConfig[s.aiStatus];
                  return (
                    <TableRow
                      key={s.campaign.id}
                      onClick={() => setSelected(s)}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{s.campaign.name}</span>
                          <span className="text-xs text-muted-foreground">{s.campaign.platform} · {s.campaign.objective}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatKsh(s.totalSpend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(s.avgCtr, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{s.totalConversions}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKsh(s.avgCpl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(s.conversionRate)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn('font-medium', status.className)}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CampaignDetailDialog
        summary={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        insights={insights}
        recommendations={recommendations}
      />
    </>
  );
}
