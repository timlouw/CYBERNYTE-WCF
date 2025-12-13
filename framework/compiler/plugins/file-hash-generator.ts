import fs from 'fs';
import http from 'http';
import zlib from 'zlib';
// import { exec } from 'child_process';
import murmurhash from 'murmurhash';
import path from 'path';
import {
  assetsInputDir,
  assetsOutputDir,
  distDir,
  greenOutput,
  indexCSSFileName,
  indexJSFileName,
  inputHTMLFilePath,
  isProd,
  outputHTMLFilePath,
  routerJSFileName,
  serve,
  yellowOutput,
} from '../shared-config.js';

let hashedIndexJSFileName = '';
let hashedIndexCSSFileName = '';
let hashedRouterJSFileName = '';

let totalBundleSizeInBytes = 0;
const fileSizeLog: { fileName: string; sizeInBytes: number }[] = [];

const serverPort = 4200;
const hotReloadListener = "<script>new EventSource('/hot-reload').onmessage = (event) => location.reload();</script>";
let serverStarted = false;
let clients: { id: number; res: http.ServerResponse }[] = [];

export const customHashingPlugin: { name: string; setup: (build: any) => void } = {
  name: 'custom-hashing-plugin',
  setup(build) {
    build.onEnd((result: { outputFiles?: { path: string; contents: Buffer }[] }) => {
      totalBundleSizeInBytes = 0;
      initDistDirectory();

      if (serve) {
        watchAndRecursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      } else {
        recursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      }

      if (result.outputFiles && result.outputFiles.length > 0) {
        processAllFiles(result.outputFiles);
        copyIndexHTMLIntoDistAndStartServer();
      }
    });
  },
};

// HASHING FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const writeHashedFileToDistFolder = (file: { contents: Buffer }, hashedFileName: string): void => {
  if (isProd && serve) {
    zlib.gzip(file.contents, { level: zlib.constants.Z_BEST_COMPRESSION }, (err, buffer) => {
      if (err) {
        console.error('Error gzipping file:', err);
        return;
      }

      writeFile(hashedFileName, buffer, true);
    });
  } else {
    writeFile(hashedFileName, file.contents, false);
  }
};

const writeFile = (fileName: string, fileData: Buffer, gzipped: boolean): void => {
  collectFileSize(fileName, fileData);

  fs.writeFile(`${distDir}/${fileName}${gzipped ? '.gz' : ''}`, fileData, 'utf8', (writeErr) => {
    if (writeErr) throw writeErr;
  });
};

const collectFileSize = (fileName: string, fileData: Buffer): void => {
  const sizeInBytes = Buffer.byteLength(fileData, 'utf8');
  totalBundleSizeInBytes += sizeInBytes;
  fileSizeLog.push({ fileName, sizeInBytes });
};

const getSizeColor = (sizeInBytes: number, maxSize: number): string => {
  const ratio = sizeInBytes / maxSize;
  // Gradient from green (low) -> yellow (mid) -> red (high)
  if (ratio < 0.33) {
    return '\x1b[32m'; // Green
  } else if (ratio < 0.66) {
    return '\x1b[33m'; // Yellow
  } else if (ratio < 0.85) {
    return '\x1b[38;5;208m'; // Orange
  } else {
    return '\x1b[31m'; // Red
  }
};

const printAllFileSizes = (): void => {
  const maxSize = Math.max(...fileSizeLog.map((f) => f.sizeInBytes));
  const cyanColor = '\x1b[36m';
  const reset = '\x1b[0m';

  for (const { fileName, sizeInBytes } of fileSizeLog) {
    const sizeInKilobytes = sizeInBytes / 1024;
    const sizeColor = getSizeColor(sizeInBytes, maxSize);
    console.info(`${cyanColor}${fileName}${reset}  ${sizeColor}Size: ${sizeInKilobytes.toFixed(2)} KB${reset}`);
  }
};

const generateQuickHash = (fileData: Buffer): string => {
  return murmurhash.v3(fileData.toString(), 64).toString(16);
};

const hashEntryPointFileName = (file: { path: string; contents: Buffer }): string => {
  const fileName = path.basename(file.path);
  const fileNameWithoutExtension = fileName.slice(0, fileName.lastIndexOf('.'));
  const fileNameExtension = fileName.slice(fileName.lastIndexOf('.'));

  return `${fileNameWithoutExtension}-${generateQuickHash(file.contents)}${fileNameExtension}`;
};

