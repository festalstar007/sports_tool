import { useMemo, useState } from 'react';
import type { ConfirmedActivityInput } from '../../shared/activity-schema';
import { confirmedActivitySchema } from '../../shared/activity-schema';
import {
  deriveMovementMetrics,
  formatPace,
  fromShanghaiDateTimeLocal,
  nullableNumber,
  parseDuration,
  parsePace,
} from '../../shared/units';
import { validateActivityConsistency } from '../../shared/validation';
import type { ActivityFormValues } from '../form';
import { DurationInput } from './DurationInput';

type FormMode = 'review' | 'manual' | 'edit';

type Props = {
  initialValues: ActivityFormValues;
  importId?: string | null;
  confidence?: Record<string, number>;
  submitLabel: string;
  mode?: FormMode;
  busy?: boolean;
  onSubmit: (data: ConfirmedActivityInput) => Promise<void> | void;
};

type FieldConfig = {
  key: keyof ActivityFormValues;
  label: string;
  unit?: string;
  type?: string;
  step?: string;
  confidenceKey?: string;
};

const fieldMap: Record<string, FieldConfig> = {
  startedAtLocal: { key: 'startedAtLocal', label: '运动时间', type: 'datetime-local', confidenceKey: 'startedAtLocal' },
  distanceKm: { key: 'distanceKm', label: '距离', unit: '公里', type: 'number', step: '0.01', confidenceKey: 'distanceMeters' },
  duration: { key: 'duration', label: '运动时长', confidenceKey: 'durationSeconds' },
  caloriesKcal: { key: 'caloriesKcal', label: '总消耗热量', unit: '千卡', type: 'number', confidenceKey: 'caloriesKcal' },
  avgPace: { key: 'avgPace', label: '平均配速', unit: '/公里', confidenceKey: 'avgPaceSecondsPerKm' },
  avgSpeedKmh: { key: 'avgSpeedKmh', label: '平均速度', unit: '公里/小时', type: 'number', step: '0.01', confidenceKey: 'avgSpeedKmh' },
  avgCadenceSpm: { key: 'avgCadenceSpm', label: '平均步频', unit: '步/分钟', type: 'number', confidenceKey: 'avgCadenceSpm' },
  avgStrideCm: { key: 'avgStrideCm', label: '平均步幅', unit: '厘米', type: 'number', confidenceKey: 'avgStrideCm' },
  steps: { key: 'steps', label: '步数', unit: '步', type: 'number', confidenceKey: 'steps' },
  avgHeartRateBpm: { key: 'avgHeartRateBpm', label: '平均心率（选填）', unit: '次/分钟', type: 'number', confidenceKey: 'avgHeartRateBpm' },
  elevationGainMeters: { key: 'elevationGainMeters', label: '累计爬升', unit: '米', type: 'number', step: '0.1', confidenceKey: 'elevationGainMeters' },
  elevationLossMeters: { key: 'elevationLossMeters', label: '累计下降', unit: '米', type: 'number', step: '0.1', confidenceKey: 'elevationLossMeters' },
};

const allFieldKeys = [
  'startedAtLocal',
  'distanceKm',
  'duration',
  'caloriesKcal',
  'avgPace',
  'avgSpeedKmh',
  'avgCadenceSpm',
  'avgStrideCm',
  'steps',
  'avgHeartRateBpm',
  'elevationGainMeters',
  'elevationLossMeters',
] as const;

const manualBasicKeys = ['startedAtLocal', 'distanceKm', 'duration', 'avgHeartRateBpm'] as const;
const manualOptionalKeys = ['caloriesKcal', 'steps', 'elevationGainMeters', 'elevationLossMeters'] as const;

