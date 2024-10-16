// LITERAL TYPES -----------------------------------------------------------------------------------------------------------------------------
export type Application = 'client' | 'admin';
export type Environment = 'dev' | 'prod';
export type AssetsRootDirectory = 'apps' | 'dist';

// SCRIPT ARGUMENTS -----------------------------------------------------------------------------------------------------------------------------
export const environment: Environment = (process.argv[2] as any) ?? 'dev';
export const application: Application = (process.argv[3] as any) ?? 'client';
export const serve: string = (process.argv[4] as any) ?? '';
export const isProd: boolean = environment === 'prod';

// TEMPLATE LITERAL TYPES -----------------------------------------------------------------------------------------------------------------------------
export type IndexHTMLFileName = 'index.html';
export type IndexJSFileName = 'index.js';
export type IndexCSSFileName = 'index.css';
export type RouterJSFileName = 'router.js';

export type DistDirectory = `./dist/${Application}`;
export type AssetsDirectory = `./${AssetsRootDirectory}/${Application}/assets`;
export type InputHTMLFilePath = `./apps/${IndexHTMLFileName}`;
export type OutputHTMLFilePath = `${DistDirectory}/${IndexHTMLFileName}`;

// LITERALs -----------------------------------------------------------------------------------------------------------------------------
export const indexHTMLFileName: IndexHTMLFileName = 'index.html';
export const indexJSFileName: IndexJSFileName = 'index.js';
export const indexCSSFileName: IndexCSSFileName = 'index.css';
export const routerJSFileName: RouterJSFileName = 'router.js';
export const distDir: DistDirectory = `./dist/${application}`;
export const assetsInputDir: AssetsDirectory = `./apps/${application}/assets`;
export const assetsOutputDir: AssetsDirectory = `./dist/${application}/assets`;
export const inputHTMLFilePath: InputHTMLFilePath = `./apps/${indexHTMLFileName}`;
export const outputHTMLFilePath: OutputHTMLFilePath = `${distDir}/${indexHTMLFileName}`;
export const entryPoints: string[] = [`./apps/${application}/index.ts`, `./apps/${application}/router/router.ts`];

// CONSOLE COLORS -------------------------------------------------------------------------------------------------------------------------------
export const greenOutput = '\x1b[32m%s\x1b[0m';
export const yellowOutput = '\x1b[33m%s\x1b[0m';
export const blueOutput = '\x1b[94m%s\x1b[0m';
