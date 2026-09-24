import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSummary, listActivities, uploadImport } from '../api';
import { ActivityListItem } from '../components/ActivityListItem';
import { MetricCard } from '../components/MetricCard';
import { formatDistance, formatDuration } from '../../shared/units';

function weekStartIso(): string {
  const now = new Date();
  const shanghaiOffset = 8 * 3600_000;
  const local = new Date(now.getTime() + shanghaiOffset);
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - day + 1);
  local.setUTCHours(0, 0, 0, 0);
  return `${local.toISOString().slice(0, 19)}+08:00`;
}

export function HomePage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const summary = useQuery({ queryKey: ['summary', 'week'], queryFn: () => getSummary({ from: weekStartIso() }) });
  const recent = useQuery({ queryKey: ['activities', 'recent'], queryFn: () => listActivities({ limit: 1 }) });
  const upload = useMutation({
    mutationFn: uploadImport,
    onSuccess: (result) => navigate(`/imports/${result.id}/review`),
  });

  function chooseFile(file?: File) {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  }

  return (
    <div className="page-stack">
      <section className="hero-card">
        <p className="eyebrow">本周概览</p>
        <div className="hero-distance">{formatDistance(summary.data?.totalDistanceMeters ?? 0)}</div>
        <p>{summary.data?.count ?? 0} 次运动 · {formatDuration(summary.data?.totalDurationSeconds ?? 0)}</p>
        <div className="hero-glow" />
      </section>

      <section className="metric-grid">
        <MetricCard label="运动次数" value={`${summary.data?.count ?? 0} 次`} />
        <MetricCard label="总热量" value={`${summary.data?.totalCaloriesKcal ?? 0} kcal`} tone="orange" />
        <MetricCard label="总步数" value={`${(summary.data?.totalSteps ?? 0).toLocaleString('zh-CN')} 步`} tone="blue" />
      </section>

      <section className="upload-card">
        <div className="upload-icon" aria-hidden="true">↥</div>
        <h2>上传运动截图</h2>
        <p>支持户外跑步和户外步行详情页，识别后可逐项确认。</p>
        {preview && <img className="upload-preview" src={preview} alt="待识别截图预览" />}
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <button className="primary-button" type="button" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          {upload.isPending ? '上传并准备识别…' : '从相册选择截图'}
        </button>
        <button className="manual-entry-button" type="button" disabled={upload.isPending} onClick={() => navigate('/activities/new')}>
          没有截图？手动录入
        </button>
        {upload.error && <p className="form-error" role="alert">{upload.error.message}</p>}
      </section>

      {recent.data?.[0] && (
        <section>
          <div className="section-heading"><h2>最近一次</h2></div>
          <ActivityListItem activity={recent.data[0]} />
        </section>
      )}
    </div>
  );
}