export function ActivityForm({
  initialValues,
  importId = null,
  confidence = {},
  submitLabel,
  mode = 'review',
  busy,
  onSubmit,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const isManual = mode === 'manual' || (mode === 'edit' && importId === null);

  const parsed = useMemo(() => {
    if (!values.sportType || !values.startedAtLocal) return null;
    const durationSeconds = parseDuration(values.duration);
    const distanceMeters = Math.round(Number(values.distanceKm) * 1000);
    const steps = nullableNumber(values.steps);
    const derived = deriveMovementMetrics(distanceMeters, durationSeconds ?? 0, steps);
    const data = {
      importId,
      sportType: values.sportType,
      startedAt: fromShanghaiDateTimeLocal(values.startedAtLocal),
      timezone: 'Asia/Shanghai',
      distanceMeters,
      durationSeconds: durationSeconds ?? 0,
      caloriesKcal: nullableNumber(values.caloriesKcal),
      avgPaceSecondsPerKm: isManual
        ? derived.avgPaceSecondsPerKm
        : values.avgPace.trim() ? parsePace(values.avgPace) : null,
      avgSpeedKmh: isManual ? derived.avgSpeedKmh : nullableNumber(values.avgSpeedKmh),
      avgCadenceSpm: isManual ? derived.avgCadenceSpm : nullableNumber(values.avgCadenceSpm),
      avgStrideCm: isManual ? derived.avgStrideCm : nullableNumber(values.avgStrideCm),
      steps,
      avgHeartRateBpm: nullableNumber(values.avgHeartRateBpm),
      elevationGainMeters: nullableNumber(values.elevationGainMeters),
      elevationLossMeters: nullableNumber(values.elevationLossMeters),
    };
    const result = confirmedActivitySchema.safeParse(data);
    return result.success ? result.data : null;
  }, [values, importId, isManual]);

  const warnings = parsed ? validateActivityConsistency(parsed) : [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.sportType) return setError('请选择跑步或步行');
    if (!values.distanceKm.trim() || Number(values.distanceKm) <= 0) return setError('请填写有效的运动距离');
    if (!values.duration.trim() || !parseDuration(values.duration)) return setError('请填写有效的运动时长');
    if (!isManual && values.avgPace.trim() && parsePace(values.avgPace) == null) return setError('配速格式应为 10:23');
    if (!parsed) return setError('请检查距离、时长和必填字段');
    await onSubmit(parsed);
  }

  function renderField(fieldKey: keyof ActivityFormValues) {
    const field = fieldMap[fieldKey];
    const lowConfidence = field.confidenceKey
      && confidence[field.confidenceKey] != null
      && confidence[field.confidenceKey] < 0.8;

    if (field.key === 'duration') {
      return (
        <div className={lowConfidence ? 'field low-confidence' : 'field'} key={field.key}>
          <span className="field-label">
            {field.label}
            {lowConfidence && <small>请核对</small>}
          </span>
          <DurationInput
            value={values.duration}
            disabled={busy}
            onChange={(duration) => setValues((current) => ({ ...current, duration }))}
          />
        </div>
      );
    }

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
            value={values[field.key]}
            disabled={busy}
            onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
          />
          {field.unit && <span>{field.unit}</span>}
        </span>
      </label>
    );
  }

  return (
    <form className="activity-form" onSubmit={submit}>
      <section className="form-section">
        <h2>{mode === 'manual' ? '手动录入运动' : mode === 'edit' ? '编辑运动记录' : '确认运动信息'}</h2>
        <p className="section-hint">
          {isManual
            ? '只需填写类型、时间、距离和时长，其余信息均可选。'
            : '识别结果仅用于填写表单，确认后才会保存。'}
        </p>
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
        {(isManual ? manualBasicKeys : allFieldKeys).map(renderField)}
      </section>

      {isManual && parsed && (
        <section className="derived-preview" aria-label="自动计算结果">
          <div><span>平均配速</span><strong>{formatPace(parsed.avgPaceSecondsPerKm)} /公里</strong></div>
          <div><span>平均速度</span><strong>{parsed.avgSpeedKmh} 公里/小时</strong></div>
          {parsed.steps != null && <div><span>平均步频</span><strong>{parsed.avgCadenceSpm} 步/分钟</strong></div>}
          {parsed.steps != null && <div><span>平均步幅</span><strong>{parsed.avgStrideCm} 厘米</strong></div>}
        </section>
      )}

      {isManual && (
        <details className="form-section optional-fields">
          <summary>更多数据（选填）</summary>
          <div className="metric-fields">{manualOptionalKeys.map(renderField)}</div>
        </details>
      )}

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
