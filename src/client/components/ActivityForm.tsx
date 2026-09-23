import { useMemo, useState } from 'react';
import type { ConfirmedActivityInput } from '../../shared/activity-schema';
import { confirmedActivitySchema } from '../../shared/activity-schema';
import { fromShanghaiDateTimeLocal, normalizeDurationInput, nullableNumber, parseDuration, parsePace } from '../../shared/units';
import { validateActivityConsistency } from '../../shared/validation';
import type { ActivityFormValues } from '../form';

type Props = {
  initialValues: ActivityFormValues;
  importId: string;
  confidence?: Record<string, number>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (data: ConfirmedActivityInput) => Promise<void> | void;
};

const fields: Array<{
  key: keyof ActivityFormValues;
  label: string;
  unit?: string;
  type?: string;
  placeholder?: string;
  step?: string;
  confidenceKey?: string;
}> = [
  { key: 'startedAtLocal', label: '运动时间', type: 'datetime-local', confidenceKey: 'startedAtLocal' },
  { key: 'distanceKm', label: '距离', unit: '公里', type: 'number', step: '0.01', confidenceKey: 'distanceMeters' },
  { key: 'duration', label: '运动时长', unit: '时:分:秒', placeholder: '例如 00:31:29', confidenceKey: 'durationSeconds' },
  { key: 'caloriesKcal', label: '总消耗热量', unit: '千卡', type: 'number', confidenceKey: 'caloriesKcal' },
  { key: 'avgPace', label: '平均配速', unit: '/公里', placeholder: '10:23', confidenceKey: 'avgPaceSecondsPerKm' },
  { key: 'avgSpeedKmh', label: '平均速度', unit: '公里/小时', type: 'number', step: '0.01', confidenceKey: 'avgSpeedKmh' },
  { key: 'avgCadenceSpm', label: '平均步频', unit: '步/分钟', type: 'number', confidenceKey: 'avgCadenceSpm' },
  { key: 'avgStrideCm', label: '平均步幅', unit: '厘米', type: 'number', confidenceKey: 'avgStrideCm' },
  { key: 'steps', label: '步数', unit: '步', type: 'number', confidenceKey: 'steps' },
  { key: 'avgHeartRateBpm', label: '平均心率', unit: '次/分钟', type: 'number', confidenceKey: 'avgHeartRateBpm' },
  { key: 'elevationGainMeters', label: '累计爬升', unit: '米', type: 'number', step: '0.1', confidenceKey: 'elevationGainMeters' },
  { key: 'elevationLossMeters', label: '累计下降', unit: '米', type: 'number', step: '0.1', confidenceKey: 'elevationLossMeters' },
];

export function ActivityForm({ initialValues, importId, confidence = {}, submitLabel, busy, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!values.sportType || !values.startedAtLocal) return null;
    const durationSeconds = parseDuration(values.duration);
    const avgPaceSecondsPerKm = values.avgPace.trim() ? parsePace(values.avgPace) : null;
    const data = {
      importId,
      sportType: values.sportType,
      startedAt: fromShanghaiDateTimeLocal(values.startedAtLocal),
      timezone: 'Asia/Shanghai',
      distanceMeters: Math.round(Number(values.distanceKm) * 1000),
      durationSeconds: durationSeconds ?? 0,
      caloriesKcal: nullableNumber(values.caloriesKcal),
      avgPaceSecondsPerKm,
      avgSpeedKmh: nullableNumber(values.avgSpeedKmh),
      avgCadenceSpm: nullableNumber(values.avgCadenceSpm),
      avgStrideCm: nullableNumber(values.avgStrideCm),
      steps: nullableNumber(values.steps),
      avgHeartRateBpm: nullableNumber(values.avgHeartRateBpm),
      elevationGainMeters: nullableNumber(values.elevationGainMeters),
      elevationLossMeters: nullableNumber(values.elevationLossMeters),
    };
    const result = confirmedActivitySchema.safeParse(data);
    return result.success ? result.data : null;
  }, [values, importId]);

  const warnings = parsed ? validateActivityConsistency(parsed) : [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.sportType) return setError('请选择跑步或步行');
    if (!values.duration.trim()) return setError('请填写运动时长，例如 00:31:29');
    if (!parseDuration(values.duration)) return setError('运动时长格式不正确，可填写 00:31:29 或 31:29');
    if (values.avgPace.trim() && parsePace(values.avgPace) == null) return setError('配速格式应为 10:23');
    if (!parsed) return setError('请检查距离、时长和必填字段');
    await onSubmit(parsed);
  }

  return (
    <form className="activity-form" onSubmit={submit}>
      <section className="form-section">
        <h2>确认运动信息</h2>
        <p className="section-hint">识别结果仅用于填写表单，确认后才会保存。</p>
        <div className="sport-picker" role="radiogroup" aria-label="运动类型">
          {(['running', 'walking'] as const).map((sport) => (
            <button
              className={values.sportType === sport ? 'sport-option active' : 'sport-option'}
              type="button"
              role="radio"
              aria-checked={values.sportType === sport}
              key={sport}
              onClick={() => setValues((current) => ({ ...current, sportType: sport }))}
            >
              <span>{sport === 'running' ? '跑' : '走'}</span>
              {sport === 'running' ? '跑步' : '步行'}
            </button>
          ))}
        </div>
      </section>

      <section className="form-section metric-fields">
        {fields.map((field) => {
          const lowConfidence = field.confidenceKey && confidence[field.confidenceKey] != null && confidence[field.confidenceKey] < 0.8;
          return (
            <label className={lowConfidence ? 'field low-confidence' : 'field'} key={field.key}>
              <span className="field-label">
                {field.label}
                {lowConfidence && <small>请核对</small>}
              </span>
              <span className="input-with-unit">
                <input
                  type={field.type ?? 'text'}
                  inputMode={field.type === 'number' ? 'decimal' : undefined}
                  step={field.step}
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  onBlur={field.key === 'duration'
                    ? () => setValues((current) => ({ ...current, duration: normalizeDurationInput(current.duration) }))
                    : undefined}
                />
                {field.unit && <span>{field.unit}</span>}
              </span>
            </label>
          );
        })}
      </section>

      {warnings.length > 0 && (
        <aside className="warning-box">
          <strong>有 {warnings.length} 项需要确认</strong>
          {warnings.map((warning) => <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>)}
        </aside>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button sticky-submit" type="submit" disabled={busy}>
        {busy ? '正在保存…' : submitLabel}
      </button>
    </form>
  );
}
