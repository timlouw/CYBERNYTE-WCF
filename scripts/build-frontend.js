const esbuild = require('esbuild');
const customElementUniqueIdGeneratorPlugin = require('./plugins/unique-id-generator');
const tscTypeCheckingPlugin = require('./plugins/tsc-type-checker');
const customHashingPlugin = require('./plugins/file-hash-generator');

const blueOutput = '\x1b[94m%s\x1b[0m';

const environment = process.argv[2] || 'dev';
const application = process.argv[3] || 'client';
const serve = process.argv[4] || '';

const isProd = environment === 'prod';
const distDir = `./dist/${application}`;
const entryPoints = [`./apps/${application}/index.ts`, `./apps/${application}/router/router.ts`];


// ESBUILD CONFIGS ---------------------------------------------------------------------------------------------------------------------------------
const SharedConfig = {
  entryPoints: entryPoints,
  bundle: true,
  platform: 'browser',
  outdir: distDir,
  logLevel: 'error',
  splitting: true,
  format: 'esm',
  sourcemap: false,
  write: false,
  plugins: [tscTypeCheckingPlugin, customHashingPlugin, customElementUniqueIdGeneratorPlugin],
};

const ProdConfig = {
  minify: true,
  ...SharedConfig,
};
const DevConfig = {
  minify: false,
  ...SharedConfig,
};

// MAIN EXECUTION AND SERVER -------------------------------------------------------------------------------------------------------------------------------------------
(async () => {
  console.info(blueOutput, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;

  if (isProd && serve !== 'serve') {
    await esbuild.build(buildConfig).catch(() => process.exit(1));
  } else {
    const ctx = await esbuild.context(buildConfig);
    await ctx.watch({}).then(() => console.info(blueOutput, 'Watching for changes...'));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
