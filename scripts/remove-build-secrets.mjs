import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const generatedDevVars = resolve('dist/sports_tool/.dev.vars');

await rm(generatedDevVars, { force: true });
