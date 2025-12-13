// run_fast_perf.mjs
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import http from 'http';

/**
 * Waits for the server to be ready by polling the URL.
 * @param {string} url The URL to check.
 * @param {number} timeout Max time to wait in ms.
 * @param {number} interval Polling interval in ms.
 * @returns {Promise<void>}
 */
async function waitForServer(url, timeout = 30000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy());
      });
      return; // Server is ready
    } catch {
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

/**
 * Starts the dev server as a background process.
 * @returns {ChildProcess} The spawned server process.
 */
function startServer() {
  console.log('🚀 Starting server with bun run start-prod...');
  const isWindows = process.platform === 'win32';
  
  const spawnOptions = {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows, // Use shell on Windows to properly handle bun
  };
  
  // On non-Windows, use detached to allow killing the process group
  if (!isWindows) {
    spawnOptions.detached = true;
  }

  const server = spawn('bun', ['run', 'start-prod'], spawnOptions);

  server.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[server] ${msg}`);
  });

  server.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[server] ${msg}`);
  });

  return server;
}

/**
 * Runs Lighthouse and filters the results to only essential performance metrics.
 * @param {string} url The URL to test.
 * @returns {object} A concise object of key performance metrics.
 */
async function runLighthouse(url) {
  let chrome;
  try {
    // 1. Launch a headless Chrome instance
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--disable-gpu'] });

    // 2. Run Lighthouse with minimal config
    const runnerResult = await lighthouse(
      url,
      {
        port: chrome.port,
      },
      {
        extends: 'lighthouse:default',
        settings: {
          onlyCategories: ['performance'],
          // Use desktop config for faster, consistent testing
          formFactor: 'desktop',
          screenEmulation: {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
          },
          throttlingMethod: 'simulate', // Faster than 'devtools' throttling
        },
      },
    );

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse run failed to return a valid report.');
    }

    const { lhr } = runnerResult;

    // 3. Extract the essential metrics (Core Web Vitals + Speed Index)
    const metrics = {
      // The overall performance score (0-100)
      'score': Math.round(lhr.categories.performance.score * 100),

      // Core Web Vitals (in milliseconds)
      'First Contentful Paint (FCP)': lhr.audits['first-contentful-paint'].numericValue,
      'Largest Contentful Paint (LCP)': lhr.audits['largest-contentful-paint'].numericValue,
      'Total Blocking Time (TBT)': lhr.audits['total-blocking-time'].numericValue,
      'Cumulative Layout Shift (CLS)': lhr.audits['cumulative-layout-shift'].numericValue,

      // Key Speed Metrics (in milliseconds)
      'Speed Index': lhr.audits['speed-index'].numericValue,
      'Time to Interactive (TTI)': lhr.audits['interactive'].numericValue,
    };

    return metrics;
  } catch (error) {
    console.error(`Lighthouse execution error: ${error.message}`);
    return null;
  } finally {
    // 4. Kill the Chrome instance
    if (chrome) {
      await chrome.kill();
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldServe = args.includes('--serve');
  const targetUrl = args.find((a) => !a.startsWith('--')) || 'http://localhost:4200';

  let serverProcess = null;

  try {
    if (shouldServe) {
      serverProcess = startServer();
      console.log('⏳ Waiting for server to be ready...');
      await waitForServer(targetUrl);
      console.log('✅ Server is ready!\n');
    }

    console.log(`⏳ Running performance test for: ${targetUrl} ...`);
  const result = await runLighthouse(targetUrl);

  if (result) {
    // Create a filename based on the current timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = `perf_results_${timestamp}.json`;
    const outputPath = path.join(process.cwd(), outputFileName);

    // Save the filtered JSON output (using fs.promises.writeFile)
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    console.log(`✅ Test complete. Minimal JSON saved to: ${outputPath}`);
    console.log('\n--- Key Metrics ---');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('❌ Failed to produce a result.');
  }
  } finally {
    // Clean up server process if we started it
    if (serverProcess) {
      console.log('\n🛑 Shutting down server...');
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
      } else {
        process.kill(-serverProcess.pid);
      }
    }
  }
}

main();
