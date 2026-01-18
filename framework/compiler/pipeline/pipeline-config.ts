/**
 * Pipeline Configuration
 *
 * Centralized configuration schema for the compiler pipeline.
 * Allows feature toggles and debug tap configuration.
 */

// ============================================================================
// Types
// ============================================================================

export type Environment = 'dev' | 'prod';

/**
 * Individual plugin toggle configuration.
 * Each plugin can be enabled/disabled without breaking the pipeline.
 */
export interface PluginToggles {
  /** Type checking - validates TypeScript types */
  typeCheck: boolean;
  /** Routes precompiler - injects page selectors into route definitions */
  routesPrecompiler: boolean;
  /** Component precompiler - CTFE for component HTML generation */
  componentPrecompiler: boolean;
  /** Reactive binding compiler - compiles signal bindings into DOM operations */
  reactiveBinding: boolean;
  /** Register component stripper - removes compile-time-only code */
  registerComponentStripper: boolean;
  /** Global CSS bundler - pre-bundles global.css as inline constant */
  globalCssBundler: boolean;
  /** HTML bootstrap injector - injects root component HTML into index.html */
  htmlBootstrapInjector: boolean;
  /** Minification - production-only selector and template minification */
  minification: boolean;
  /** Dead code eliminator - production-only static analysis to remove dead code */
  deadCodeEliminator: boolean;
  /** Post build processor - copies assets, updates dev server */
  postBuild: boolean;
}

/**
 * Debug tap configuration for intermediate output.
 */
export interface DebugTapConfig {
  /** Whether to output intermediate files after each plugin */
  enabled: boolean;
  /** Directory for debug output files */
  outputDir: string;
  /** Plugins to tap (if empty, taps all enabled plugins) */
  plugins: (keyof PluginToggles)[];
}

/**
 * Complete pipeline configuration.
 */
export interface PipelineConfig {
  /** Build environment */
  environment: Environment;
  /** Plugin toggles */
  plugins: PluginToggles;
  /** Debug tap settings */
  debugTap: DebugTapConfig;
  /** Source paths */
  paths: {
    /** Entry points for the build */
    entryPoints: string[];
    /** Output directory */
    outDir: string;
    /** Assets input directory */
    assetsInputDir: string;
    /** Assets output directory */
    assetsOutputDir: string;
    /** Input HTML file path */
    inputHtmlPath: string;
    /** Output HTML file path */
    outputHtmlPath: string;
  };
  /** Build options */
  build: {
    /** Whether to serve the build (watch mode) */
    serve: boolean;
    /** Whether to use gzip compression */
    gzip: boolean;
    /** Whether this is a production build */
    isProd: boolean;
  };
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default plugin toggles - all enabled.
 * Individual plugins can be disabled for testing or debugging.
 */
export const DEFAULT_PLUGIN_TOGGLES: PluginToggles = {
  typeCheck: true,
  routesPrecompiler: true,
  componentPrecompiler: true,
  reactiveBinding: true,
  registerComponentStripper: true,
  globalCssBundler: true,
  htmlBootstrapInjector: true,
  minification: true,
  deadCodeEliminator: true,
  postBuild: true,
};

/**
 * Development plugin toggles - minification and dead code elimination disabled.
 */
export const DEV_PLUGIN_TOGGLES: PluginToggles = {
  ...DEFAULT_PLUGIN_TOGGLES,
  minification: false,
  deadCodeEliminator: false,
};

/**
 * Default debug tap configuration - disabled.
 */
export const DEFAULT_DEBUG_TAP: DebugTapConfig = {
  enabled: false,
  outputDir: './debug-output',
  plugins: [],
};

/**
 * Create a pipeline configuration from environment and options.
 */
export function createPipelineConfig(options: {
  environment: Environment;
  application?: string;
  serve?: boolean;
  gzip?: boolean;
  debugTap?: Partial<DebugTapConfig>;
  plugins?: Partial<PluginToggles>;
}): PipelineConfig {
  const { environment, application = 'client', serve = false, gzip = false, debugTap = {}, plugins = {} } = options;

  const isProd = environment === 'prod';

  // Use dev toggles in development, full toggles in production
  const basePluginToggles = isProd ? DEFAULT_PLUGIN_TOGGLES : DEV_PLUGIN_TOGGLES;

  return {
    environment,
    plugins: {
      ...basePluginToggles,
      ...plugins,
    },
    debugTap: {
      ...DEFAULT_DEBUG_TAP,
      ...debugTap,
    },
    paths: {
      entryPoints: [`./apps/${application}/main.ts`],
      outDir: `./dist/${application}`,
      assetsInputDir: `./apps/${application}/assets`,
      assetsOutputDir: `./dist/${application}/assets`,
      inputHtmlPath: './apps/index.html',
      outputHtmlPath: `./dist/${application}/index.html`,
    },
    build: {
      serve,
      gzip,
      isProd,
    },
  };
}

// ============================================================================
// Plugin Order
// ============================================================================

/**
 * Canonical plugin execution order.
 * Plugins are executed in this order regardless of toggle configuration.
 */
export const PLUGIN_ORDER: (keyof PluginToggles)[] = [
  'typeCheck',
  'routesPrecompiler',
  'componentPrecompiler',
  'reactiveBinding',
  'registerComponentStripper',
  'globalCssBundler',
  'htmlBootstrapInjector',
  'minification',
  'deadCodeEliminator',
  'postBuild',
];

/**
 * Get the list of enabled plugins in execution order.
 */
export function getEnabledPlugins(config: PipelineConfig): (keyof PluginToggles)[] {
  return PLUGIN_ORDER.filter((plugin) => config.plugins[plugin]);
}
