export function formatKsh(value: number): string {
  if (value >= 1_000_000) {
    return `KSh ${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `KSh ${(value / 1_000).toFixed(0)}K`;
  }
  return `KSh ${value.toFixed(0)}`;
}

export function formatKshFull(value: number): string {
  return `KSh ${Math.round(value).toLocaleString('en-KE')}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-KE');
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatTrend(trend: number, suffix = '%'): string {
  const sign = trend >= 0 ? '+' : '';
  return `${sign}${trend.toFixed(1)}${suffix}`;
}
