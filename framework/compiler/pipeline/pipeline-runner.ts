/**
 * Pipeline Runner
 *
 * Orchestrates the compiler plugin pipeline with support for:
 * - Feature toggles (enable/disable individual plugins)
 * - Debug tap (output intermediate files after each plugin step)
 * - Consistent error handling
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, OnLoadArgs, OnLoadResult, PluginBuild } from 'esbuild';
import type { PipelineConfig, PluginToggles } from './pipeline-config.js';
import { getEnabledPlugins, PLUGIN_ORDER } from './pipeline-config.js';
import { logger } from '../utils/logger.js';

const RUNNER_NAME = 'pipeline-runner';

// ============================================================================
// Types
// ============================================================================

/**
 * Plugin transformation function signature.
 * Takes source code and file path, returns transformed code.
 */
export type TransformFn = (source: string, filePath: string, config: PipelineConfig) => Promise<string | null> | string | null;

/**
 * Plugin definition for the pipeline runner.
 */
export interface PipelinePlugin {
  /** Plugin identifier matching PluginToggles key */
  name: keyof PluginToggles;
  /** Transform function */
  transform: TransformFn;
  /** File filter (regex pattern for file paths to process) */
  filter: RegExp;
  /** Whether this plugin can run in parallel with file loading */
  parallel?: boolean;
}

/**
 * Debug tap output for a single transformation step.
 */
export interface DebugTapOutput {
  plugin: keyof PluginToggles;
  filePath: string;
  inputHash: string;
  outputHash: string;
  transformedCode: string;
  timestamp: number;
}

// ============================================================================
// Debug Tap Implementation
// ============================================================================

/**
 * Simple hash function for comparing code changes.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Write debug output for a transformation step.
 */
async function writeDebugTap(config: PipelineConfig, plugin: keyof PluginToggles, filePath: string, inputCode: string, outputCode: string, stepIndex: number): Promise<void> {
  if (!config.debugTap.enabled) return;

  // Check if we should tap this plugin
  const shouldTap = config.debugTap.plugins.length === 0 || config.debugTap.plugins.includes(plugin);

  if (!shouldTap) return;

  const outputDir = config.debugTap.outputDir;
  const fileName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);

  // Create output directory
  await fs.promises.mkdir(outputDir, { recursive: true });

  // Write output file: {step}-{pluginName}-{filename}.{ext}
  const outputFileName = `${String(stepIndex).padStart(2, '0')}-${plugin}-${fileName}${ext}`;
  const outputPath = path.join(outputDir, outputFileName);

  await fs.promises.writeFile(outputPath, outputCode, 'utf-8');

  // Log if code changed
  const inputHash = simpleHash(inputCode);
  const outputHash = simpleHash(outputCode);

  if (inputHash !== outputHash) {
    logger.info(RUNNER_NAME, `[debug-tap] ${plugin}: ${fileName}`, `${inputHash} → ${outputHash}`);
  }
}

// ============================================================================
// Pipeline Runner
// ============================================================================

/**
 * Registry of pipeline plugins.
 * Plugins are registered here and executed in PLUGIN_ORDER.
 */
const pluginRegistry = new Map<keyof PluginToggles, PipelinePlugin>();

/**
 * Register a plugin with the pipeline runner.
 */
export function registerPipelinePlugin(plugin: PipelinePlugin): void {
  pluginRegistry.set(plugin.name, plugin);
}

/**
 * Get all registered plugins in execution order.
 */
export function getRegisteredPlugins(): PipelinePlugin[] {
  return PLUGIN_ORDER.filter((name) => pluginRegistry.has(name)).map((name) => pluginRegistry.get(name)!);
}

/**
 * Create a unified esbuild plugin that runs the pipeline.
 *
 * This plugin:
 * 1. Intercepts file loading (onLoad)
 * 2. Runs all enabled transform plugins in order
 * 3. Outputs debug tap files if enabled
 * 4. Returns the final transformed code
 */
export function createPipelineRunner(config: PipelineConfig): Plugin {
  const enabledPlugins = getEnabledPlugins(config);

  return {
    name: 'wcf-pipeline-runner',
    setup(build: PluginBuild) {
      build.onLoad({ filter: /\.tsx?$/ }, async (args: OnLoadArgs): Promise<OnLoadResult | null> => {
        // Skip node_modules
        if (args.path.includes('node_modules')) {
          return null;
        }

        // Read source file
        let source: string;
        try {
          source = await fs.promises.readFile(args.path, 'utf-8');
        } catch (err) {
          return null;
        }

        let currentCode = source;
        let stepIndex = 0;

        // Run each enabled plugin's transform
        for (const pluginName of enabledPlugins) {
          const plugin = pluginRegistry.get(pluginName);

          // Skip plugins that aren't registered or don't match the file
          if (!plugin || !plugin.filter.test(args.path)) {
            continue;
          }

          try {
            const inputCode = currentCode;
            const result = await plugin.transform(currentCode, args.path, config);

            if (result !== null) {
              currentCode = result;

              // Write debug tap output
              await writeDebugTap(config, pluginName, args.path, inputCode, currentCode, stepIndex);

              stepIndex++;
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error(pluginName, `Error processing ${args.path}`, error);
            throw err;
          }
        }

        // Only return if code was transformed
        if (currentCode !== source) {
          return {
            contents: currentCode,
            loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
          };
        }

        return null;
      });
    },
  };
}

/**
 * Run a single plugin's transform on code (for testing).
 */
export async function runPluginTransform(pluginName: keyof PluginToggles, source: string, filePath: string, config: PipelineConfig): Promise<string | null> {
  const plugin = pluginRegistry.get(pluginName);

  if (!plugin) {
    throw new Error(`Plugin '${pluginName}' not registered`);
  }

  if (!plugin.filter.test(filePath)) {
    return null;
  }

  return plugin.transform(source, filePath, config);
}

/**
 * Run the full pipeline on code (for testing).
 */
export async function runFullPipeline(source: string, filePath: string, config: PipelineConfig): Promise<string> {
  const enabledPlugins = getEnabledPlugins(config);
  let currentCode = source;

  for (const pluginName of enabledPlugins) {
    const plugin = pluginRegistry.get(pluginName);

    if (!plugin || !plugin.filter.test(filePath)) {
      continue;
    }

    const result = await plugin.transform(currentCode, filePath, config);

    if (result !== null) {
      currentCode = result;
    }
  }

  return currentCode;
}
