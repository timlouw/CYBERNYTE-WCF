import type { Application, Environment } from './types.js';

// ============================================================================
// Script Arguments
// ============================================================================

export const environment: Environment = (process.argv[2] as Environment) ?? 'dev';
export const application: Application = (process.argv[3] as Application) ?? 'client';
export const serve: boolean = !!process.argv[4];
export const useGzip: boolean = process.argv.includes('gzip');
export const isProd: boolean = environment === 'prod';

// Debug tap: write intermediate files after each plugin step
// Usage: bun run build dev client --debug-tap
// Output: ./debug-output/{step}-{plugin}-{file}.ts
export const debugTap: boolean = process.argv.includes('--debug-tap');
export const debugTapDir: string = './debug-output';

// ============================================================================
// Paths
// ============================================================================

const indexHTMLFileName = 'index.html';

export const distDir = `./dist/${application}`;
export const assetsInputDir = `./apps/${application}/assets`;
export const assetsOutputDir = `./dist/${application}/assets`;
export const inputHTMLFilePath = `./apps/${indexHTMLFileName}`;
export const outputHTMLFilePath = `${distDir}/${indexHTMLFileName}`;

// Entry points configuration:
// - main.ts: Bootstrap entry point (renders root component, HTML injected at build time)
// - router.ts: Optional router entry point (add for SPA navigation)
// Use just main.ts for simple apps, or both for apps with routing
export const entryPoints: string[] = [`./apps/${application}/main.ts`];
