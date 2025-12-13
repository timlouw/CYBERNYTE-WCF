import type { Application, Environment } from './types.js';

// ============================================================================
// Script Arguments
// ============================================================================

export const environment: Environment = (process.argv[2] as Environment) ?? 'dev';
export const application: Application = (process.argv[3] as Application) ?? 'client';
export const serve: boolean = !!process.argv[4];
export const isProd: boolean = environment === 'prod';

// ============================================================================
// File Names
// ============================================================================

export const indexHTMLFileName = 'index.html';
export const indexJSFileName = 'index.js';
export const indexCSSFileName = 'index.css';
export const routerJSFileName = 'router.js';

// ============================================================================
// Paths
// ============================================================================

export const distDir = `./dist/${application}`;
export const assetsInputDir = `./apps/${application}/assets`;
export const assetsOutputDir = `./dist/${application}/assets`;
export const inputHTMLFilePath = `./apps/${indexHTMLFileName}`;
export const outputHTMLFilePath = `${distDir}/${indexHTMLFileName}`;
export const entryPoints: string[] = [`./apps/${application}/index.ts`, `./apps/${application}/router/router.ts`];
