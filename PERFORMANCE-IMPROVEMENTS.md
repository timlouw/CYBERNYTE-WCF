# Performance Improvements Roadmap

This document outlines 14 performance improvements for the CYBERNYTE-WCF framework. Each improvement includes the problem, solution, implementation details, and relevant files.

---

## 1. Add `modulepreload` for JavaScript Chunks

### ❌ RESULT: NO IMPROVEMENT (Before: 62 → After: 62)

### Problem
The HTML currently uses a standard `<script type="module">` tag. The browser must parse the HTML, discover the script, then start fetching it.

### Solution
Add `<link rel="modulepreload" href="main-HASH.js">` in the `<head>` before the script tag. This tells the browser to start fetching and parsing the module immediately during HTML parsing.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

In the `copyIndexHTMLIntoDistAndStartServer` function, after replacing placeholders, inject a modulepreload link:

```html
<link rel="modulepreload" href="main-YPZYMF6E.js" />
<script type="module" src="main-YPZYMF6E.js"></script>
```

The preload link should be dynamically generated using the same hashed filename.

### Impact
- Improves Largest Contentful Paint (LCP)
- Reduces time to interactive

---

## 2. Inline Critical CSS into HTML

### ❌ RESULT: NO IMPROVEMENT (Before: 70 → After: 70)

### Problem
Components use Shadow DOM with `adoptedStyleSheets`, but there's no visible styling until JavaScript loads and executes. This can cause Flash of Unstyled Content (FOUC).

### Solution
Extract and inline critical above-the-fold CSS directly into a `<style>` tag in the HTML `<head>`.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

Add a `<style>` block in the HTML head with:
- Body/html reset styles
- Loading indicator styles
- Any critical layout styles

```html
<style>
  html, body { margin: 0; padding: 0; min-height: 100vh; }
  body { font-family: system-ui, sans-serif; background: #061219; color: #fff; }
</style>
```

### Impact
- Improves First Contentful Paint (FCP)
- Eliminates FOUC

---

## 3. Add `dns-prefetch` and `preconnect` Hints

### ⏭️ SKIPPED - No external APIs/CDNs used in current app

### Problem
If the app connects to external APIs or CDNs, DNS resolution and connection establishment add latency.

### Solution
Add resource hints for any external origins the app will connect to.

### Implementation
**File:** `apps/index.html` (source template)

Add in `<head>`:
```html
<!-- Add these for any external APIs/CDNs used -->
<link rel="dns-prefetch" href="//api.example.com" />
<link rel="preconnect" href="https://api.example.com" crossorigin />
```

Consider making this configurable in the build config if external origins vary per environment.

### Impact
- Reduces Time to First Byte (TTFB) for API calls
- Parallelizes connection setup with page load

---

## 4. Inline Small JS Bundle Directly into HTML

### ❌ RESULT: NO IMPROVEMENT (Before: 62 → After: 62) - Bundle size 117KB exceeded 15KB threshold

### Problem
The current bundle is only ~4.8KB. Loading it as a separate file requires an additional HTTP request, adding latency.

### Solution
For bundles under a configurable threshold (e.g., 15KB), inline the entire JavaScript directly into the HTML within a `<script type="module">` tag.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

Add logic to:
1. Check bundle size against threshold (configurable in `config.ts`)
2. If under threshold, read the JS content and inline it:

```html
<script type="module">
// Inlined bundle content here
var M=Object.defineProperty;...
</script>
```

3. If over threshold, keep the external script reference

**File:** `framework/compiler/config.ts`

Add config option:
```typescript
export const inlineJsThreshold = 15 * 1024; // 15KB
```

### Impact
- Eliminates one network round-trip
- Faster LCP for small apps
- Trade-off: Loses caching benefit (acceptable for small bundles)

---

## 5. Implement CSS Containment in Component Styles

### ✅ RESULT: IMPROVED (Before: 70 → After: 75) +5 points

### Problem
Without containment hints, the browser must consider the entire page when calculating layouts and paints for each component.

### Solution
Add CSS containment to component host elements to isolate their rendering.

### Implementation
**File:** `framework/runtime/dom/shadow-dom.ts`

In the `registerComponent` function, automatically inject containment styles into each component's stylesheet:

```typescript
const containmentCSS = ':host { contain: content; }';
styleSheet.replaceSync(containmentCSS + component.styles);
```

Or encourage users to add in their component styles:
```css
:host {
  contain: content; /* or layout style paint */
  display: block;
}
```

### Impact
- Improves rendering performance
- Reduces layout thrashing
- Better isolation for component updates

---

## 6. Pre-render Static HTML Shell in index.html

### ⏭️ SKIPPED

### Problem
The `<body></body>` is completely empty. Users see a blank page until JavaScript loads and renders.

### Solution
Add a static HTML skeleton/shell that displays immediately, then gets replaced by the app.

