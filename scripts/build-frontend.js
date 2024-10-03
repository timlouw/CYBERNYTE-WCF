const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { exec } = require('child_process');
const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');
const murmurhash = require('murmurhash');
const esbuild = require('esbuild');
const path = require('path');

// CONSOLE COLORS -------------------------------------------------------------------------------------------------------------------------------
const blueOutput = '\x1b[94m%s\x1b[0m';
const greenOutput = '\x1b[32m%s\x1b[0m';
const yellowOutput = '\x1b[33m%s\x1b[0m';

// SCRIPT ARGUMENTS -----------------------------------------------------------------------------------------------------------------------------
const environment = process.argv[2] || 'dev';
const application = process.argv[3] || 'client';
const serve = process.argv[4] || '';

// CONSTANTS ------------------------------------------------------------------------------------------------------------------------------------
const isProd = environment === 'prod';

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

let totalBundleSizeInBytes = 0;

const serverPort = 4200;
const hotReloadListener = "<script>new EventSource('/hot-reload').onmessage = (event) => location.reload();</script>";
let serverStarted = false;
let clients = [];

// SERVER FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const startServer = () => {
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

const openLocalhostInBrowser = (url) => {
  switch (process.platform) {
    case 'darwin': // macOS
      exec(`open ${url}`);
      break;
    case 'win32': // Windows
      exec(`start ${url}`);
      break;
    case 'linux': // Linux
      exec(`xdg-open ${url}`);
      break;
    default:
      console.log('Platform not recognized. Unable to open browser automatically.');
      break;
  }
};

const setupSSE = (server) => {
  const app = serveStatic(distDir, { index: ['index.html'] });
  server.on('request', (req, res) => {
    if (req.url === '/hot-reload') {
      handleSSEConnection(req, res);
    } else {
      const gzippedFilePath = path.join(distDir, req.url) + '.gz';
      if (fs.existsSync(gzippedFilePath)) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', getContentType(req.url));
        fs.createReadStream(gzippedFilePath).pipe(res);
      } else {
        app(req, res, finalhandler(req, res));
      }
    }
  });
};

const getContentType = (url) => {
  // Add more cases as needed
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
}

const handleSSEConnection = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res,
  };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter((client) => client.id !== clientId);
  });
};

const sendReloadMessage = () => {
  clients.forEach((client) => client.res.write(`data: ${new Date().toLocaleTimeString()}\n\n`));
};

