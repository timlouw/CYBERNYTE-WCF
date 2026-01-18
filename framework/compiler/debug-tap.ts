/**
 * Debug Tap Utility
 *
 * Processes a component file through the compiler pipeline and writes
 * intermediate output after each plugin step. This helps debug and
 * understand how each plugin transforms the code.
 *
 * Usage:
 *   bun framework/compiler/debug-tap.ts <file-path> [--plugins=plugin1,plugin2]
 *
 * Examples:
 *   bun framework/compiler/debug-tap.ts apps/client/components/test.ts
 *   bun framework/compiler/debug-tap.ts apps/client/pages/landing.ts --plugins=reactiveBinding
 *
 * Output:
 *   ./debug-output/
 *     00-original-{filename}.ts
 *     01-{plugin}-{filename}.ts
 *     02-{plugin}-{filename}.ts
 *     ...
 */

import * as fs from 'fs';
import * as path from 'path';
import { consoleColors } from './utils/colors.js';
import { PLUGIN_ORDER, type PluginToggles } from './pipeline/pipeline-config.js';

// Direct transform function imports
import { transformReactiveBindings } from './plugins/reactive-binding-compiler/reactive-binding-compiler.js';

// ============================================================================
// Configuration
// ============================================================================

const OUTPUT_DIR = './debug-output';

// Plugin transform functions that can be invoked directly
type TransformFn = (source: string, filePath: string) => string | null;

const pluginTransforms: Partial<Record<keyof PluginToggles, TransformFn>> = {
  // Reactive binding is the main transform we can debug
  reactiveBinding: transformReactiveBindings,
};

// ============================================================================
// Debug Tap Implementation
// ============================================================================

/**
 * Simple hash for detecting changes
 */
function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

/**
 * Write a file to the debug output directory
 */
async function writeDebugFile(step: number, label: string, filename: string, content: string): Promise<void> {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  const baseName = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename);
  const outputFile = path.join(OUTPUT_DIR, `${String(step).padStart(2, '0')}-${label}-${baseName}${ext}`);

  await fs.promises.writeFile(outputFile, content, 'utf-8');
  console.log(`  → ${outputFile}`);
}

/**
 * Run the debug tap on a file
 */
async function runDebugTap(filePath: string, selectedPlugins?: string[]): Promise<void> {
  console.log(`\n${consoleColors.blue}Debug Tap: ${filePath}${consoleColors.reset}\n`);

  // Resolve to absolute path
  const absolutePath = path.resolve(filePath);

  // Read source file
  let source: string;
  try {
    source = await fs.promises.readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(`${consoleColors.red}Error: Cannot read file ${filePath}${consoleColors.reset}`);
    process.exit(1);
  }

  // Clear output directory
  try {
    await fs.promises.rm(OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Write original file
  await writeDebugFile(0, 'original', filePath, source);

  // Determine which plugins to run
  const pluginsToRun = selectedPlugins ? PLUGIN_ORDER.filter((p) => selectedPlugins.includes(p)) : PLUGIN_ORDER;

  let currentCode = source;
  let step = 1;
  let lastHash = hash(source);

  console.log(`${consoleColors.cyan}Running plugins:${consoleColors.reset}`);

  for (const pluginName of pluginsToRun) {
    const transform = pluginTransforms[pluginName];

    if (!transform) {
      console.log(`  [${pluginName}] - no transform (skipped)`);
      continue;
    }

    try {
      const result = await transform(currentCode, absolutePath);

      if (result !== null) {
        const newHash = hash(result);

        if (newHash !== lastHash) {
          console.log(consoleColors.green, `  [${pluginName}] ${lastHash} → ${newHash}`);
          await writeDebugFile(step, pluginName, filePath, result);
          currentCode = result;
          lastHash = newHash;
          step++;
        } else {
          console.log(`  [${pluginName}] - no changes`);
        }
      } else {
        console.log(`  [${pluginName}] - returned null`);
      }
    } catch (err) {
      console.error(`  ${consoleColors.red}[${pluginName}] Error: ${err}${consoleColors.reset}`);
    }
  }

  // Write final output
  await writeDebugFile(step, 'final', filePath, currentCode);

  console.log(`\n${consoleColors.green}Debug output written to ${OUTPUT_DIR}/${consoleColors.reset}\n`);
}

// ============================================================================
// CLI Parsing
// ============================================================================

function printUsage(): void {
  console.log(`
${consoleColors.cyan}Debug Tap Utility${consoleColors.reset}

Usage:
  bun framework/compiler/debug-tap.ts <file-path> [options]

Options:
  --plugins=p1,p2   Only run specific plugins (comma-separated)
  --help            Show this help message

Examples:
  bun framework/compiler/debug-tap.ts apps/client/components/test.ts
  bun framework/compiler/debug-tap.ts apps/client/pages/landing.ts --plugins=reactiveBinding

Available transform plugins:
  reactiveBinding   - Compiles signal bindings and conditionals

Non-transform plugins (informational only):
  typeCheck, routesPrecompiler, componentPrecompiler, registerComponentStripper,
  globalCssBundler, htmlBootstrapInjector, minification, deadCodeEliminator, postBuild
`);
}

// Parse args
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  printUsage();
  process.exit(0);
}

const filePath = args.find((a) => !a.startsWith('--'));
const pluginsArg = args.find((a) => a.startsWith('--plugins='));
const selectedPlugins = pluginsArg ? pluginsArg.replace('--plugins=', '').split(',') : undefined;

if (!filePath) {
  console.error(`${consoleColors.red}Error: No file path provided${consoleColors.reset}`);
  printUsage();
  process.exit(1);
}

// Run
runDebugTap(filePath, selectedPlugins);
