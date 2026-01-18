/**
 * Pipeline Configuration and Runner Tests
 *
 * Tests for the compiler pipeline infrastructure.
 */

import { describe, test, expect } from 'bun:test';
import { createPipelineConfig, getEnabledPlugins, PLUGIN_ORDER, DEFAULT_PLUGIN_TOGGLES, DEV_PLUGIN_TOGGLES, type PluginToggles } from '../pipeline/index.js';

describe('Pipeline Configuration', () => {
  test('creates production config with all plugins enabled', () => {
    const config = createPipelineConfig({ environment: 'prod' });

    expect(config.environment).toBe('prod');
    expect(config.build.isProd).toBe(true);
    expect(config.plugins.minification).toBe(true);
    expect(config.plugins.deadCodeEliminator).toBe(true);
    expect(config.plugins.typeCheck).toBe(true);
  });

  test('creates development config with minification disabled', () => {
    const config = createPipelineConfig({ environment: 'dev' });

    expect(config.environment).toBe('dev');
    expect(config.build.isProd).toBe(false);
    expect(config.plugins.minification).toBe(false);
    expect(config.plugins.deadCodeEliminator).toBe(false);
    expect(config.plugins.typeCheck).toBe(true);
  });

  test('allows custom plugin overrides', () => {
    const config = createPipelineConfig({
      environment: 'prod',
      plugins: { typeCheck: false, componentPrecompiler: false },
    });

    expect(config.plugins.typeCheck).toBe(false);
    expect(config.plugins.componentPrecompiler).toBe(false);
    expect(config.plugins.reactiveBinding).toBe(true);
  });

  test('configures debug tap correctly', () => {
    const config = createPipelineConfig({
      environment: 'dev',
      debugTap: {
        enabled: true,
        outputDir: './custom-debug',
        plugins: ['reactiveBinding', 'componentPrecompiler'],
      },
    });

    expect(config.debugTap.enabled).toBe(true);
    expect(config.debugTap.outputDir).toBe('./custom-debug');
    expect(config.debugTap.plugins).toContain('reactiveBinding');
    expect(config.debugTap.plugins).toContain('componentPrecompiler');
  });

  test('sets correct paths for application', () => {
    const config = createPipelineConfig({
      environment: 'dev',
      application: 'admin',
    });

    expect(config.paths.entryPoints).toEqual(['./apps/admin/main.ts']);
    expect(config.paths.outDir).toBe('./dist/admin');
    expect(config.paths.assetsInputDir).toBe('./apps/admin/assets');
    expect(config.paths.assetsOutputDir).toBe('./dist/admin/assets');
  });

  test('configures build options correctly', () => {
    const config = createPipelineConfig({
      environment: 'prod',
      serve: true,
      gzip: true,
    });

    expect(config.build.serve).toBe(true);
    expect(config.build.gzip).toBe(true);
    expect(config.build.isProd).toBe(true);
  });
});

describe('Plugin Order', () => {
  test('PLUGIN_ORDER contains all expected plugins', () => {
    expect(PLUGIN_ORDER).toContain('typeCheck');
    expect(PLUGIN_ORDER).toContain('routesPrecompiler');
    expect(PLUGIN_ORDER).toContain('componentPrecompiler');
    expect(PLUGIN_ORDER).toContain('reactiveBinding');
    expect(PLUGIN_ORDER).toContain('registerComponentStripper');
    expect(PLUGIN_ORDER).toContain('globalCssBundler');
    expect(PLUGIN_ORDER).toContain('htmlBootstrapInjector');
    expect(PLUGIN_ORDER).toContain('minification');
    expect(PLUGIN_ORDER).toContain('deadCodeEliminator');
    expect(PLUGIN_ORDER).toContain('postBuild');
  });

  test('PLUGIN_ORDER has correct length', () => {
    expect(PLUGIN_ORDER.length).toBe(10);
  });

  test('typeCheck comes before other transforms', () => {
    const typeCheckIndex = PLUGIN_ORDER.indexOf('typeCheck');
    const reactiveIndex = PLUGIN_ORDER.indexOf('reactiveBinding');

    expect(typeCheckIndex).toBeLessThan(reactiveIndex);
  });

  test('minification comes after reactive binding', () => {
    const reactiveIndex = PLUGIN_ORDER.indexOf('reactiveBinding');
    const minificationIndex = PLUGIN_ORDER.indexOf('minification');

    expect(reactiveIndex).toBeLessThan(minificationIndex);
  });

  test('postBuild is last', () => {
    expect(PLUGIN_ORDER[PLUGIN_ORDER.length - 1]).toBe('postBuild');
  });
});

describe('getEnabledPlugins', () => {
  test('returns all plugins in prod mode', () => {
    const config = createPipelineConfig({ environment: 'prod' });
    const enabled = getEnabledPlugins(config);

    expect(enabled.length).toBe(10);
    expect(enabled).toEqual(PLUGIN_ORDER);
  });

  test('excludes minification and deadCodeEliminator in dev mode', () => {
    const config = createPipelineConfig({ environment: 'dev' });
    const enabled = getEnabledPlugins(config);

    expect(enabled).not.toContain('minification');
    expect(enabled).not.toContain('deadCodeEliminator');
    expect(enabled.length).toBe(8);
  });

  test('respects custom plugin toggles', () => {
    const config = createPipelineConfig({
      environment: 'prod',
      plugins: {
        typeCheck: false,
        routesPrecompiler: false,
      },
    });
    const enabled = getEnabledPlugins(config);

    expect(enabled).not.toContain('typeCheck');
    expect(enabled).not.toContain('routesPrecompiler');
    expect(enabled.length).toBe(8);
  });

  test('preserves plugin order when filtering', () => {
    const config = createPipelineConfig({
      environment: 'prod',
      plugins: {
        componentPrecompiler: false,
        globalCssBundler: false,
      },
    });
    const enabled = getEnabledPlugins(config);

    // Verify order is maintained
    const reactiveIndex = enabled.indexOf('reactiveBinding');
    const minificationIndex = enabled.indexOf('minification');

    expect(reactiveIndex).toBeLessThan(minificationIndex);
  });
});

describe('Default Toggles', () => {
  test('DEFAULT_PLUGIN_TOGGLES has all plugins enabled', () => {
    for (const key of Object.keys(DEFAULT_PLUGIN_TOGGLES) as (keyof PluginToggles)[]) {
      expect(DEFAULT_PLUGIN_TOGGLES[key]).toBe(true);
    }
  });

  test('DEV_PLUGIN_TOGGLES has minification disabled', () => {
    expect(DEV_PLUGIN_TOGGLES.minification).toBe(false);
    expect(DEV_PLUGIN_TOGGLES.deadCodeEliminator).toBe(false);
    expect(DEV_PLUGIN_TOGGLES.typeCheck).toBe(true);
    expect(DEV_PLUGIN_TOGGLES.reactiveBinding).toBe(true);
  });
});
