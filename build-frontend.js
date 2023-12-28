const { exec } = require('child_process');
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const murmurhash = require('murmurhash');

const environment = process.argv[2] || 'dev';
const isProd = environment === 'prod';
const application = process.argv[3] || 'client';

// CONSTANTS ------------------------------------------------------------------------------------------------------------------------------------
const distDir = `./dist/${application}`;
const assetsInputDir = `./apps/${application}/assets`;
const assetsOutputDir = `./dist/${application}/assets`;
const indexHTMLFileName = 'index.html';
const inputHTMLFilePath = `./apps/${indexHTMLFileName}`;
const outputHTMLFilePath = `${distDir}/${indexHTMLFileName}`;
const indexJSFileName = 'index.js';
const indexCSSFileName = 'index.css';
const routerJSFileName = 'router.js';
const entryPoints = [`./apps/${application}/index.ts`, `./apps/${application}/router/router.ts`];

let hashedIndexJSFileName = '';
let hashedIndexCSSFileName = '';
let hashedRouterJSFileName = '';

const hotReloadListener = "new EventSource('/esbuild').addEventListener('change', () => location.reload());";

let totalBundleSizeInBytes = 0;

// HASHING FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const writeHashedFileToDistFolder = (file, hashedFileName) => {
  const sizeInBytes = Buffer.byteLength(file.contents, 'utf8');
  totalBundleSizeInBytes += sizeInBytes;
  const sizeInKilobytes = sizeInBytes / 1024;
  console.log(hashedFileName, `\x1b[32m Size: ${sizeInKilobytes.toFixed(2)} KB \x1b[0m`);

  fs.writeFile(`${distDir}/${hashedFileName}`, file.contents, 'utf8', (writeErr) => {
    if (writeErr) throw writeErr;
  });
};

const generateQuickHash = (fileData) => {
  return murmurhash.v3(fileData, 64).toString(16);
};

const hashEntryPointFileName = (file) => {
  const fileName = path.basename(file.path);
  const fileNameWithoutExtension = fileName.slice(0, fileName.lastIndexOf('.'));
  const fileNameExtension = fileName.slice(fileName.lastIndexOf('.'));

  return `${fileNameWithoutExtension}-${generateQuickHash(file.contents)}${fileNameExtension}`;
};

// CUSTOM ESBUILD PLUGINS ------------------------------------------------------------------------------------------------------------------------
const customHashingPlugin = {
  name: 'custom-hashing-plugin',
  setup(build) {
    build.onEnd((result) => {
      totalBundleSizeInBytes = 0;
      initDistDirectory();

      if (isProd) {
        recursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      } else {
        watchAndRecursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      }

      if (result.outputFiles && result.outputFiles.length > 0) {
        for (const file of result.outputFiles) {
          // filter out all css files except index.css
          if (!file.path.includes('.css') || file.path.includes(indexCSSFileName)) {
            switch (true) {
              case file.path.includes(indexJSFileName):
                {
                  hashedIndexJSFileName = hashEntryPointFileName(file);
                  writeHashedFileToDistFolder(file, hashedIndexJSFileName);
                }
                break;
              case file.path.includes(indexCSSFileName):
                {
                  hashedIndexCSSFileName = hashEntryPointFileName(file);
                  writeHashedFileToDistFolder(file, hashedIndexCSSFileName);
                }
                break;
              case file.path.includes(routerJSFileName):
                {
                  hashedRouterJSFileName = hashEntryPointFileName(file);
                  writeHashedFileToDistFolder(file, hashedRouterJSFileName);
                }
                break;
              default: {
                const fileNameWithHash = path.basename(file.path);
                writeHashedFileToDistFolder(file, fileNameWithHash);
              }
            }
          }
        }
        copyIndexHTMLIntoDist();
      }
    });
  },
};

const tscTypeCheckingPlugin = {
  name: 'tsc-type-checking-plugin',
  setup(build) {
    build.onStart(() => typeChecker());
  },
};

// DIRECTORY MANIPULATION FUNCTIONS -----------------------------------------------------------------------------------------------------------------
const initDistDirectory = () => {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
};

