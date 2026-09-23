import type { Context } from 'hono';
import type { ZodError } from 'zod';
import type { ApiError, ApiEnvelope } from '../shared/api';

export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json<ApiEnvelope<T>>({ data, error: null }, status);
}

export function fail(c: Context, status: 400 | 401 | 404 | 409 | 413 | 415 | 500 | 502, error: ApiError) {
  return c.json<ApiEnvelope<never>>({ data: null, error }, status);
}

export function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    fields[key] ??= [];
    fields[key].push(issue.message);
  }
  return fields;
}
