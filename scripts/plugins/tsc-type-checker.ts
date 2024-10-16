import { exec } from 'child_process';
import { Plugin } from 'esbuild';
import { blueOutput } from '../shared-config';

let isTscRunning = false;

const typeChecker = (): void => {
  if (isTscRunning) return;
  isTscRunning = true;
  console.info(blueOutput, 'TypeScript type checking running...');
  console.info('');

  exec('tsc --noEmit', (error, stdout) => {
    isTscRunning = false;

    if (error) {
      console.error(`TypeScript type checking failed: ${error}`);
      console.error('---------------------------------------------------------------');
      console.error(stdout);
      console.error('---------------------------------------------------------------');
    }
  });
};

export const tscTypeCheckingPlugin: Plugin = {
  name: 'tsc-type-checking-plugin',
  setup(build) {
    build.onStart(() => typeChecker());
  },
};
