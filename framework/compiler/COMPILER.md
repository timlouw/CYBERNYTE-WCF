# WCF Compiler Architecture

This document explains the compile-time processing pipeline for the Web Component Framework (WCF).

## Overview

The WCF compiler transforms source TypeScript into optimized JavaScript bundles using esbuild with custom plugins. The key innovation is **Compile-Time Function Evaluation (CTFE)** - actually executing JavaScript at build time to pre-compute values.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SOURCE CODE                                        │
│  apps/client/*.ts  →  Components, Pages, Router                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPILER PIPELINE                                     │
│  1. Type Check  →  2. Routes CTFE  →  3. Component CTFE  →  4. Reactive    │
│  5. Stripper  →  6. Post Build                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT BUNDLE                                      │
│  dist/client/  →  index.html, index-[hash].js, router-[hash].js            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Plugin Execution Order

### 1. TypeCheckPlugin (`tsc-type-checker.ts`)

**Purpose:** Validates TypeScript before any transformations.

Runs `tsc --noEmit` asynchronously to catch type errors without blocking the build.

### 2. RoutesPrecompilerPlugin (`routes-precompiler.ts`)

**Purpose:** Injects pre-computed page selectors into route definitions.

**Before:**
```typescript
export const routes = [
  { path: '/', componentModule: () => import('../pages/landing.js') }
];
```

**After:**
```typescript
export const routes = [
  { path: '/', componentModule: () => import('../pages/landing.js'),
    selector: '<ui-landing-page></ui-landing-page>' }
];
```

**How it works:**
1. Parses `routes.ts` to find dynamic imports
2. Reads each page file and extracts the selector from `registerComponent()`
3. Injects a `selector` property with pre-rendered HTML

### 3. ComponentPrecompilerPlugin (`component-precompiler.ts`)

**Purpose:** Evaluates component function calls at compile time (TRUE CTFE).

**Before:**
```typescript
html`<div>${Button({ text: 'Click me', variant: 'primary' })}</div>`
```

**After:**
```typescript
`<div><ui-button text="Click me" variant="primary"></ui-button></div>`
```

**How it works:**
1. First pass: Collects all component definitions from the codebase
2. Second pass: For each file with `html` templates:
   - Uses TypeScript AST to find component calls
   - Uses Node.js `vm` module to **actually execute** prop expressions
   - Calls the same `generateComponentHTML()` function used at runtime

### 4. ReactiveBindingPlugin (`reactive-binding-compiler.ts`)

**Purpose:** Compiles reactive signal expressions into efficient DOM bindings.

**Before:**
```typescript
class Counter extends Component {
  count = signal(0);
  render = () => html`<span>${this.count()}</span>`;
}
```

**After:**
```typescript
class Counter extends Component {
  static template = (() => {
    const t = document.createElement('template');
    t.innerHTML = `<span id="r0">0</span>`;
    return t;
  })();

  initializeBindings = () => {
    __bindText(this.shadowRoot, this.count, 'r0');
  };

  count = signal(0);
  render = () => ``;
}
```

**What it does:**
1. Finds signal getter expressions (`this.signalName()`) in templates
2. Generates unique element IDs for reactive elements
3. Replaces expressions with initial values
4. Creates binding functions that connect signals to DOM updates
5. Generates a static template for efficient cloning

### 5. RegisterComponentStripperPlugin (`register-component-stripper.ts`)

**Purpose:** Removes compile-time-only code from the runtime bundle.

**What it removes:**
- The return statement from `registerComponent()` (only needed at compile time)
- Import of `createComponentHTMLSelector` (no longer needed)
- Re-export of `component-html.js` from index files

This reduces bundle size by eliminating code that was only needed during compilation.

### 6. PostBuildPlugin (`post-build-processor.ts`)

**Purpose:** Handles post-bundling tasks.

**Tasks:**
1. Cleans and recreates dist directory
2. Copies static assets
3. Updates `index.html` with hashed JS filenames
4. Prints bundle size report
5. Starts dev server (if `--serve` flag)

## Directory Structure

```
framework/compiler/
├── build.ts              # Main entry point, esbuild configuration
├── config.ts             # Build configuration (paths, environment)
├── types.ts              # Shared TypeScript interfaces
├── plugins/
│   ├── tsc-type-checker.ts
│   ├── routes-precompiler.ts
│   ├── component-precompiler.ts
│   ├── reactive-binding-compiler.ts
│   ├── register-component-stripper.ts
│   └── post-build-processor.ts
└── utils/
    ├── index.ts          # Barrel export
    ├── colors.ts         # Console color codes
    ├── constants.ts      # Magic strings (function names, etc.)
    ├── logger.ts         # Unified logging utility
    ├── file-utils.ts     # File system helpers
    ├── ast-utils.ts      # TypeScript AST utilities
    ├── source-editor.ts  # Source code manipulation
    ├── cache.ts          # Source file cache
    └── plugin-helper.ts  # Common plugin patterns
```

## Utilities

### Source File Cache (`cache.ts`)

Caches parsed TypeScript source files to avoid re-parsing the same file across multiple plugins.

```typescript
// Get parsed source (cached after first read)
const { source, sourceFile } = await sourceCache.get('./component.ts');

// Parse modified content
const newSourceFile = sourceCache.parse(path, modifiedSource);

// Clear cache between builds
sourceCache.clear();
```

### Source Editor (`source-editor.ts`)

Utilities for modifying source code with position-based edits.

```typescript
// Apply multiple edits (automatically sorted and applied bottom-to-top)
const result = applyEdits(source, [
  { start: 10, end: 20, replacement: 'new text' },
  { start: 50, end: 60, replacement: '' }  // deletion
]);
```

### Logger (`logger.ts`)

Unified logging with consistent formatting and batching support.

```typescript
logger.info('plugin-name', 'Processing 5 files');
logger.error('plugin-name', 'Failed to parse', error);
logger.startBatch();  // Start batching
logger.flushBatch();  // Flush all batched messages
```

## Running Builds

```bash
# Development build
bun run build

# Production build (minified)
bun run build-prod

# Development with hot reload server
bun run serve
```

## Key Concepts

### Compile-Time Function Evaluation (CTFE)

CTFE means actually executing JavaScript code during compilation rather than at runtime. This allows:

- Pre-computing component HTML
- Inlining route selectors
- Resolving static expressions

The `vm` module is used to create a sandboxed context and execute expressions safely.

### TypeScript AST

All source transformations use the TypeScript compiler API for reliable parsing:

- No fragile regex patterns
- Handles formatting variations
- Preserves comments and whitespace
- Type-aware analysis

### Shadow DOM Components

Components use Shadow DOM for encapsulation. The compiler generates efficient template cloning and binding setup code.
