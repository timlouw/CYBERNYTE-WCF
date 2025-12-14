# WCF Compiler Plugins

This directory contains all esbuild plugins that power the WCF (Web Component Framework) compiler. Each plugin is organized in its own folder with detailed documentation.

---

## 📚 Plugin Overview

| Plugin | Purpose | Phase |
|--------|---------|-------|
| [TSC Type Checker](./tsc-type-checker/TSC-TYPE-CHECKER.md) | TypeScript type validation | Pre-build |
| [Routes Precompiler](./routes-precompiler/ROUTES-PRECOMPILER.md) | Inject page selectors into routes | Transform |
| [Component Precompiler](./component-precompiler/COMPONENT-PRECOMPILER.md) | CTFE for component HTML generation | Transform |
| [Reactive Binding Compiler](./reactive-binding-compiler/REACTIVE-BINDING-COMPILER.md) | Compile signal bindings to DOM ops | Transform |
| [Register Component Stripper](./register-component-stripper/REGISTER-COMPONENT-STRIPPER.md) | Remove compile-time-only code | Transform |
| [Post Build Processor](./post-build-processor/POST-BUILD-PROCESSOR.md) | Assets, HTML updates, dev server | Post-build |

---

## 🔄 Execution Order

The plugins execute in a specific order during the build process:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. TSC Type Checker (async)                                    │
│     └─ Runs tsc --noEmit in background                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Routes Precompiler                                          │
│     └─ Injects page selectors: { selector: '<ui-page/>' }      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Component Precompiler (CTFE)                                │
│     └─ ${Button({...})} → <ui-button ...></ui-button>          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Reactive Binding Compiler                                   │
│     └─ ${this.count()} → id="r0" + __bindText(...)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Register Component Stripper                                 │
│     └─ Removes CTFE return code from runtime bundle             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Post Build Processor                                        │
│     └─ Copy assets, update HTML, start server                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Plugin Categories

### Pre-build Plugins
Run before esbuild processes files:
- **TSC Type Checker**: Validates TypeScript types in parallel

### Transform Plugins
Transform source files during bundling:
- **Routes Precompiler**: CTFE for route definitions
- **Component Precompiler**: CTFE for component function calls
- **Reactive Binding Compiler**: Compiles signal expressions
- **Register Component Stripper**: Dead code elimination

### Post-build Plugins
Run after bundling is complete:
- **Post Build Processor**: File copying, HTML updates, dev server

---

## 📖 Key Concepts

### CTFE (Compile-Time Function Evaluation)

Several plugins use CTFE to execute code at build time instead of runtime:

```typescript
// Before (evaluated at RUNTIME):
html`<div>${Button({ text: 'Click' })}</div>`

// After (pre-computed at BUILD TIME):
`<div><ui-button text="Click"></ui-button></div>`
```

Benefits:
- Zero runtime overhead for static content
- Smaller bundle size
- Faster initial page load

### Reactive Bindings

The Reactive Binding Compiler transforms signal expressions into efficient DOM bindings:

```typescript
// Before:
html`<span>${this.count()}</span>`

// After:
static template = `<span id="r0">0</span>`;
initializeBindings() {
  __bindText(this.shadowRoot, this.count, 'r0');
}
```

Benefits:
- Fine-grained DOM updates
- No virtual DOM diffing
- Direct signal-to-element connections

---

## 🔧 Adding a New Plugin

1. Create a new folder: `plugins/my-plugin/`
2. Create the plugin file: `my-plugin.ts`
3. Create documentation: `MY-PLUGIN.md`
4. Create index: `index.ts` (re-export the plugin)
5. Add to `plugins/index.ts`
6. Add to `build.ts` plugin array

### Plugin Template:

```typescript
import { Plugin } from 'esbuild';
import { logger, PLUGIN_NAME, createLoaderResult } from '../../utils/index.js';

const NAME = 'my-plugin';

export const MyPlugin: Plugin = {
  name: NAME,
  setup(build) {
    // Run before build starts
    build.onStart(async () => {
      logger.info(NAME, 'Starting...');
    });

    // Transform files during build
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      
      // Transform source...
      const transformed = transformSource(source);
      
      return createLoaderResult(transformed);
    });

    // Run after build completes
    build.onEnd(async (result) => {
      logger.info(NAME, 'Complete!');
    });
  },
};
```

---

## 📁 Folder Structure

```
plugins/
├─ index.ts                           # Re-exports all plugins
├─ PLUGINS.md                         # This file
│
├─ component-precompiler/
│  ├─ component-precompiler.ts        # Plugin implementation
│  ├─ COMPONENT-PRECOMPILER.md        # Documentation
│
├─ reactive-binding-compiler/
│  ├─ reactive-binding-compiler.ts
│  ├─ REACTIVE-BINDING-COMPILER.md
│
├─ routes-precompiler/
│  ├─ routes-precompiler.ts
│  ├─ ROUTES-PRECOMPILER.md
│
├─ register-component-stripper/
│  ├─ register-component-stripper.ts
│  ├─ REGISTER-COMPONENT-STRIPPER.md
│
├─ post-build-processor/
│  ├─ post-build-processor.ts
│  ├─ POST-BUILD-PROCESSOR.md
│
└─ tsc-type-checker/
   ├─ tsc-type-checker.ts
   ├─ TSC-TYPE-CHECKER.md
```

---