# Component Precompiler Plugin

## Overview

The Component Precompiler is a **TRUE Compile-Time Function Evaluation (CTFE)** plugin that evaluates component function calls at build time and replaces them with pre-generated HTML. This eliminates runtime overhead by executing component rendering logic during compilation.

---

## 🎯 What Problem Does It Solve?

Without this plugin, component function calls like `Button({ text: 'Click' })` would be evaluated at runtime:

```typescript
// Runtime evaluation (SLOW)
html`<div>${Button({ text: 'Click' })}</div>`
// Browser must: parse → evaluate function → generate HTML → insert into DOM
```

With this plugin, the HTML is pre-generated at build time:

```typescript
// Compile-time evaluation (FAST)
`<div><ui-button text="Click"></ui-button></div>`
// Browser only: parse pre-generated HTML → insert into DOM
```

---

## 📦 Key Types

### `ComponentDefinition`
Represents a component found in the codebase:

```typescript
interface ComponentDefinition {
  name: string;      // e.g., "Button"
  selector: string;  // e.g., "ui-button"
  filePath: string;  // e.g., "/libs/components/button.ts"
}
```

---

## 🔄 Transformation Pipeline

### Phase 1: Component Discovery (`onStart`)

The plugin scans the workspace for all component definitions:

```
┌─────────────────────────────────────────────────────────────────┐
│  SCAN WORKSPACE                                                 │
│  ├─ libs/components/*.ts                                        │
│  └─ apps/**/*.ts                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXTRACT COMPONENT DEFINITIONS                                  │
│  registerComponent({                                            │
│    selector: 'ui-button',  ──────────► ComponentDefinition      │
│    component: Button,                  { name: 'Button',        │
│  });                                     selector: 'ui-button'} │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: CTFE Transformation (`onLoad`)

For each source file with component calls:

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCE CODE                                                    │
│  html`<div>${Button({ text: 'Click', disabled: true })}</div>`  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AST PARSING (TypeScript)                                       │
│  ├─ Find html tagged template                                   │
│  ├─ Find CallExpression: Button(...)                           │
│  └─ Extract props: { text: 'Click', disabled: true }           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CTFE EXECUTION (Node.js vm module)                             │
│  ├─ Create sandbox with safe builtins                           │
│  ├─ Evaluate props expression at compile time                   │
│  └─ Call generateComponentHTML() during build!                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPILED OUTPUT                                                │
│  `<div><ui-button text="Click" disabled="true"></ui-button></div>`│
└─────────────────────────────────────────────────────────────────┘
```

---

## 💡 Core Functions Explained

### `createCTFEContext()`

Creates a sandboxed JavaScript execution context for compile-time evaluation:

```typescript
const createCTFEContext = (classProperties: Map<string, any>) => {
  const sandbox = {
    JSON, Math, String, Number, Boolean, Array, Object,
    parseInt, parseFloat, isNaN, isFinite,
  };
  
  // Add class properties (e.g., this.title becomes just 'title')
  for (const [key, value] of classProperties) {
    sandbox[key] = value;
  }
  
  return vm.createContext(sandbox);
};
```

**Example:**
```typescript
// Given class:
class MyPage {
  buttonText = 'Submit';
  render = () => html`${Button({ text: this.buttonText })}`;
}

// CTFE Context allows:
// - 'buttonText' resolves to 'Submit'
// - The Button call can be fully evaluated at compile time
```

---

### `evaluateExpressionCTFE()`

Evaluates AST nodes at compile time. Handles:

| Expression Type | Example | CTFE Result |
|-----------------|---------|-------------|
| String Literal | `'hello'` | `'hello'` |
| Number Literal | `42` | `42` |
| Boolean | `true` | `true` |
| Property Access | `this.title` | Resolved from class |
| Object Literal | `{ a: 1, b: 2 }` | `{ a: 1, b: 2 }` |
| Array Literal | `[1, 2, 3]` | `[1, 2, 3]` |
| Complex Expression | `this.count * 2` | Evaluated via vm |

**Example:**
```typescript
// Source:
class MyComponent {
  multiplier = 3;
  render = () => html`${Counter({ start: this.multiplier * 10 })}`;
}

// CTFE evaluates:
// 1. Resolve 'multiplier' → 3
// 2. Execute 'multiplier * 10' in vm → 30
// 3. Props become { start: 30 }
```

---

### `extractClassPropertiesCTFE()`

Extracts static class properties, handling dependencies:

```typescript
class Example {
  a = 10;                    // ✓ Direct: resolves to 10
  b = this.a + 5;            // ✓ Dependent: resolves to 15
  c = signal(0);             // ✗ Skipped: reactive/dynamic
  d = fetchData();           // ✗ Skipped: can't evaluate
}
```

**Resolution Order:**
```
Iteration 1: a = 10 ✓
Iteration 2: b = 15 (using resolved 'a') ✓
Iteration 3: No more resolvable
```

---

### `findComponentCallsCTFE()`

Finds component calls within `html` templates using AST:

```typescript
// Input:
html`
  <header>${Logo()}</header>
  <main>${Button({ text: 'Click' })}</main>
`

// Returns:
[
  {
    componentName: 'Logo',
    props: {},
    startIndex: 15,   // Position of ${Logo()}
    endIndex: 25
  },
  {
    componentName: 'Button',
    props: { text: 'Click' },
    startIndex: 45,   // Position of ${Button(...)}
    endIndex: 72
  }
]
```

---

## 📊 Complete Transformation Example

### Input Component:

```typescript
import { Component, registerComponent } from '../framework/runtime/dom/shadow-dom.js';
import { Button, Card } from '../libs/components/index.js';

export default class extends Component {
  cardTitle = 'Welcome';
  buttonLabel = 'Get Started';
  
  render = () => html`
    <div class="container">
      ${Card({ 
        title: this.cardTitle,
        content: html`
          <p>Welcome to our app!</p>
          ${Button({ text: this.buttonLabel, variant: 'primary' })}
        `
      })}
    </div>
  `;
  
  styles = () => css`
    .container { padding: 20px; }
  `;
}

registerComponent({ selector: 'ui-landing-page', component: 'page' });
```

### Output (After CTFE):

```typescript
import { Component, registerComponent } from '../framework/runtime/dom/shadow-dom.js';
import { Button, Card } from '../libs/components/index.js';

export default class extends Component {
  cardTitle = 'Welcome';
  buttonLabel = 'Get Started';
  
  render = () => `
    <div class="container">
      <ui-card title="Welcome">
        <p>Welcome to our app!</p>
        <ui-button text="Get Started" variant="primary"></ui-button>
      </ui-card>
    </div>
  `;
  
  styles = () => `
    .container { padding: 20px; }
  `;
}

registerComponent({ selector: 'ui-landing-page', component: 'page' });
```

---

## ⚠️ Limitations

### What CAN be CTFE'd:
- ✓ Static string/number/boolean literals
- ✓ Static class properties
- ✓ Simple object/array literals
- ✓ Basic arithmetic expressions
- ✓ Property dependencies (`this.b = this.a + 1`)

### What CANNOT be CTFE'd:
- ✗ Signal values (`signal(0)` - reactive)
- ✗ Async operations (`await fetch()`)
- ✗ DOM access (`document.querySelector()`)
- ✗ External imports (`import('./data.json')`)
- ✗ Spread operators (`{ ...props }`)

When CTFE fails, the component call is left as-is for runtime evaluation.

---

## 🚀 Performance Benefits

| Metric | Without CTFE | With CTFE |
|--------|--------------|-----------|
| Component calls at runtime | N per page | 0 |
| HTML parsing | Dynamic | Pre-parsed |
| Bundle contains | Function calls | Static HTML |
| First paint | Delayed | Immediate |

---

## 🔧 Plugin Configuration

The plugin runs automatically on all `.ts` files. No configuration needed.

**Files processed:**
- ✓ `apps/**/*.ts`
- ✓ `libs/**/*.ts`

**Files skipped:**
- ✗ `node_modules/**`
- ✗ `scripts/**`
- ✗ `*.d.ts`
