import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SportType } from '../../shared/activity-schema';
import { listActivities } from '../api';
import { ActivityListItem } from '../components/ActivityListItem';

export function ActivitiesPage() {
  const [sportType, setSportType] = useState<SportType | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['activities', sportType, from, to],
    queryFn: () => listActivities({
      sportType,
      from: from ? `${from}T00:00:00+08:00` : undefined,
      to: to ? `${to}T23:59:59+08:00` : undefined,
      limit: 100,
    }),
  });

  return (
    <div className="page-stack">
      <section className="filter-card">
        <div className="segmented-control">
          {([['all', '全部'], ['running', '跑步'], ['walking', '步行']] as const).map(([value, label]) => (
            <button key={value} className={sportType === value ? 'active' : ''} type="button" onClick={() => setSportType(value)}>{label}</button>
          ))}
        </div>
        <div className="date-range">
          <label>开始<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <span>—</span>
          <label>结束<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      </section>

      {query.isLoading && <div className="state-card">正在加载运动记录…</div>}
      {query.error && <div className="state-card error">{query.error.message}</div>}
      {query.data?.length === 0 && <div className="state-card"><strong>还没有记录</strong><p>上传一张运动截图开始吧。</p></div>}
      <section className="activity-list">
        {query.data?.map((activity) => <ActivityListItem key={activity.id} activity={activity} />)}
      </section>
    </div>
  );
}