// HASHING FUNCTIONS ------------------------------------------------------------------------------------------------------------------------------
const writeHashedFileToDistFolder = (file, hashedFileName) => {
  if (isProd && serve === 'serve') {
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

const writeFile = (fileName, fileData, gzipped) => {
  logFileNameAndSize(fileName, fileData);

  fs.writeFile(`${distDir}/${fileName}${gzipped ? '.gz' : ''}`, fileData, 'utf8', (writeErr) => {
    if (writeErr) throw writeErr;
  });
};

const logFileNameAndSize = (fileName, fileData) => {
  const sizeInBytes = Buffer.byteLength(fileData, 'utf8');
  totalBundleSizeInBytes += sizeInBytes;
  const sizeInKilobytes = sizeInBytes / 1024;
  console.info(fileName, greenOutput, ` Size: ${sizeInKilobytes.toFixed(2)} KB`);
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

// File processing functions ------------------------------------------------------------------------------------------------------------------------
const processAllFiles = (files) => {
  for (const file of files) {
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
};

// DIRECTORY MANIPULATION FUNCTIONS -----------------------------------------------------------------------------------------------------------------
const initDistDirectory = () => {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
};

const copyIndexHTMLIntoDistAndStartServer = () => {
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
      .replace(hotReloadPlaceHolderText, serve === 'serve' ? hotReloadListener : '');

    fs.writeFile(outputHTMLFilePath, updatedData, 'utf8', (writeErr) => {
      const sizeInBytes = Buffer.byteLength(updatedData, 'utf8');
      const sizeInKilobytes = sizeInBytes / 1024;

      totalBundleSizeInBytes += sizeInBytes;
      const totalSizeInKilobytes = totalBundleSizeInBytes / 1024;

      console.info('index.html', greenOutput, ` Size: ${sizeInKilobytes.toFixed(2)} KB`);
      console.info(greenOutput, `=== TOTAL BUNDLE SIZE: ${totalSizeInKilobytes.toFixed(2)} KB ===`);
      console.info('');

      if (serve) {
        serverStarted ? sendReloadMessage() : startServer();
      }

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
  console.info(blueOutput, 'TypeScript type checking running...');
  console.info('');

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
        processAllFiles(result.outputFiles);
        copyIndexHTMLIntoDistAndStartServer();
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


// Unique ID PLUGINs ------------------------------------------------------------------------------------------------------------------------
const customElementUniqueIdGeneratorPlugin = {
  name: 'element-unique-id-generator-plugin',
  setup(build) {
    let customElements = new Set();

    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');

      // Step 1: Collect custom element names
      const registerComponentRegex = /registerComponent\(\s*{[^}]*name:\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = registerComponentRegex.exec(source)) !== null) {
        customElements.add(match[1]);
      }

      let modifiedSource = source;

      // Step 2: Inject uniqueID variable at the start of each class
      const classRegex = /class\s+extends\s+Component\s*{/g;
      modifiedSource = modifiedSource.replace(classRegex, (match) => {
        return `${match}\n  uniqueID = this.getAttribute('data-id');\n`;
      });

      // Step 3: Modify HTML inside template literals and process custom elements and @click events
      const templateLiteralRegex = /html`([\s\S]*?)`/g;
      let templateMatch;
      let clickListeners = [];

      while ((templateMatch = templateLiteralRegex.exec(modifiedSource)) !== null) {
        let templateContent = templateMatch[1];

        // Step 4: Add unique `data-id` only to custom elements
        customElements.forEach((customElement) => {
          const customElementRegex = new RegExp(`<${customElement}([^>]*)>`, 'g');
          templateContent = templateContent.replace(customElementRegex, (match, attrs) => {
            const randomId = generateRandomId();
            if (!attrs.includes('data-id')) {
              return `<${customElement} ${attrs.trim()} data-id="${randomId}">`;
            }
            return match; // Skip if data-id is already present
          });
        });

        // Step 5: Check for @click events and replace them with `click-id`
        const clickEventRegex = /@click="([^"]+)"/g;
        let clickMatch;
        let clickCounter = 0;

        while ((clickMatch = clickEventRegex.exec(templateContent)) !== null) {
          clickCounter++;
          const uniqueClickId = '${this.uniqueID}-click-' + clickCounter;
          const handler = clickMatch[1].trim().slice(2, -1);
          clickListeners.push({ clickId: uniqueClickId, handler: handler });
          templateContent = templateContent.replace(clickMatch[0], 'click-id="' + uniqueClickId + '"');
        }

        // Replace the original template literal in the source code with the modified one
        modifiedSource = modifiedSource.replace(templateMatch[1], templateContent);
      }

      const classTwoRegex = /class\s+extends\s+Component\s*{/g;
      console.log("args.path", args.path)
      modifiedSource = modifiedSource.replace(classTwoRegex, (match) => {
        const bindListenersFunction = `
          bindClickListeners = () => {
            ${clickListeners.map((listener, counter) => {
              return `
                const element${counter} = this.shadowRoot.querySelector(\`[click-id="${listener.clickId}"]\`);
                if (element${counter}) {
                  element${counter}.addEventListener('click', ${listener.handler});
                }
              `.trim();
            }).join('\n')}
          };
        `;

        return `
          ${match}\n
          ${bindListenersFunction}
          ;\n
        `;
      });

      return {
        contents: modifiedSource,
        loader: 'ts',
      };
    });
  },
};

const generateRandomId = () => {
  return `id-${Math.random().toString(36).substring(2, 15)}`;
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
  plugins: [tscTypeCheckingPlugin, customHashingPlugin, customElementUniqueIdGeneratorPlugin],
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

// MAIN EXECUTION AND SERVER -------------------------------------------------------------------------------------------------------------------------------------------

(async () => {
  console.info(blueOutput, `Running ${environment} build...`);

  const buildConfig = isProd ? ProdConfig : DevConfig;

  if (isProd && serve !== 'serve') {
    await esbuild.build(buildConfig).catch(() => process.exit(1));
  } else {
    const ctx = await esbuild.context(buildConfig);
    await ctx.watch({}).then(() => console.info(blueOutput, 'Watching for changes...'));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
