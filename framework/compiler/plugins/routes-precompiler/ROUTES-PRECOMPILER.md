# Routes Precompiler Plugin

## Overview

The Routes Precompiler injects pre-computed page selectors into route definitions at compile time. This enables the router to render pages via `innerHTML` directly, without needing to await dynamic imports and call `module.default`.

---

## 🎯 What Problem Does It Solve?

Without this plugin, routing requires:

```typescript
// Runtime: Must await import, then call module.default
const routes = [
  { path: '/', componentModule: () => import('./landing.js') }
];

// Router code:
async function navigate(route) {
  const module = await route.componentModule();  // Network request
  const html = module.default();                  // Function call
  container.innerHTML = html;                     // Finally render
}
```

With this plugin, the selector is pre-computed:

```typescript
// Compile-time: Selector already injected
const routes = [
  { 
    path: '/', 
    componentModule: () => import('./landing.js'),
    selector: '<ui-landing-page></ui-landing-page>'  // ← Injected at build time
  }
];

// Router code:
function navigate(route) {
  container.innerHTML = route.selector;  // Instant render!
  route.componentModule();               // Load module in background
}
```

---

## 📦 Key Types

### `PageSelectorInfo`

Stores the mapping between an import path and its page selector:

```typescript
interface PageSelectorInfo {
  importPath: string;  // e.g., "../pages/landing.js"
  selector: string;    // e.g., "ui-landing-page"
}
```

---

### `RouteObject`

Information needed to inject a selector into a route definition:

```typescript
interface RouteObject {
  importPath: string;   // "../pages/landing.js"
  lastPropEnd: number;  // Position after the last property
  needsComma: boolean;  // Whether to add comma before injection
}
```

---

## 🔄 Transformation Pipeline

### Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  routes.ts                                                      │
│  export const routes = [                                        │
│    { path: '/', componentModule: () => import('../pages/landing.js') }│
│  ];                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PARSE ROUTE FILE                                               │
│  ├─ Find all dynamic imports: () => import('...')              │
│  └─ Extract import paths: ['../pages/landing.js']              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  READ PAGE FILES                                                │
│  ../pages/landing.ts                                            │
│  └─ registerComponent({ selector: 'ui-landing-page', ... })    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXTRACT SELECTORS                                              │
│  Map {                                                          │
│    '../pages/landing.js' => { selector: 'ui-landing-page' }    │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  INJECT INTO ROUTES                                             │
│  { path: '/', componentModule: () => import('...'),            │
│    selector: '<ui-landing-page></ui-landing-page>' }           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💡 Core Functions Explained

### `resolvePagePath()`

Converts a route import path to the actual source file path:

```typescript
// Input:
importPath = '../pages/landing.js'
routesFilePath = 'C:/project/apps/client/router/routes.ts'

// Process:
// 1. Convert .js → .ts: '../pages/landing.ts'
// 2. Resolve relative path from routes directory

// Output:
'C:/project/apps/client/pages/landing.ts'
```

---

### `extractRouteImports()`

Scans the routes file and extracts all page selectors:

```typescript
// Input routes.ts:
export const routes = [
  { path: '/', componentModule: () => import('../pages/landing.js') },
  { path: '/about', componentModule: () => import('../pages/about.js') },
  { path: '/404', componentModule: () => import('../pages/404.js') }
];

// Process:
// 1. Find all arrow functions with import() calls
// 2. For each import path:
//    a. Resolve to .ts file path
//    b. Parse the page file
//    c. Find registerComponent({ selector: '...' })
//    d. Store selector

// Output:
Map {
  '../pages/landing.js' => { importPath: '...', selector: 'ui-landing-page' },
  '../pages/about.js' => { importPath: '...', selector: 'ui-about-page' },
  '../pages/404.js' => { importPath: '...', selector: 'ui-404-page' }
}
```

---

### `collectRouteObjects()`

Finds all route object literals that need selector injection:

```typescript
// For each object in routes array:
{
  path: '/',                                          // ✓ Found path
  componentModule: () => import('../pages/landing.js') // ✓ Found import
  // No 'selector' property → needs injection
}

// Extracts:
{
  importPath: '../pages/landing.js',
  lastPropEnd: 85,      // Position after componentModule property
  needsComma: false     // Depends on whether there's a trailing comma
}
```

---

## 📊 Complete Transformation Example

### Input Structure:

**routes.ts:**
```typescript
export const routes = [
  {
    path: '/',
    componentModule: () => import('../pages/landing.js'),
  },
  {
    path: '/about',
    componentModule: () => import('../pages/about.js'),
  },
  {
    path: '/404',
    componentModule: () => import('../pages/404.js'),
  },
];
```

**landing.ts:**
```typescript
export default class extends Component {
  render = () => html`<h1>Welcome!</h1>`;
}
registerComponent({ selector: 'ui-landing-page', component: 'page' });
```

**about.ts:**
```typescript
export default class extends Component {
  render = () => html`<h1>About Us</h1>`;
}
registerComponent({ selector: 'ui-about-page', component: 'page' });
```

**404.ts:**
```typescript
export default class extends Component {
  render = () => html`<h1>Page Not Found</h1>`;
}
registerComponent({ selector: 'ui-404-page', component: 'page' });
```

### Output (routes.ts after compilation):

```typescript
export const routes = [
  {
    path: '/',
    componentModule: () => import('../pages/landing.js'),
    selector: '<ui-landing-page></ui-landing-page>'
  },
  {
    path: '/about',
    componentModule: () => import('../pages/about.js'),
    selector: '<ui-about-page></ui-about-page>'
  },
  {
    path: '/404',
    componentModule: () => import('../pages/404.js'),
    selector: '<ui-404-page></ui-404-page>'
  },
];
```

---

## 🔧 How the Router Uses This

### Before (Without Precompilation):

```typescript
async function navigate(path: string) {
  const route = routes.find(r => r.path === path);
  if (route) {
    // Slow: Must await import and call function
    const module = await route.componentModule();
    const html = module.default(); // Assuming this returns HTML
    outlet.innerHTML = html;
  }
}
```

### After (With Precompilation):

```typescript
function navigate(path: string) {
  const route = routes.find(r => r.path === path);
  if (route) {
    // Fast: Immediate render with pre-computed selector
    outlet.innerHTML = route.selector;
    
    // Module loads in background (for any JS functionality)
    route.componentModule();
  }
}
```

---

## 📊 Processing Order

The plugin processes route objects in **reverse order** (bottom to top) to maintain correct positions during string modification:

```typescript
// Routes array with positions:
[
  { path: '/', ... },      // Position 50-120
  { path: '/about', ... }, // Position 125-200
  { path: '/404', ... }    // Position 205-280
]

// Processing order:
// 1. /404 at position 280 (inject selector)
// 2. /about at position 200 (inject selector)
// 3. / at position 120 (inject selector)

// This prevents position shifts from affecting subsequent injections
```

---

## 🚀 Performance Benefits

| Metric | Without Precompilation | With Precompilation |
|--------|------------------------|---------------------|
| Initial page render | After import resolves | Immediate |
| Network dependency | Required before render | Parallel with render |
| Time to First Paint | Delayed | Instant |
| JavaScript execution | Before render | After render |

### Timing Comparison:

```
WITHOUT PRECOMPILATION:
User clicks → Wait for import → Execute module.default() → Render HTML
             [=====network=====][======JS======][render]

WITH PRECOMPILATION:
User clicks → Render HTML immediately → Load module in background
             [render][========module loads in background========]
```

---

## ⚠️ Limitations

### What Works:
- ✓ Static dynamic imports: `() => import('./page.js')`
- ✓ Pages with `registerComponent({ selector: '...' })`
- ✓ Multiple routes in one file

### What Doesn't Work:
- ✗ Conditional imports: `() => condition ? import('./a.js') : import('./b.js')`
- ✗ Variable import paths: `() => import(pathVariable)`
- ✗ Pages without `registerComponent`

---

## 🔧 Plugin Configuration

The plugin only processes files matching:
- File pattern: `/routes\.ts$/`
- Must be inside a `router` directory

**Example paths processed:**
- ✓ `apps/client/router/routes.ts`
- ✓ `apps/admin/router/routes.ts`

**Example paths skipped:**
- ✗ `apps/client/routes.ts` (not in router folder)
- ✗ `apps/client/router/index.ts` (wrong filename)
