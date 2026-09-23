import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { SportType } from '../../shared/activity-schema';
import { formatDuration, formatPace } from '../../shared/units';
import { getSummary, getTrends } from '../api';
import { MetricCard } from '../components/MetricCard';
import { TrendChart } from '../components/TrendChart';

const metrics = {
  distance: { label: '距离', format: (value: number) => `${(value / 1000).toFixed(1)} km` },
  duration: { label: '时长', format: (value: number) => formatDuration(value) },
  pace: { label: '平均配速', format: (value: number) => `${formatPace(value)} /km` },
  heartRate: { label: '平均心率', format: (value: number) => `${Math.round(value)} bpm` },
  steps: { label: '步数', format: (value: number) => `${Math.round(value)} 步` },
  calories: { label: '热量', format: (value: number) => `${Math.round(value)} kcal` },
} as const;

type Range = '7d' | '30d' | '90d' | 'all';

function rangeStart(range: Range): string | undefined {
  if (range === 'all') return undefined;
  const days = Number(range.slice(0, -1));
  const date = new Date(Date.now() - (days - 1) * 86400_000 + 8 * 3600_000);
  return `${date.toISOString().slice(0, 10)}T00:00:00+08:00`;
}

export function TrendsPage() {
  const [range, setRange] = useState<Range>('30d');
  const [sportType, setSportType] = useState<SportType | 'all'>('all');
  const [metric, setMetric] = useState<keyof typeof metrics>('distance');
  const from = rangeStart(range);
  const bucket = range === 'all' ? 'month' : range === '90d' ? 'week' : 'day';
  const summary = useQuery({ queryKey: ['summary', range, sportType], queryFn: () => getSummary({ from, sportType }) });
  const trend = useQuery({ queryKey: ['trends', range, sportType, metric], queryFn: () => getTrends({ from, sportType, metric, bucket }) });
  const formatter = useMemo(() => metrics[metric].format, [metric]);

  return (
    <div className="page-stack">
      <section className="filter-card">
        <div className="segmented-control">
          {([['7d', '7天'], ['30d', '30天'], ['90d', '90天'], ['all', '全部']] as const).map(([value, label]) => (
            <button key={value} className={range === value ? 'active' : ''} type="button" onClick={() => setRange(value)}>{label}</button>
          ))}
        </div>
        <div className="segmented-control compact">
          {([['all', '全部'], ['running', '跑步'], ['walking', '步行']] as const).map(([value, label]) => (
            <button key={value} className={sportType === value ? 'active' : ''} type="button" onClick={() => setSportType(value)}>{label}</button>
          ))}
        </div>
      </section>

      <section className="metric-grid two-column">
        <MetricCard label="运动次数" value={`${summary.data?.count ?? 0} 次`} />
        <MetricCard label="总距离" value={`${((summary.data?.totalDistanceMeters ?? 0) / 1000).toFixed(2)} km`} tone="orange" />
        <MetricCard label="总时长" value={formatDuration(summary.data?.totalDurationSeconds ?? 0)} tone="blue" />
        <MetricCard label="总步数" value={`${(summary.data?.totalSteps ?? 0).toLocaleString('zh-CN')}`} />
      </section>

      <section className="chart-card">
        <div className="section-heading">
          <div><p className="eyebrow">变化曲线</p><h2>{metrics[metric].label}</h2></div>
          <select value={metric} onChange={(event) => setMetric(event.target.value as keyof typeof metrics)} aria-label="趋势指标">
            {Object.entries(metrics).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
          </select>
        </div>
        {metric === 'pace' && <p className="section-hint">配速数值越低表示速度越快。</p>}
        {trend.isLoading && <div className="chart-loading">正在计算趋势…</div>}
        {trend.data?.length === 0 && <div className="chart-loading">当前范围还没有数据</div>}
        {trend.data && trend.data.length > 0 && <TrendChart points={trend.data} formatValue={formatter} />}
      </section>
    </div>
  );
}
