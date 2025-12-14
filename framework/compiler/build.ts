import { build, BuildOptions, context } from 'esbuild';

// Config & Utils
import { distDir, entryPoints, environment, isProd, serve } from './config.js';
import { consoleColors } from './utils/index.js';

// Plugins (ordered by execution flow)
import { TypeCheckPlugin, RoutesPrecompilerPlugin, ComponentPrecompilerPlugin, ReactiveBindingPlugin, RegisterComponentStripperPlugin, PostBuildPlugin } from './plugins/index.js';

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
    TypeCheckPlugin, // 1. Validate TypeScript
    RoutesPrecompilerPlugin, // 2. Inject page selectors into routes
    ComponentPrecompilerPlugin, // 3. CTFE for component HTML generation
    ReactiveBindingPlugin, // 4. Compile reactive signal bindings
    RegisterComponentStripperPlugin, // 5. Remove compile-time-only code
    PostBuildPlugin, // 6. Copy assets, update HTML, start server
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
  const startTime = performance.now();

  console.info(consoleColors.blue, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;

  try {
    if (!serve) {
      await build(buildConfig);
      console.info(consoleColors.green, `\n⏱️  Build completed in ${(performance.now() - startTime).toFixed(2)}ms`);
    } else {
      const ctx = await context(buildConfig);
      await ctx.watch({}).then(() => console.info(consoleColors.blue, 'Watching for changes...'));
    }
  } catch (err) {
    process.exit(1);
  }
})();