// File processing functions ------------------------------------------------------------------------------------------------------------------------
const processAllFiles = (files: { path: string; contents: Buffer }[]): void => {
  for (const file of files) {
    if (!file.path.includes('.css') || file.path.includes(indexCSSFileName)) {
      switch (true) {
        case file.path.includes(indexJSFileName):
          hashedIndexJSFileName = hashEntryPointFileName(file);
          writeHashedFileToDistFolder(file, hashedIndexJSFileName);
          break;
        case file.path.includes(indexCSSFileName):
          hashedIndexCSSFileName = hashEntryPointFileName(file);
          writeHashedFileToDistFolder(file, hashedIndexCSSFileName);
          break;
        case file.path.includes(routerJSFileName):
          hashedRouterJSFileName = hashEntryPointFileName(file);
          writeHashedFileToDistFolder(file, hashedRouterJSFileName);
          break;
        default:
          const fileNameWithHash = path.basename(file.path);
          writeHashedFileToDistFolder(file, fileNameWithHash);
      }
    }
  }
};

// DIRECTORY MANIPULATION FUNCTIONS -----------------------------------------------------------------------------------------------------------------
const initDistDirectory = (): void => {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
};

const copyIndexHTMLIntoDistAndStartServer = (): void => {
  const indexCSSFilePlaceholderText = 'INDEX_CSS_FILE_PLACEHOLDER';
  const indexJSFilePlaceholderText = 'INDEX_JS_FILE_PLACEHOLDER';
  const routerJSFilePlaceholderText = 'ROUTER_JS_FILE_PLACEHOLDER';
  const hotReloadPlaceHolderText = 'HOT_RELOAD_PLACEHOLDER';

  fs.readFile(inputHTMLFilePath, 'utf8', (readErr, data) => {
    if (readErr) throw readErr;

    let updatedData = data
      .replace(indexCSSFilePlaceholderText, hashedIndexCSSFileName)
      .replace(indexJSFilePlaceholderText, hashedIndexJSFileName)
      .replace(routerJSFilePlaceholderText, hashedRouterJSFileName)
      .replace(hotReloadPlaceHolderText, serve ? hotReloadListener : '');

    fs.writeFile(outputHTMLFilePath, updatedData, 'utf8', (writeErr) => {
      if (writeErr) throw writeErr;

      const sizeInBytes = Buffer.byteLength(updatedData, 'utf8');
      totalBundleSizeInBytes += sizeInBytes;
      fileSizeLog.push({ fileName: 'index.html', sizeInBytes });

      const totalSizeInKilobytes = totalBundleSizeInBytes / 1024;

      printAllFileSizes();
      console.info(greenOutput, `=== TOTAL BUNDLE SIZE: ${totalBundleSizeInBytes.toFixed(2)} B ===`);
      console.info(greenOutput, `=== TOTAL BUNDLE SIZE: ${totalSizeInKilobytes.toFixed(2)} KB ===`);
      console.info('');

      // Clear the log for next build
      fileSizeLog.length = 0;

      if (serve) {
        serverStarted ? sendReloadMessage() : startServer();
      }
    });
  });
};

// SERVER FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const startServer = (): void => {
  const server = http.createServer();
  const url = `http://localhost:${serverPort}/`;
  setupSSE(server);
  server.listen(serverPort, () => {
    console.info(yellowOutput, `Server running at ${url}`);
    console.info('');
    console.info('');
    serverStarted = true;
    openLocalhostInBrowser(url);
  });
};

const openLocalhostInBrowser = (url: string): void => {
  // switch (process.platform) {
  //   case 'darwin': // macOS
  //     exec(`open ${url}`);
  //     break;
  //   case 'win32': // Windows
  //     exec(`start ${url}`);
  //     break;
  //   case 'linux': // Linux
  //     exec(`xdg-open ${url}`);
  //     break;
  //   default:
  //     console.log('Platform not recognized. Unable to open browser automatically.');
  //     break;
  // }
};

const setupSSE = (server: http.Server): void => {
  server.on('request', (req, res) => {
    if (req.url === '/hot-reload') {
      handleSSEConnection(req, res);
    } else {
      const requestedUrl = req.url || '/';
      const requestedPath = path.join(distDir, requestedUrl);
      const gzippedFilePath = requestedPath + '.gz';
      const indexPath = path.join(distDir, 'index.html');
      const hasFileExtension = path.extname(requestedUrl).length > 0;

      // Serve gzipped file if it exists
      if (fs.existsSync(gzippedFilePath) && fs.statSync(gzippedFilePath).isFile()) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', getContentType(requestedUrl));
        fs.createReadStream(gzippedFilePath).pipe(res);
      }
      // Serve static file if it exists and is a file
      else if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
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
    }
  });
};

const getContentType = (url: string): string => {
  switch (path.extname(url)) {
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.html':
      return 'text/html';
    default:
      return 'text/plain';
  }
};

const handleSSEConnection = (req: http.IncomingMessage, res: http.ServerResponse): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  clients.push({ id: clientId, res });

  req.on('close', () => {
    clients = clients.filter((client) => client.id !== clientId);
  });
};

const sendReloadMessage = (): void => {
  clients.forEach((client) => client.res.write(`data: ${new Date().toLocaleTimeString()}\n\n`));
};

const recursivelyCopyAssetsIntoDist = (src: string, dest: string): void => {
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
