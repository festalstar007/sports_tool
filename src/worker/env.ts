export type AiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export type Env = {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  IMAGES: ImagesBinding;
  AI?: AiBinding;
  APP_ENV?: string;
  APP_TIMEZONE?: string;
  AI_MODEL?: string;
  MAX_UPLOAD_BYTES?: string;
  DEV_AUTH_BYPASS?: string;
};
