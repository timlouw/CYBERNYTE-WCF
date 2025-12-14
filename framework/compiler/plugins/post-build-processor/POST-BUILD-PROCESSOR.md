# Post Build Processor Plugin

## Overview

The Post Build Processor handles all post-compilation tasks: cleaning the output directory, copying static assets, updating `index.html` with hashed filenames, printing bundle size reports, and optionally starting a development server.

---

## 🎯 What Problem Does It Solve?

After esbuild compiles TypeScript to JavaScript, several tasks remain:

1. **Output Cleanup**: Remove stale files from previous builds
2. **Asset Copying**: Static files (images, fonts, etc.) need to be in the dist folder
3. **HTML Updates**: `index.html` must reference the correct hashed JS filenames
4. **Size Reporting**: Developers need to see bundle sizes
5. **Dev Server**: For local development, a server is needed

This plugin automates all of these.

---

## 📦 Key Concepts

### Build Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  onStart (Before Build)                                         │
│  ├─ Clear source cache                                          │
│  ├─ Delete dist/ directory                                      │
│  └─ Create fresh dist/ directory                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  esbuild compiles TypeScript → JavaScript                       │
│  (Other plugins run during this phase)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  onEnd (After Build)                                            │
│  ├─ Copy assets to dist/                                        │
│  ├─ Process metafile (extract filenames & sizes)               │
│  ├─ Update index.html with hashed filenames                    │
│  ├─ Print bundle size report                                    │
│  └─ Start dev server (if serve mode)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Transformation Pipeline

### Phase 1: Pre-Build Cleanup (`onStart`)

```typescript
build.onStart(async () => {
  sourceCache.clear();  // Clear AST cache from previous build
  
  if (fs.existsSync(distDir)) {
    await fs.promises.rm(distDir, { recursive: true });
  }
  await fs.promises.mkdir(distDir, { recursive: true });
});
```

**Why clean every build?**
- Prevents stale files from previous builds
- Ensures reproducible builds
- Removes renamed/deleted outputs

---

### Phase 2: Asset Copying (`onEnd`)

Static assets are copied from `apps/client/assets/` to `dist/assets/`:

```
apps/client/assets/          dist/assets/
├─ images/          →        ├─ images/
│  └─ logo.png              │  └─ logo.png
├─ fonts/           →        ├─ fonts/
│  └─ inter.woff2           │  └─ inter.woff2
└─ favicon.ico      →        └─ favicon.ico
```

**Two modes:**

| Mode | Behavior |
|------|----------|
| Production (`serve=false`) | One-time copy |
| Development (`serve=true`) | Watch & sync changes |

---

### Phase 3: Metafile Processing

esbuild provides a metafile with output information:

```typescript
// metafile.outputs structure:
{
  "dist/index-A1B2C3D4.js": {
    bytes: 15234,
    entryPoint: "apps/client/index.ts"
  },
  "dist/router-E5F6G7H8.js": {
    bytes: 8456,
    entryPoint: "apps/client/router/router.ts"
  }
}
```

The plugin extracts:
- **Hashed filenames**: `index-A1B2C3D4.js`
- **Bundle sizes**: For reporting
- **Entry point mapping**: Which source → which output

---

### Phase 4: HTML Template Update

**index.html template:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>App</title>
</head>
<body>
  <script type="module" src="INDEX_JS_FILE_PLACEHOLDER"></script>
  <script type="module" src="ROUTER_JS_FILE_PLACEHOLDER"></script>
</body>
</html>
```

**After processing:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>App</title>
</head>
<body>
  <script type="module" src="index-A1B2C3D4.js"></script>
  <script type="module" src="router-E5F6G7H8.js"></script>
</body>
</html>
```

---

### Phase 5: Bundle Size Report

Color-coded console output:

```
index-A1B2C3D4.js  Size: 14.88 KB    (green - smallest)
router-E5F6G7H8.js  Size: 8.26 KB    (green)
index.html  Size: 0.45 KB             (green)
=== TOTAL BUNDLE SIZE: 23594 B ===
=== TOTAL BUNDLE SIZE: 23.04 KB ===
```

**Color coding:**

| Ratio to Max | Color |
|--------------|-------|
| < 33% | 🟢 Green |
| 33-66% | 🟡 Yellow |
| 66-85% | 🟠 Orange |
| > 85% | 🔴 Red |

---

### Phase 6: Development Server

When `serve=true`, starts an HTTP server:

```
Server running at http://localhost:4200/
```

**Features:**

| Request Type | Behavior |
|--------------|----------|
| Static file (`/assets/logo.png`) | Serve from dist |
| Route without extension (`/about`) | Serve `index.html` (SPA fallback) |
| Missing file with extension | Return 404 |

---

## 💡 Core Functions Explained

### `processMetafileAndUpdateHTML()`

Processes esbuild's output metadata:

