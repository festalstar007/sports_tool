import type {
  Activity,
  ActivityImport,
  ConfirmedActivityInput,
  SportType,
  Summary,
  TrendPoint,
  UpdateActivityInput,
} from '../shared/activity-schema';
import type { ApiEnvelope } from '../shared/api';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || envelope.error) {
    const error = envelope.error ?? { code: 'REQUEST_FAILED', message: '请求失败' };
    throw new ApiRequestError(error.message, error.code, response.status, error.fields);
  }
  return envelope.data;
}

export async function uploadImport(file: File): Promise<ActivityImport> {
  const form = new FormData();
  form.append('image', file);
  return request<ActivityImport>('/api/imports', { method: 'POST', body: form });
}

export function getImport(id: string): Promise<ActivityImport> {
  return request<ActivityImport>(`/api/imports/${id}`);
}

export function retryImport(id: string): Promise<ActivityImport> {
  return request<ActivityImport>(`/api/imports/${id}/retry`, { method: 'POST' });
}

export function createActivity(input: ConfirmedActivityInput): Promise<Activity> {
  return request<Activity>('/api/activities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateActivity(id: string, input: UpdateActivityInput): Promise<Activity> {
  return request<Activity>(`/api/activities/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteActivity(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/api/activities/${id}`, { method: 'DELETE' });
}

export function getActivity(id: string): Promise<Activity> {
  return request<Activity>(`/api/activities/${id}`);
}

export function listActivities(options?: {
  sportType?: SportType | 'all';
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Activity[]> {
  const params = new URLSearchParams();
  if (options?.sportType && options.sportType !== 'all') params.set('sportType', options.sportType);
  if (options?.from) params.set('from', options.from);
  if (options?.to) params.set('to', options.to);
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.size ? `?${params}` : '';
  return request<Activity[]>(`/api/activities${query}`);
}

export function getSummary(options?: {
  sportType?: SportType | 'all';
  from?: string;
  to?: string;
}): Promise<Summary> {
  const params = new URLSearchParams();
  if (options?.sportType && options.sportType !== 'all') params.set('sportType', options.sportType);
  if (options?.from) params.set('from', options.from);
  if (options?.to) params.set('to', options.to);
  return request<Summary>(`/api/statistics/summary${params.size ? `?${params}` : ''}`);
}

export function getTrends(options: {
  metric: string;
  bucket: 'day' | 'week' | 'month';
  sportType?: SportType | 'all';
  from?: string;
  to?: string;
}): Promise<TrendPoint[]> {
  const params = new URLSearchParams({ metric: options.metric, bucket: options.bucket });
  if (options.sportType && options.sportType !== 'all') params.set('sportType', options.sportType);
  if (options.from) params.set('from', options.from);
  if (options.to) params.set('to', options.to);
  return request<TrendPoint[]>(`/api/statistics/trends?${params}`);
}
