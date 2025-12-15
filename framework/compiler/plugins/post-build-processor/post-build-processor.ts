import fs from 'fs';
import http from 'http';
import path from 'path';
import readline from 'readline';
import { Metafile, Plugin } from 'esbuild';
import { assetsInputDir, assetsOutputDir, distDir, inputHTMLFilePath, outputHTMLFilePath, serve } from '../../config.js';
import { consoleColors, ansi, PLUGIN_NAME, sourceCache, getContentType } from '../../utils/index.js';

const NAME = PLUGIN_NAME.POST_BUILD;

let totalBundleSizeInBytes = 0;
const fileSizeLog: { fileName: string; sizeInBytes: number }[] = [];

const serverPort = 4200;
let serverStarted = false;

/**
 * Post Build Plugin - Handles post-build tasks
 *
 * ## What it does:
 * 1. Cleans and recreates dist directory
 * 2. Copies assets (static files, images, etc.)
 * 3. Updates index.html with hashed JS filenames
 * 4. Prints bundle size report
 * 5. Starts dev server (if in serve mode)
 */
export const PostBuildPlugin: Plugin = {
  name: NAME,
  setup(build) {
    // Clean dist directory before each build
    build.onStart(async () => {
      // Clear source cache between builds
      sourceCache.clear();

      if (fs.existsSync(distDir)) {
        await fs.promises.rm(distDir, { recursive: true });
      }
      await fs.promises.mkdir(distDir, { recursive: true });
    });

    build.onEnd(async (result: { metafile?: Metafile }) => {
      totalBundleSizeInBytes = 0;

      if (serve) {
        watchAndRecursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      } else {
        await recursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      }

      if (result.metafile) {
        await processMetafileAndUpdateHTML(result.metafile);
      }
    });
  },
};

// METAFILE PROCESSING ----------------------------------------------------------------------------------------------------------------------------
const processMetafileAndUpdateHTML = async (metafile: Metafile): Promise<void> => {
  const outputs = metafile.outputs;
  const hashedFileNames: Record<string, string> = {
    main: '',
    router: '',
    index: '',
  };

  // Find hashed filenames from metafile and get ACTUAL file sizes from disk
  // (after minification has been applied)
  for (const [outputPath, info] of Object.entries(outputs)) {
    const fileName = path.basename(outputPath);

    // Get actual file size from disk (post-minification)
    const fullPath = path.join(distDir, fileName);
    let sizeInBytes = info.bytes; // Fallback to metafile size
    try {
      const stats = await fs.promises.stat(fullPath);
      sizeInBytes = stats.size;
    } catch {
      // File might not exist yet in some edge cases, use metafile size
    }

    totalBundleSizeInBytes += sizeInBytes;
    fileSizeLog.push({ fileName, sizeInBytes });

    // Match entry points by their source
    if (info.entryPoint) {
      if (info.entryPoint.includes('main.ts')) {
        hashedFileNames.main = fileName;
      } else if (info.entryPoint.includes('router.ts')) {
        hashedFileNames.router = fileName;
      } else if (info.entryPoint.includes('index.ts')) {
        hashedFileNames.index = fileName;
      }
    }
  }

  await copyIndexHTMLIntoDistAndStartServer(hashedFileNames);
};

const getSizeColor = (sizeInBytes: number, maxSize: number): string => {
  const ratio = sizeInBytes / maxSize;
  if (ratio < 0.33) return '\x1b[32m'; // green
  if (ratio < 0.66) return '\x1b[33m'; // yellow
  if (ratio < 0.85) return '\x1b[38;5;208m'; // orange
  return '\x1b[31m'; // red
};

const printAllFileSizes = (): void => {
  const maxSize = Math.max(...fileSizeLog.map((f) => f.sizeInBytes));
  const cyanColor = '\x1b[36m';
  const { reset } = consoleColors;

  for (const { fileName, sizeInBytes } of fileSizeLog) {
    const sizeInKilobytes = sizeInBytes / 1024;
    const sizeColor = getSizeColor(sizeInBytes, maxSize);
    console.info(`${cyanColor}${fileName}${reset}  ${sizeColor}Size: ${sizeInKilobytes.toFixed(2)} KB${reset}`);
  }
};

