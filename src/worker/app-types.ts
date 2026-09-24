import type { Context, Hono } from 'hono';
import type { Env } from './env';

export type AppEnv = {
  Bindings: Env;
  Variables: { requestId: string };
};

export type App = Hono<AppEnv>;
export type AppContext = Context<AppEnv>;
