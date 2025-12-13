import fs from 'fs';
import http from 'http';
import path from 'path';
import { Metafile } from 'esbuild';
import { assetsInputDir, assetsOutputDir, distDir, inputHTMLFilePath, outputHTMLFilePath, serve } from '../config.js';
import { consoleColors } from '../utils/index.js';

let totalBundleSizeInBytes = 0;
const fileSizeLog: { fileName: string; sizeInBytes: number }[] = [];

const serverPort = 4200;
const hotReloadListener = "<script>new EventSource('/hot-reload').onmessage = (event) => location.reload();</script>";
let serverStarted = false;
let clients: { id: number; res: http.ServerResponse }[] = [];

export const PostBuildPlugin: { name: string; setup: (build: any) => void } = {
  name: 'post-build-plugin',
  setup(build) {
    // Clean dist directory before each build
    build.onStart(() => {
      if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true });
      }
      fs.mkdirSync(distDir, { recursive: true });
    });

    build.onEnd((result: { metafile?: Metafile }) => {
      totalBundleSizeInBytes = 0;

      if (serve) {
        watchAndRecursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      } else {
        recursivelyCopyAssetsIntoDist(assetsInputDir, assetsOutputDir);
      }

      if (result.metafile) {
        processMetafileAndUpdateHTML(result.metafile);
      }
    });
  },
};

// METAFILE PROCESSING ----------------------------------------------------------------------------------------------------------------------------
const processMetafileAndUpdateHTML = (metafile: Metafile): void => {
  const outputs = metafile.outputs;
  let hashedIndexJSFileName = '';
  let hashedRouterJSFileName = '';

  // Find hashed filenames from metafile and collect sizes
  for (const [outputPath, info] of Object.entries(outputs)) {
    const fileName = path.basename(outputPath);
    const sizeInBytes = info.bytes;
    totalBundleSizeInBytes += sizeInBytes;
    fileSizeLog.push({ fileName, sizeInBytes });

    // Match entry points by their source
    if (info.entryPoint) {
      if (info.entryPoint.includes('index.ts')) {
        hashedIndexJSFileName = fileName;
      } else if (info.entryPoint.includes('router.ts')) {
        hashedRouterJSFileName = fileName;
      }
    }
  }

  copyIndexHTMLIntoDistAndStartServer(hashedIndexJSFileName, hashedRouterJSFileName);
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
const copyIndexHTMLIntoDistAndStartServer = (hashedIndexJSFileName: string, hashedRouterJSFileName: string): void => {
  const indexJSFilePlaceholderText = 'INDEX_JS_FILE_PLACEHOLDER';
  const routerJSFilePlaceholderText = 'ROUTER_JS_FILE_PLACEHOLDER';
  const hotReloadPlaceHolderText = 'HOT_RELOAD_PLACEHOLDER';

  fs.readFile(inputHTMLFilePath, 'utf8', (readErr, data) => {
    if (readErr) throw readErr;

    let updatedData = data
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
      console.info(consoleColors.green, `=== TOTAL BUNDLE SIZE: ${totalBundleSizeInBytes.toFixed(2)} B ===`);
      console.info(consoleColors.green, `=== TOTAL BUNDLE SIZE: ${totalSizeInKilobytes.toFixed(2)} KB ===`);
      console.info('');

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
    console.info(consoleColors.yellow, `Server running at ${url}`);
    console.info('');
    console.info('');
    serverStarted = true;
  });
};

const setupSSE = (server: http.Server): void => {
  server.on('request', (req, res) => {
    if (req.url === '/hot-reload') {
      handleSSEConnection(req, res);
    } else {
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
