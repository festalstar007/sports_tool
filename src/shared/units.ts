export function parseDuration(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[：﹕]/g, ':')
    .replace(/小时|时/g, ':')
    .replace(/分钟|分/g, ':')
    .replace(/秒$/, '')
    .replace(/:{2,}/g, ':')
    .replace(/^:|:$/g, '');
  if (!/^\d{1,3}:\d{1,2}(?::\d{1,2})?$/.test(normalized)) return null;
  const parts = normalized.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  return null;
}

export function normalizeDurationInput(value: string): string {
  const seconds = parseDuration(value);
  return seconds == null ? value.trim() : formatDuration(seconds);
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '—';
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
}

export function parsePace(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/(?:\/公里|每公里)$/i, '')
    .replace(/[′']/g, ':')
    .replace(/[″"]/g, '');
  const match = normalized.match(/^(\d{1,3}):(\d{1,2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds >= 60) return null;
  return minutes * 60 + seconds;
}

export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm)) return '—';
  const rounded = Math.max(0, Math.round(secondsPerKm));
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const match = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match?.[1] ?? '';
}

export function fromShanghaiDateTimeLocal(value: string): string {
  return `${value}:00+08:00`;
}

export function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveMovementMetrics(distanceMeters: number, durationSeconds: number, steps: number | null = null) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      avgPaceSecondsPerKm: null,
      avgSpeedKmh: null,
      avgCadenceSpm: null,
      avgStrideCm: null,
    };
  }
  const distanceKm = distanceMeters / 1000;
  const hasSteps = steps != null && Number.isFinite(steps) && steps > 0;
  return {
    avgPaceSecondsPerKm: Math.round(durationSeconds / distanceKm),
    avgSpeedKmh: Math.round((distanceKm / (durationSeconds / 3600)) * 100) / 100,
    avgCadenceSpm: hasSteps ? Math.floor(steps / (durationSeconds / 60)) : null,
    avgStrideCm: hasSteps ? Math.round((distanceMeters * 100) / steps) : null,
  };
}
