const { exec } = require('child_process');

const blueOutput = '\x1b[94m%s\x1b[0m';
let isTscRunning = false;

const typeChecker = () => {
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

const tscTypeCheckingPlugin = {
  name: 'tsc-type-checking-plugin',
  setup(build) {
    build.onStart(() => typeChecker());
  },
};

module.exports = tscTypeCheckingPlugin;
