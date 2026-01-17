import { build, BuildOptions, context } from 'esbuild';

// Config & Utils
import { distDir, entryPoints, environment, isProd, serve } from './config.js';
import { consoleColors } from './utils/index.js';

// Plugins (ordered by execution flow)
import {
  TypeCheckPlugin,
  RoutesPrecompilerPlugin,
  ComponentPrecompilerPlugin,
  ReactiveBindingPlugin,
  RegisterComponentStripperPlugin,
  GlobalCSSBundlerPlugin,
  HTMLBootstrapInjectorPlugin,
  MinificationPlugin,
  PostBuildPlugin,
} from './plugins/index.js';

// ============================================================================
// ESBuild Configuration
// ============================================================================

// Base plugins used in both dev and prod
const basePlugins = [
  TypeCheckPlugin, // 1. Validate TypeScript
  RoutesPrecompilerPlugin, // 2. Inject page selectors into routes
  ComponentPrecompilerPlugin, // 3. CTFE for component HTML generation
  ReactiveBindingPlugin, // 4. Compile reactive signal bindings
  RegisterComponentStripperPlugin, // 5. Remove compile-time-only code
  GlobalCSSBundlerPlugin, // 6. Pre-bundle global.css as inline constant
  HTMLBootstrapInjectorPlugin, // 7. Inject root component HTML into index.html
];

// Production adds MinificationPlugin (requires write: false)
const prodPlugins = [
  ...basePlugins,
  MinificationPlugin, // 8. Minify selectors + HTML/CSS templates (prod only)
  PostBuildPlugin, // 9. Copy assets, update HTML, start server
];

// Dev skips minification
const devPlugins = [
  ...basePlugins,
  PostBuildPlugin, // 8. Copy assets, update HTML, start server
];

const BaseConfig: BuildOptions = {
  entryPoints: entryPoints,
  bundle: true,
  platform: 'browser',
  target: ['es2020', 'chrome90', 'firefox88', 'safari14', 'edge90'], // Modern browsers for smaller output
  outdir: distDir,
  treeShaking: true,
  logLevel: 'error',
  splitting: true,
  format: 'esm',
  sourcemap: false,
  metafile: true,
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  legalComments: 'none', // Remove license comments
};

const DevConfig: BuildOptions = {
  ...BaseConfig,
  minify: false,
  write: true, // Dev: let esbuild write files directly
  plugins: devPlugins,
};

const ProdConfig: BuildOptions = {
  ...BaseConfig,
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  drop: ['console', 'debugger'], // Remove console.log and debugger statements
  write: false, // Prod: MinificationPlugin handles writing after processing
  plugins: prodPlugins,
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
