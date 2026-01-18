/**
 * Pipeline Index
 *
 * Exports for the compiler pipeline infrastructure.
 */

export {
  type PipelineConfig,
  type PluginToggles,
  type DebugTapConfig,
  type Environment,
  DEFAULT_PLUGIN_TOGGLES,
  DEV_PLUGIN_TOGGLES,
  DEFAULT_DEBUG_TAP,
  PLUGIN_ORDER,
  createPipelineConfig,
  getEnabledPlugins,
} from './pipeline-config.js';

export {
  type TransformFn,
  type PipelinePlugin,
  type DebugTapOutput,
  registerPipelinePlugin,
  getRegisteredPlugins,
  createPipelineRunner,
  runPluginTransform,
  runFullPipeline,
} from './pipeline-runner.js';