const copyIndexHTMLIntoDist = () => {
  const indexCSSFilePlaceholderText = 'INDEX_CSS_FILE_PLACEHOLDER';
  const indexJSFilePlaceholderText = 'INDEX_JS_FILE_PLACEHOLDER';
  const routerJSFilePlaceholderText = 'ROUTER_JS_FILE_PLACEHOLDER';

  fs.readFile(inputHTMLFilePath, 'utf8', (readErr, data) => {
    if (readErr) throw readErr;

    let updatedData = data
      .replace(indexCSSFilePlaceholderText, hashedIndexCSSFileName)
      .replace(indexJSFilePlaceholderText, hashedIndexJSFileName)
      .replace(routerJSFilePlaceholderText, hashedRouterJSFileName);

    fs.writeFile(outputHTMLFilePath, updatedData, 'utf8', (writeErr) => {
      const sizeInBytes = Buffer.byteLength(updatedData, 'utf8');
      const sizeInKilobytes = sizeInBytes / 1024;

      totalBundleSizeInBytes += sizeInBytes;
      const totalSizeInKilobytes = totalBundleSizeInBytes / 1024;

      console.log(`index.html \x1b[32m Size: ${sizeInKilobytes.toFixed(2)} KB \x1b[0m`);
      console.log(`\x1b[32m=== TOTAL BUNDLE SIZE: ${totalSizeInKilobytes.toFixed(2)} KB === \x1b[0m`);
      console.log('');

      if (writeErr) throw writeErr;
    });
  });
};

const recursivelyCopyAssetsIntoDist = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      recursivelyCopyAssetsIntoDist(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const watchAndRecursivelyCopyAssetsIntoDist = (src, dest) => {
  recursivelyCopyAssetsIntoDist(src, dest);

  fs.watch(src, { recursive: true }, (eventType, filename) => {
    if (filename) {
      const srcPath = path.join(src, filename);
      const destPath = path.join(dest, filename);

      if (eventType === 'change') {
        if (fs.lstatSync(srcPath).isDirectory()) {
          recursivelyCopyAssetsIntoDist(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      } else if (eventType === 'rename') {
        if (fs.existsSync(srcPath)) {
          if (fs.lstatSync(srcPath).isDirectory()) {
            recursivelyCopyAssetsIntoDist(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        } else {
          if (fs.existsSync(destPath)) {
            fs.rmSync(destPath, { recursive: true, force: true });
          }
        }
      }
    }
  });
};

// TSC TYPE CHECKING FUNCTION --------------------------------------------------------------------------------------------------------------------------------
let isTscRunning = false;
const typeChecker = () => {
  if (isTscRunning) return;
  isTscRunning = true;
  console.info('TypeScript type checking running...');

  exec('tsc --noEmit', (error, stdout) => {
    isTscRunning = false;
    if (error) {
      console.error(`TypeScript type checking failed: ${error}`);
      console.error('---------------------------------------------------------------');
      console.error(stdout);
      console.error('---------------------------------------------------------------');
    }
  });
};

// ESBUILD CONFIGS ---------------------------------------------------------------------------------------------------------------------------------
const SharedConfig = {
  entryPoints: entryPoints,
  bundle: true,
  platform: 'browser',
  outdir: distDir,
  logLevel: 'error',
  splitting: true,
  format: 'esm',
  sourcemap: false,
  write: false,
  plugins: [tscTypeCheckingPlugin, customHashingPlugin],
};

// NB!! PROD AND DEV CONFIGS WILL AND SHOULD OUTPUT DIFFERENT FILE HASHES
const ProdConfig = {
  minify: true,
  ...SharedConfig,
};
const DevConfig = {
  minify: false,
  ...SharedConfig,
};

// HOT RELOAD FUNCTIONS -------------------------------------------------------------------------------------------------------------------------------------
const appendToFile = (filePath, lineToAdd) => {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  const lineIndex = lines.indexOf(lineToAdd);
  if (lineIndex > -1) return;
  lines.push(lineToAdd);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
};

const removeSpecificLineFromFile = (filePath, lineToRemove) => {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  const lineIndex = lines.indexOf(lineToRemove);
  if (lineIndex > -1) {
    lines.splice(lineIndex, 1);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
};

// MAIN EXECUTION -------------------------------------------------------------------------------------------------------------------------------------------

(async () => {
  console.log(`Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;
  const indexFilePath = path.resolve(entryPoints[0]); // allows to serve with hot reload

  if (isProd) {
    // removeSpecificLineFromFile(indexFilePath, hotReloadListener); // allows to serve with hot reload
    await esbuild.build(buildConfig).catch(() => process.exit(1));
  } else {
    // appendToFile(indexFilePath, hotReloadListener); // allows to serve with hot reload
    const ctx = await esbuild.context(buildConfig);
    await ctx.watch({}).then(() => console.log('Watching for changes...'));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
