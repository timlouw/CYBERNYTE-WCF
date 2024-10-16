import { build, BuildOptions, context } from 'esbuild';
import { customElementUniqueIdGeneratorPlugin } from './plugins/unique-id-generator';
import { tscTypeCheckingPlugin } from './plugins/tsc-type-checker';
import { customHashingPlugin } from './plugins/file-hash-generator';
import { blueOutput, distDir, entryPoints, environment, isProd, serve } from './shared-config';

// ESBUILD CONFIGS ---------------------------------------------------------------------------------------------------------------------------------
const SharedConfig: BuildOptions = {
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

const ProdConfig: BuildOptions = {
  minify: true,
  ...SharedConfig,
};

const DevConfig: BuildOptions = {
  minify: false,
  ...SharedConfig,
};

// MAIN EXECUTION AND SERVER -------------------------------------------------------------------------------------------------------------------------------------------
(async () => {
  console.info(blueOutput, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;

  try {
    if (isProd && !serve) {
      await build(buildConfig);
    } else {
      const ctx = await context(buildConfig);
      await ctx.watch({}).then(() => console.info(blueOutput, 'Watching for changes...'));
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
