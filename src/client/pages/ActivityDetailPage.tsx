import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteActivity, getActivity, updateActivity } from '../api';
import { ActivityForm } from '../components/ActivityForm';
import { activityToForm } from '../form';
import { updateActivitySchema } from '../../shared/activity-schema';
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../../shared/units';

export function ActivityDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['activity', id], queryFn: () => getActivity(id), enabled: Boolean(id) });
  const update = useMutation({
    mutationFn: (data: Parameters<typeof updateActivity>[1]) => updateActivity(id, data),
    onSuccess: async (data) => {
      queryClient.setQueryData(['activity', id], data);
      await queryClient.invalidateQueries({ queryKey: ['activities'] });
      await queryClient.invalidateQueries({ queryKey: ['summary'] });
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteActivity(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] });
      await queryClient.invalidateQueries({ queryKey: ['summary'] });
      navigate('/activities', { replace: true });
    },
  });

  if (query.isLoading) return <div className="state-card">正在加载详情…</div>;
  if (query.error || !query.data) return <div className="state-card error">{query.error?.message ?? '找不到记录'}</div>;
  const activity = query.data;

  if (editing) {
    return (
      <div className="page-stack">
        <ActivityForm
          key={activity.updatedAt}
          initialValues={activityToForm(activity)}
          importId={activity.importId}
          submitLabel="保存修改"
          busy={update.isPending}
          onSubmit={async (data) => { await update.mutateAsync(updateActivitySchema.parse(data)); }}
        />
        <button className="secondary-button" type="button" onClick={() => setEditing(false)}>取消</button>
      </div>
    );
  }

  const metrics = [
    ['运动时长', formatDuration(activity.durationSeconds)],
    ['平均配速', `${formatPace(activity.avgPaceSecondsPerKm)} /km`],
    ['平均速度', activity.avgSpeedKmh == null ? '—' : `${activity.avgSpeedKmh} km/h`],
    ['总热量', activity.caloriesKcal == null ? '—' : `${activity.caloriesKcal} kcal`],
    ['平均步频', activity.avgCadenceSpm == null ? '—' : `${activity.avgCadenceSpm} 步/分`],
    ['平均步幅', activity.avgStrideCm == null ? '—' : `${activity.avgStrideCm} cm`],
    ['步数', activity.steps == null ? '—' : `${activity.steps.toLocaleString('zh-CN')} 步`],
    ['平均心率', activity.avgHeartRateBpm == null ? '—' : `${activity.avgHeartRateBpm} 次/分`],
    ['累计爬升', activity.elevationGainMeters == null ? '—' : `${activity.elevationGainMeters} m`],
    ['累计下降', activity.elevationLossMeters == null ? '—' : `${activity.elevationLossMeters} m`],
  ];

  return (
    <div className="page-stack">
      <section className={`detail-hero ${activity.sportType}`}>
        <span>{activity.sportType === 'running' ? '户外跑步' : '户外步行'}</span>
        <strong>{formatDistance(activity.distanceMeters)}</strong>
        <time>{formatDateTime(activity.startedAt)}</time>
      </section>
      <section className="detail-metrics">
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      {activity.validationWarnings.length > 0 && (
        <aside className="warning-box">
          <strong>数据提示</strong>
          {activity.validationWarnings.map((warning) => <p key={warning.message}>{warning.message}</p>)}
        </aside>
      )}
      <section className="original-image-card">
        <h2>原始截图</h2>
        <img src={`/api/imports/${activity.importId}/image`} alt="该运动记录的原始截图" />
      </section>
      <div className="button-row">
        <button className="secondary-button" type="button" onClick={() => setEditing(true)}>编辑记录</button>
        <button
          className="danger-button"
          type="button"
          disabled={remove.isPending}
          onClick={() => window.confirm('确定删除这条运动记录和原始截图吗？') && remove.mutate()}
        >
          {remove.isPending ? '删除中…' : '删除'}
        </button>
      </div>
      {remove.error && <p className="form-error">{remove.error.message}</p>}
    </div>
  );
}