// HTML PROCESSING --------------------------------------------------------------------------------------------------------------------------------
const copyIndexHTMLIntoDistAndStartServer = async (hashedFileNames: Record<string, string>): Promise<void> => {
  const placeholders: Record<string, string> = {
    MAIN_JS_FILE_PLACEHOLDER: hashedFileNames.main,
    ROUTER_JS_FILE_PLACEHOLDER: hashedFileNames.router,
    INDEX_JS_FILE_PLACEHOLDER: hashedFileNames.index,
  };

  // B3: Convert to async/await
  let data = await fs.promises.readFile(inputHTMLFilePath, 'utf8');

  // Replace all placeholders with hashed filenames
  for (const [placeholder, fileName] of Object.entries(placeholders)) {
    if (fileName) {
      data = data.replace(placeholder, fileName);
    }
  }

  // Inject bootstrap HTML if available
  const { injectBootstrapHTML } = await import('../html-bootstrap-injector/html-bootstrap-injector.js');
  let updatedData = injectBootstrapHTML(data);

  // Apply selector minification to index.html (production only)
  const { minifySelectorsInHTML } = await import('../minification/minification.js');
  updatedData = minifySelectorsInHTML(updatedData);

  await fs.promises.writeFile(outputHTMLFilePath, updatedData, 'utf8');

  const sizeInBytes = Buffer.byteLength(updatedData, 'utf8');
  totalBundleSizeInBytes += sizeInBytes;
  fileSizeLog.push({ fileName: 'index.html', sizeInBytes });

  const totalSizeInKilobytes = totalBundleSizeInBytes / 1024;

  // D3: Batch console output
  printAllFileSizes();
  console.info(consoleColors.green, `=== TOTAL BUNDLE SIZE: ${totalBundleSizeInBytes.toFixed(2)} B ===`);
  console.info(consoleColors.green, `=== TOTAL BUNDLE SIZE: ${totalSizeInKilobytes.toFixed(2)} KB ===`);
  console.info('');

  fileSizeLog.length = 0;

  if (serve && !serverStarted) {
    startServer();
  }
};

// SERVER FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const promptForPort = (): Promise<number> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${ansi.yellow}Enter a different port number: ${ansi.reset}`, (answer) => {
      rl.close();
      const port = parseInt(answer, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(consoleColors.red, 'Invalid port number. Please enter a number between 1 and 65535.');
        resolve(promptForPort());
      } else {
        resolve(port);
      }
    });
  });
};

const startServer = (port: number = serverPort): void => {
  const server = http.createServer((req, res) => {
    const requestedUrl = req.url || '/';
    const requestedPath = path.join(distDir, requestedUrl);
    const indexPath = path.join(distDir, 'index.html');
    const hasFileExtension = path.extname(requestedUrl).length > 0;

    // Serve static file if it exists and is a file
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      res.setHeader('Content-Type', getContentType(requestedUrl));
      fs.createReadStream(requestedPath).pipe(res);
    }
    // SPA fallback: serve index.html for routes without file extensions (client-side routing)
    else if (!hasFileExtension) {
      res.setHeader('Content-Type', 'text/html');
      fs.createReadStream(indexPath).pipe(res);
    }
    // 404 for missing files with extensions
    else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  server.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(consoleColors.red, `Port ${port} is already in use.`);
      const newPort = await promptForPort();
      startServer(newPort);
    } else {
      throw err;
    }
  });

  const url = `http://localhost:${port}/`;
  server.listen(port, () => {
    console.info(consoleColors.yellow, `Server running at ${url}`);
    console.info('');
    console.info('');
    serverStarted = true;
  });
};

// B3: Convert to async/await
const recursivelyCopyAssetsIntoDist = async (src: string, dest: string): Promise<void> => {
  await fs.promises.mkdir(dest, { recursive: true });

  try {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await recursivelyCopyAssetsIntoDist(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  } catch {
    // Source directory might not exist
  }
};

const watchAndRecursivelyCopyAssetsIntoDist = (src: string, dest: string): void => {
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
