import { exec } from 'child_process';
import { Plugin } from 'esbuild';
import { consoleColors } from '../utils/index.js';

let isRunning = false;

const runTypeCheck = (): void => {
  if (isRunning) return;
  isRunning = true;

  console.info(consoleColors.blue, 'TypeScript type checking running...');
  console.info('');

  exec('tsc --noEmit', (error, stdout) => {
    isRunning = false;

    if (error) {
      console.error(`TypeScript type checking failed: ${error}`);
      console.error('---------------------------------------------------------------');
      console.error(stdout);
      console.error('---------------------------------------------------------------');
    }
  });
};

export const TypeCheckPlugin: Plugin = {
  name: 'type-check-plugin',
  setup(build) {
    build.onStart(() => runTypeCheck());
  },
};