### Implementation
**File:** `apps/index.html`

Replace empty body with:
```html
<body>
  <div id="app-shell" style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#061219;">
    <div style="color:#fff;font-family:system-ui;">Loading...</div>
  </div>
</body>
```

**File:** `framework/runtime/dom/shadow-dom.ts` or router

When the app mounts, remove or replace the shell:
```typescript
const shell = document.getElementById('app-shell');
if (shell) shell.remove();
```

### Impact
- Immediate visual feedback
- Improved perceived performance
- Better FCP and LCP scores

---

## 7. Use `font-display: swap` for Custom Fonts

### Problem
If custom fonts are added later, they may block text rendering, causing invisible text until fonts load.

### Solution
Ensure all @font-face declarations use `font-display: swap` or `optional`.

### Implementation
**File:** Documentation/guidelines for users

When adding custom fonts, always use:
```css
@font-face {
  font-family: 'CustomFont';
  src: url('/assets/font.woff2') format('woff2');
  font-display: swap;
}
```

**File:** `framework/compiler/plugins/minification/template-minifier.ts`

Consider adding a build-time check/warning if `@font-face` is found without `font-display`.

### Impact
- Prevents invisible text during font loading
- Improves FCP

---

## 8. Fix Caching Headers in index.html

### ❌ RESULT: NO IMPROVEMENT (Before: 62 → After: 62)

### Problem
The HTML has aggressive anti-caching headers that prevent any caching:
```html
<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate...">
```

This forces browsers to re-download everything on every visit, even though JS files have content hashes.

### Solution
Remove these meta tags and configure proper caching:
- `index.html`: Short cache (5 min) or `no-cache` with revalidation
- Hashed assets (`*.js`, `*.css`): Long cache with `immutable`

### Implementation
**File:** `apps/index.html`

Remove these lines:
```html
<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, post-check=0, pre-check=0" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

In the dev server, set proper cache headers:
```typescript
// For index.html
res.setHeader('Cache-Control', 'no-cache, must-revalidate');

// For hashed assets (*.js)
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
```

### Impact
- Dramatically faster repeat visits
- Reduced server load
- Better user experience

---

## 9. Add `fetchpriority="high"` to Critical Script

### ❌ RESULT: NO IMPROVEMENT (Before: 70 → After: 70)

### Problem
The browser may not prioritize the main JavaScript bundle optimally among other resources.

### Solution
Add `fetchpriority="high"` attribute to hint that this is a critical resource.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

When generating the script tag:
```html
<script type="module" src="main-HASH.js" fetchpriority="high"></script>
```

Also add to the modulepreload link:
```html
<link rel="modulepreload" href="main-HASH.js" fetchpriority="high" />
```

### Impact
- Browser prioritizes critical JS over less important resources
- Improved LCP

---

## 10. Minify HTML Output More Aggressively

### ✅ RESULT: IMPROVED (Before: 62 → After: 70) +8 points

### Problem
The output `index.html` still contains newlines and indentation, wasting ~100+ bytes.

### Solution
Run the HTML through the existing minifier or add HTML minification to the build.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

Before writing `index.html`, minify it:
```typescript
import { minifyHTML } from '../minification/template-minifier.js';

// Before writing
updatedData = minifyHTML(updatedData);
await fs.promises.writeFile(outputHTMLFilePath, updatedData, 'utf8');
```

### Expected Result
```html
<!doctype html><html lang="en"><head><title>CYBERNYTE</title>...
```

### Impact
- Smaller HTML file
- Faster initial parse
- ~10-20% reduction in HTML size

---

## 11. Generate Pre-compressed Brotli/Gzip at Build Time

### Problem
The `useGzip` config exists, but compressing on-the-fly (especially Brotli at quality 11) is CPU-intensive and adds latency.

### Solution
Pre-generate `.br` and `.gz` files at build time so the server can serve them directly.

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

The `gzipDistFiles` function likely exists. Ensure it:
1. Creates `.gz` files with gzip level 9
2. Creates `.br` files with Brotli quality 11
3. Runs at build time, not request time

```typescript
const gzipDistFiles = async () => {
  const files = await fs.promises.readdir(distDir);
  
  for (const file of files) {
    if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
      const filePath = path.join(distDir, file);
      const content = await fs.promises.readFile(filePath);
      
      // Gzip
      const gzipped = zlib.gzipSync(content, { level: 9 });
      await fs.promises.writeFile(filePath + '.gz', gzipped);
      
      // Brotli
      const brotli = zlib.brotliCompressSync(content, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
      });
      await fs.promises.writeFile(filePath + '.br', brotli);
    }
  }
};
```

**File:** Server configuration

Configure server to serve pre-compressed files when `Accept-Encoding` header matches.

### Impact
- Zero compression latency at request time
- Optimal compression ratios
- ~70-80% size reduction for text assets

---

## 12. Add Route Prefetching for SPA Navigation

### Problem
When users navigate in the SPA, they must wait for the next page's chunk to load.

### Solution
Prefetch likely-next-page chunks when users hover over navigation links.

### Implementation
**File:** `apps/client/router/router.ts`

Add prefetch function:
```typescript
window.prefetchRoute = (path: string) => {
  const route = ROUTES[path as RoutesKeys];
  if (route && !prefetchedRoutes.has(path)) {
    prefetchedRoutes.add(path);
    route.componentModule(); // Triggers dynamic import
  }
};
```

**File:** Navigation components

On link hover/focus:
```typescript
onMouseEnter={() => window.prefetchRoute('/about')}
```

Or automatically prefetch visible links using IntersectionObserver.

### Alternative
Add `<link rel="prefetch">` tags for known routes at build time.

### Impact
- Near-instant page transitions
- Better perceived performance

---

## 13. Optimize Signal Subscription Cleanup

### ✅ RESULT: KEPT (Before: 75 → After: ~75) - Minor optimization, kept for cleaner code

### Problem
In `signal.ts`, each signal subscription creates a new closure for the unsubscribe function. Components with many bindings create many small closures, adding GC pressure.

### Solution
Use a pooled cleanup pattern or return the same unsubscribe function structure.

### Implementation
**File:** `framework/runtime/signal/signal.ts`

Option A - Reuse unsubscribe pattern:
```typescript
// Instead of creating new closure each time
return () => { subscribers.delete(callback); };

