import { build, BuildOptions, context } from 'esbuild';

// Config & Utils
import { distDir, entryPoints, environment, isProd, serve } from './config.js';
import { consoleColors } from './utils/index.js';

// Plugins (ordered by execution flow)
import { TypeCheckPlugin } from './plugins/tsc-type-checker.js';
import { RoutesPrecompilerPlugin } from './plugins/routes-precompiler.js';
import { ComponentPrecompilerPlugin } from './plugins/component-precompiler.js';
import { ReactiveBindingPlugin } from './plugins/reactive-binding-compiler.js';
import { RegisterComponentStripperPlugin } from './plugins/register-component-stripper.js';
import { PostBuildPlugin } from './plugins/post-build-processor.js';

// ============================================================================
// ESBuild Configuration
// ============================================================================
const BaseConfig: BuildOptions = {
  entryPoints: entryPoints,
  bundle: true,
  platform: 'browser',
  outdir: distDir,
  treeShaking: true,
  logLevel: 'error',
  splitting: true,
  format: 'esm',
  sourcemap: false,
  write: true,
  metafile: true,
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  plugins: [
    // Plugins ordered by execution flow:
    // 1. TypeCheck     - Validate TypeScript before processing
    // 2. RoutesPre     - Inject page selectors into routes
    // 3. ComponentPre  - CTFE for component HTML generation
    // 4. Reactive      - Compile reactive bindings
    // 5. Stripper      - Remove compile-time-only code
    // 6. PostBuild     - Copy assets, update HTML, start server
    TypeCheckPlugin,
    RoutesPrecompilerPlugin,
    ComponentPrecompilerPlugin,
    ReactiveBindingPlugin,
    RegisterComponentStripperPlugin,
    PostBuildPlugin,
  ],
};

const DevConfig: BuildOptions = {
  ...BaseConfig,
  minify: false,
};

const ProdConfig: BuildOptions = {
  ...BaseConfig,
  minify: true,
};

// ============================================================================
// Main Execution
// ============================================================================
(async () => {
  console.info(consoleColors.blue, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;
  const startTime = performance.now();

  try {
    if (!serve) {
      await build(buildConfig);
      const endTime = performance.now();
      const buildTime = (endTime - startTime).toFixed(2);
      console.info(consoleColors.green, `\n⏱️  Build completed in ${buildTime}ms`);
    } else {
      const ctx = await context(buildConfig);
      await ctx.watch({}).then(() => console.info(consoleColors.blue, 'Watching for changes...'));
    }
  } catch (err) {
    // logFullError(err);
    process.exit(1);
  }
})();
