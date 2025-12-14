/**
 * TypeScript Type Checker Plugin
 *
 * Runs `tsc --noEmit` asynchronously to validate TypeScript types without blocking
 * the build. Catches type errors early while allowing esbuild to proceed with
 * bundling in parallel.
 */
import { exec } from 'child_process';
import { Plugin } from 'esbuild';
import { logger, PLUGIN_NAME } from '../../utils/index.js';

const NAME = PLUGIN_NAME.TYPE_CHECK;
let isRunning = false;

const runTypeCheck = (): void => {
  if (isRunning) return;
  isRunning = true;

  logger.info(NAME, 'Running TypeScript type check...');

  exec('tsc --noEmit', (error, stdout) => {
    isRunning = false;

    if (error) {
      logger.error(NAME, 'Type check failed');
      console.error('---------------------------------------------------------------');
      console.error(stdout);
      console.error('---------------------------------------------------------------');
    }
  });
};

export const TypeCheckPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onStart(() => runTypeCheck());
  },
};
