import { build, BuildOptions, context } from 'esbuild';
import { tscTypeCheckingPlugin } from './plugins/tsc-type-checker.js';
import { customHashingPlugin } from './plugins/file-hash-generator.js';
import { componentPrecompilerPlugin } from './plugins/component-precompiler.js';
import { reactiveBindingCompilerPlugin } from './plugins/reactive-binding-compiler.js';
import { routesPrecompilerPlugin } from './plugins/routes-precompiler.js';
import { registerComponentStripperPlugin } from './plugins/register-component-stripper.js';
import { blueOutput, distDir, entryPoints, environment, isProd, serve } from './shared-config.js';
import { inspect } from 'util';

// Helper to fully expand error objects
function logFullError(err: unknown) {
  console.error('Build failed with error:');
  console.error(inspect(err, { depth: null, colors: true, showHidden: true }));
  if (err && typeof err === 'object') {
    console.error('All own properties:', Object.getOwnPropertyNames(err));
    for (const key of Object.getOwnPropertyNames(err)) {
      console.error(`  ${key}:`, inspect((err as any)[key], { depth: null, colors: true }));
    }
  }
}

// Catch unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => {
  logFullError(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logFullError(err);
  process.exit(1);
});

// ESBUILD CONFIGS ---------------------------------------------------------------------------------------------------------------------------------
const SharedConfig: BuildOptions = {
  entryPoints: entryPoints,
  bundle: true,
  platform: 'browser',
  outdir: distDir,
  treeShaking: true,
  logLevel: 'error',
  splitting: true,
  format: 'esm',
  sourcemap: false,
  write: false,
  plugins: [tscTypeCheckingPlugin, customHashingPlugin, componentPrecompilerPlugin, routesPrecompilerPlugin, registerComponentStripperPlugin, reactiveBindingCompilerPlugin],
};

const DevConfig: BuildOptions = {
  minify: false,
  ...SharedConfig,
};

const ProdConfig: BuildOptions = {
  minify: true,
  ...SharedConfig,
};

// MAIN EXECUTION AND SERVER -------------------------------------------------------------------------------------------------------------------------------------------
(async () => {
  console.info(blueOutput, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;

  try {
    if (!serve) {
      await build(buildConfig);
    } else {
      const ctx = await context(buildConfig);
      await ctx.watch({}).then(() => console.info(blueOutput, 'Watching for changes...'));
    }
  } catch (err) {
    logFullError(err);
    process.exit(1);
  }
})();