```typescript
const processMetafileAndUpdateHTML = async (metafile: Metafile) => {
  for (const [outputPath, info] of Object.entries(metafile.outputs)) {
    const fileName = path.basename(outputPath);  // 'index-A1B2C3D4.js'
    
    // Track sizes for reporting
    totalBundleSizeInBytes += info.bytes;
    fileSizeLog.push({ fileName, sizeInBytes: info.bytes });
    
    // Match entry points to find main bundles
    if (info.entryPoint?.includes('index.ts')) {
      hashedIndexJSFileName = fileName;
    } else if (info.entryPoint?.includes('router.ts')) {
      hashedRouterJSFileName = fileName;
    }
  }
  
  await copyIndexHTMLIntoDistAndStartServer(hashedIndexJSFileName, hashedRouterJSFileName);
};
```

---

### `recursivelyCopyAssetsIntoDist()`

Recursively copies directory contents:

```typescript
const recursivelyCopyAssetsIntoDist = async (src: string, dest: string) => {
  await fs.promises.mkdir(dest, { recursive: true });
  
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await recursivelyCopyAssetsIntoDist(srcPath, destPath);  // Recurse
    } else {
      await fs.promises.copyFile(srcPath, destPath);           // Copy file
    }
  }
};
```

---

### `watchAndRecursivelyCopyAssetsIntoDist()`

Watches for asset changes in development:

```typescript
const watchAndRecursivelyCopyAssetsIntoDist = (src: string, dest: string) => {
  // Initial copy
  recursivelyCopyAssetsIntoDist(src, dest);
  
  // Watch for changes
  fs.watch(src, { recursive: true }, (eventType, filename) => {
    if (eventType === 'change') {
      // File modified → copy updated file
      fs.copyFileSync(srcPath, destPath);
    } else if (eventType === 'rename') {
      if (fs.existsSync(srcPath)) {
        // File/folder created → copy
        fs.copyFileSync(srcPath, destPath);
      } else {
        // File/folder deleted → remove from dist
        fs.rmSync(destPath, { recursive: true, force: true });
      }
    }
  });
};
```

---

### `startServer()`

Minimal HTTP server for SPA:

```typescript
const startServer = () => {
  http.createServer((req, res) => {
    const requestedPath = path.join(distDir, req.url);
    const hasFileExtension = path.extname(req.url).length > 0;
    
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      // Serve static file
      res.setHeader('Content-Type', getContentType(req.url));
      fs.createReadStream(requestedPath).pipe(res);
    }
    else if (!hasFileExtension) {
      // SPA fallback: serve index.html for routes
      res.setHeader('Content-Type', 'text/html');
      fs.createReadStream(indexPath).pipe(res);
    }
    else {
      // 404 for missing files
      res.statusCode = 404;
      res.end('Not Found');
    }
  }).listen(4200);
};
```

---

## 📊 Complete Flow Example

### Build Command:

```bash
bun run build-prod
```

### Console Output:

```
[COMPONENT] Found 5 component(s) for CTFE
[REACTIVE] Processing apps/client/pages/landing.ts
[ROUTES] Found 3 page selector(s) for CTFE injection
[STRIPPER] Removing 2 code block(s) from shadow-dom.ts

index-7X8Y9Z.js  Size: 12.45 KB
router-A1B2C3.js  Size: 6.78 KB
index.html  Size: 0.42 KB
=== TOTAL BUNDLE SIZE: 20147 B ===
=== TOTAL BUNDLE SIZE: 19.67 KB ===
```

### Generated dist/ Structure:

```
dist/
├─ index-7X8Y9Z.js
├─ router-A1B2C3.js
├─ index.html
└─ assets/
   ├─ images/
   │  └─ logo.png
   └─ fonts/
      └─ inter.woff2
```

---

## 🔧 Configuration

### Directory Paths (from config.ts):

| Variable | Value |
|----------|-------|
| `distDir` | `./dist` |
| `assetsInputDir` | `./apps/client/assets` |
| `assetsOutputDir` | `./dist/assets` |
| `inputHTMLFilePath` | `./apps/index.html` |
| `outputHTMLFilePath` | `./dist/index.html` |
| `serve` | `true` (dev) / `false` (prod) |

### Server Port:

```typescript
const serverPort = 4200;
```

---

## 🚀 Performance Considerations

### Async/Await Pattern

All file operations use async/await for non-blocking I/O:

```typescript
// Good: Non-blocking
await fs.promises.readFile(path, 'utf8');
await fs.promises.writeFile(path, content, 'utf8');
await fs.promises.copyFile(src, dest);

// Avoided: Blocking
fs.readFileSync(path, 'utf8');  // Would block event loop
```

### Streaming for Large Files

The server uses streams instead of reading entire files into memory:

```typescript
// Good: Streaming
fs.createReadStream(requestedPath).pipe(res);

// Avoided: Memory-intensive
const content = fs.readFileSync(requestedPath);
res.end(content);
```

---

## ⚠️ Notes

### SPA Fallback Logic

The server serves `index.html` for routes without file extensions:

| Request | Served |
|---------|--------|
| `/` | `index.html` |
| `/about` | `index.html` |
| `/user/123` | `index.html` |
| `/assets/logo.png` | `logo.png` |
| `/missing.js` | 404 |

This enables client-side routing to work.

### Content-Type Detection

The `getContentType()` utility determines MIME types:

| Extension | Content-Type |
|-----------|--------------|
| `.js` | `application/javascript` |
| `.css` | `text/css` |
| `.html` | `text/html` |
| `.png` | `image/png` |
| `.woff2` | `font/woff2` |