// Consider returning a reusable object
const unsub = { active: true };
// ... cleanup logic checks unsub.active
```

Option B - Batch cleanups in component:
```typescript
// In component initialization
const cleanups: (() => void)[] = [];
cleanups.push(signal.subscribe(...));
// Single cleanup call
const cleanup = () => cleanups.forEach(fn => fn());
```

**File:** `framework/runtime/dom/dom-binding.ts`

The `__bindIf` and `__bindIfExpr` already use cleanup arrays - ensure all binding functions follow this pattern consistently.

### Impact
- Reduced memory allocation
- Less GC pressure
- Better performance with many reactive bindings

---

## 14. Add `will-change` Hints for Toggled Elements

### Problem
When toggling element visibility with `display: none/''`, the browser must recalculate layouts. Without hints, this can cause jank.

### Solution
Add `will-change` CSS property to elements that will be toggled.

### Implementation
**File:** `framework/runtime/dom/dom-binding.ts`

In `__bindIf` and `__bindIfExpr`, add will-change before toggling:
```typescript
// When setting up the conditional element
if (el) {
  el.style.willChange = 'contents';
}
```

Or better, add via CSS in the template compiler:
```css
[data-conditional] {
  will-change: contents;
}
```

**File:** `framework/compiler/plugins/reactive-binding-compiler/reactive-binding-compiler.ts`

When generating conditional elements, add a class or attribute that applies will-change.

### Caution
Don't overuse `will-change` - only apply to elements that actually toggle. Remove it after animation completes if doing complex animations.

### Impact
- Smoother visibility transitions
- Browser can optimize ahead of time

---

## Implementation Priority

### High Priority (Biggest Impact)
1. **#8 - Fix Caching Headers** - Huge impact on repeat visits
2. **#4 - Inline Small Bundle** - Eliminates network round-trip
3. **#1 - modulepreload** - Easy win for LCP
4. **#10 - Minify HTML** - Quick implementation

### Medium Priority
5. **#6 - Pre-render HTML Shell** - Better perceived performance
6. **#11 - Pre-compress Assets** - Server performance
7. **#2 - Inline Critical CSS** - Better FCP
8. **#9 - fetchpriority** - Easy implementation

### Lower Priority (Incremental)
9. **#5 - CSS Containment** - Rendering optimization
10. **#12 - Route Prefetching** - Navigation UX
11. **#13 - Signal Cleanup** - Memory optimization
12. **#14 - will-change Hints** - Animation smoothness
13. **#3 - dns-prefetch** - Only if using external APIs
14. **#7 - font-display** - Only if using custom fonts

---

## Testing Checklist

After implementing each improvement:

- [ ] Run `bun run build-prod` and verify no errors
- [ ] Check dist output size
- [ ] Test in browser DevTools:
  - Network tab: verify caching, compression
  - Performance tab: check FCP, LCP, CLS
  - Lighthouse audit
- [ ] Test on slow 3G throttling
- [ ] Verify no visual regressions

---

## Metrics to Track

Before and after implementing these changes, measure:

1. **First Contentful Paint (FCP)**
2. **Largest Contentful Paint (LCP)**
3. **Time to Interactive (TTI)**
4. **Total Blocking Time (TBT)**
5. **Cumulative Layout Shift (CLS)**
6. **Bundle size (raw and compressed)**
7. **Number of network requests**
8. **Lighthouse Performance Score**
