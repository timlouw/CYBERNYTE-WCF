// LITERAL TYPES -----------------------------------------------------------------------------------------------------------------------------
export type Application = 'client' | 'admin';
export type Environment = 'dev' | 'prod';
export type AssetsRootDirectory = 'apps' | 'dist';

// SCRIPT ARGUMENTS -----------------------------------------------------------------------------------------------------------------------------
export const environment: Environment = (process.argv[2] as any) ?? 'dev';
export const application: Application = (process.argv[3] as any) ?? 'client';
export const serve: string = (process.argv[4] as any) ?? '';
export const isProd: boolean = environment === 'prod';

// LITERALs -----------------------------------------------------------------------------------------------------------------------------
export const indexHTMLFileName = 'index.html';
export const indexJSFileName = 'index.js';
export const indexCSSFileName = 'index.css';
export const routerJSFileName = 'router.js';
export const distDir = `./dist/${application}`;
export const assetsInputDir = `./apps/${application}/assets`;
export const assetsOutputDir = `./dist/${application}/assets`;
export const inputHTMLFilePath = `./apps/${indexHTMLFileName}`;
export const outputHTMLFilePath = `${distDir}/${indexHTMLFileName}`;
export const entryPoints: string[] = [`./apps/${application}/index.ts`, `./apps/${application}/router/router.ts`];

// CONSOLE COLORS -------------------------------------------------------------------------------------------------------------------------------
export const greenOutput = '\x1b[32m%s\x1b[0m';
export const yellowOutput = '\x1b[33m%s\x1b[0m';
export const blueOutput = '\x1b[94m%s\x1b[0m';
