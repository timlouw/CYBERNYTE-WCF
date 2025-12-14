# Register Component Stripper Plugin

## Overview

The Register Component Stripper removes compile-time-only code from the runtime bundle. Since the Component Precompiler and Routes Precompiler have already executed `registerComponent` return values at build time (CTFE), this code is no longer needed at runtime and only bloats the bundle.

---

## 🎯 What Problem Does It Solve?

The `registerComponent` function serves two purposes:

1. **Compile-time**: Returns HTML selectors for CTFE (used by other compiler plugins)
2. **Runtime**: Registers custom elements with the browser

After compilation, only the runtime functionality is needed:

```typescript
// BEFORE (in bundle - wasteful):
function registerComponent(config) {
  customElements.define(config.selector, ...);
  
  // This code is NEVER called at runtime!
  if (config.type === 'page') {
    return createComponentHTMLSelector(config.selector);  // Dead code
  }
  return (props) => generateComponentHTML(...);           // Dead code
}

// AFTER (in bundle - optimized):
function registerComponent(config) {
  customElements.define(config.selector, ...);
  // Return code stripped - smaller bundle!
}
```

---

## 📦 Key Types

### `CodeRemoval`

Describes a section of code to be removed:

```typescript
interface CodeRemoval {
  start: number;       // Start position in source
  end: number;         // End position in source
  description: string; // Human-readable description
}
```

---

## 🔄 Transformation Pipeline

### Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  shadow-dom.ts (BEFORE)                                         │
│                                                                 │
│  import { createComponentHTMLSelector } from './component-html';│
│                                                                 │
│  function registerComponent(config) {                           │
│    customElements.define(config.selector, ...);                 │
│                                                                 │
│    if (config.type === 'page') {           ──┐                 │
│      return createComponentHTMLSelector();   │ DEAD CODE       │
│    }                                         │                  │
│    return (props) => generateComponentHTML();─┘                 │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  IDENTIFY REMOVALS                                              │
│  ├─ Import: createComponentHTMLSelector                         │
│  └─ If-block: if (config.type === 'page') { ... }             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  shadow-dom.ts (AFTER)                                          │
│                                                                 │
│  // Import removed                                              │
│                                                                 │
│  function registerComponent(config) {                           │
│    customElements.define(config.selector, ...);                 │
│    // Return code stripped                                      │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💡 What Gets Removed

### 1. From `shadow-dom.ts`

#### The Return If-Block

```typescript
// REMOVED:
if (config.type === 'page') {
  return createComponentHTMLSelector(config.selector);
}
return (props) => generateComponentHTML({
  selector: config.selector,
  props: props
});
```

**Why?** This code is only executed at compile-time by:
- `ComponentPrecompilerPlugin` - generates component HTML
- `RoutesPrecompilerPlugin` - generates page selectors

At runtime, the HTML is already pre-generated and embedded in the source.

#### The Import Statement

```typescript
// REMOVED:
import { createComponentHTMLSelector } from './component-html.js';
```

**Why?** With the return code removed, this import is unused.

---

### 2. From `services/index.ts`

#### The Re-export

```typescript
// REMOVED:
export * from './component-html.js';
```

**Why?** The `component-html.js` module is only needed at compile-time. Removing the re-export prevents it from being included in the bundle.

---

## 🔧 Detection Logic

### Finding the Return If-Block

The plugin uses TypeScript AST to find the specific pattern:

```typescript
// Looking for this structure:
if (config.type === 'page') {
  return ...;
}
```

**AST Pattern Matching:**
```typescript
if (ts.isIfStatement(statement)) {
  const condition = statement.expression;
  if (
    ts.isBinaryExpression(condition) &&
    ts.isPropertyAccessExpression(condition.left) &&
    condition.left.name.text === 'type' &&          // .type
    ts.isStringLiteral(condition.right) &&
    condition.right.text === 'page'                  // === 'page'
  ) {
    // Found it! Mark for removal
  }
}
```

---

### Finding Import Statements

```typescript
// Looking for:
import { createComponentHTMLSelector } from './component-html.js';

// AST check:
if (ts.isImportDeclaration(node)) {
  const specifier = node.moduleSpecifier;
  if (specifier.text.includes('component-html')) {
    // Found component-html import
    // Check for createComponentHTMLSelector
  }
}
```

**Handling Multiple Imports:**

| Scenario | Action |
|----------|--------|
| `import { createComponentHTMLSelector } from '...'` | Remove entire import |
| `import { createComponentHTMLSelector, otherThing } from '...'` | Remove only the named import |

---

### Finding Re-exports

```typescript
// Looking for:
export * from './component-html.js';

// AST check:
if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
  if (node.moduleSpecifier.text.includes('component-html')) {
    // Mark for removal
  }
}
```

---

## 📊 Complete Transformation Example

### shadow-dom.ts BEFORE:

```typescript
import { createComponentHTMLSelector, generateComponentHTML } from './component-html.js';

export function registerComponent<T extends ComponentConfig>(config: T) {
  // Register with browser
  customElements.define(
    config.selector,
    config.component,
    config.options
  );

  // Return HTML generator for CTFE (compile-time only)
  if (config.type === 'page') {
    return createComponentHTMLSelector(config.selector);
  }

  return (props?: Record<string, unknown>) =>
    generateComponentHTML({
      selector: config.selector,
      props: props || {},
    });
}
```

### shadow-dom.ts AFTER:

```typescript
import { generateComponentHTML } from './component-html.js';

export function registerComponent<T extends ComponentConfig>(config: T) {
  // Register with browser
  customElements.define(
    config.selector,
    config.component,
    config.options
  );
  // Return code removed - function is now void
}
```

---

### services/index.ts BEFORE:

```typescript
export * from './shadow-dom.js';
export * from './component-html.js';  // Compile-time only
export * from './router.js';
```

### services/index.ts AFTER:

```typescript
export * from './shadow-dom.js';
// component-html.js export removed
export * from './router.js';
```

---

## 🚀 Bundle Size Impact

### Size Reduction Example:

| File | Before | After | Savings |
|------|--------|-------|---------|
| shadow-dom.js | 2.4 KB | 1.8 KB | ~600 B |
| component-html.js | 1.2 KB | 0 KB (tree-shaken) | 1.2 KB |
| **Total** | **3.6 KB** | **1.8 KB** | **~50%** |

### Why This Matters:

```
component-html.js contains:
├─ generateComponentHTML()   // Used at compile-time only
├─ createComponentHTMLSelector() // Used at compile-time only
├─ escapeHtml()              // Helper for above
└─ formatProps()             // Helper for above
```

All of this code is **never executed at runtime** after CTFE.

---

## 📊 Processing Order

The plugin processes code removals in **reverse order** to maintain correct positions:

```typescript
// Original source positions:
import { createComponentHTMLSelector } from '...'; // pos 0-50
...
if (config.type === 'page') { ... }                // pos 200-350

// Processing order:
// 1. Remove if-block at pos 200-350
// 2. Remove import at pos 0-50

// If we processed in forward order, removing the import would shift
// the if-block's position, causing incorrect removal.
```

---

## ⚠️ Safety Considerations

### What This Plugin Assumes:

1. **CTFE Has Run**: Component and Routes precompilers have already executed
2. **No Runtime Calls**: No runtime code calls `registerComponent().default()`
3. **Static Analysis**: Only removes patterns it can statically identify

### What This Plugin Does NOT Remove:

- ✗ User code calling `registerComponent`
- ✗ Any non-framework imports
- ✗ The `generateComponentHTML` import (may be used elsewhere)

---

## 🔧 Plugin Configuration

The plugin processes:

| File Pattern | What's Removed |
|--------------|----------------|
| `/shadow-dom\.ts$/` | Return if-block + `createComponentHTMLSelector` import |
| `/services[/\\]index\.ts$/` | `component-html.js` re-export |

No configuration needed - runs automatically on matching files.
