import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { AppEnv } from './app-types';
import { fail, ok } from './http';
import { registerActivityRoutes } from './routes/activities';
import { registerImportRoutes } from './routes/imports';
import { registerStatisticRoutes } from './routes/statistics';

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('x-request-id', requestId);
  c.header('x-content-type-options', 'nosniff');
});

app.use('/api/*', async (c, next) => {
  const isDevelopment = c.env.APP_ENV !== 'production';
  const bypass = isDevelopment && c.env.DEV_AUTH_BYPASS === 'true';
  const accessAssertion = c.req.header('cf-access-jwt-assertion');
  if (!bypass && !accessAssertion) {
    return fail(c, 401, { code: 'UNAUTHORIZED', message: '需要通过 Cloudflare Access 登录' });
  }
  await next();
});

app.get('/api/health', (c) => ok(c, { status: 'ok', service: 'sports-tool' }));

registerImportRoutes(app);
registerActivityRoutes(app);
registerStatisticRoutes(app);

app.notFound((c) => fail(c, 404, { code: 'NOT_FOUND', message: '接口不存在' }));

app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error.message, stack: error.stack }));
  return fail(c, 500, { code: 'INTERNAL_ERROR', message: '服务器处理失败' });
});

export default app;
