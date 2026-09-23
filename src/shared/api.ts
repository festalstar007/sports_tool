export type ApiError = {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
};

export type ApiEnvelope<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };
