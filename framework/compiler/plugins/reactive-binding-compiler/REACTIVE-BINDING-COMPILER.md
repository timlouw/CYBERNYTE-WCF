# Reactive Binding Compiler Plugin

## Overview

The Reactive Binding Compiler transforms signal expressions in templates (`${this.count()}`) into efficient, fine-grained DOM bindings. Instead of re-rendering entire templates when data changes, it creates targeted updates to specific DOM elements.

---

## 🎯 What Problem Does It Solve?

Without reactive bindings, updating a signal would require re-rendering the entire template:

```typescript
// Inefficient: Re-render everything on each change
html`<div>
  <h1>Title</h1>
  <p>Count: ${this.count()}</p>  <!-- Only this changes -->
  <p>Name: ${this.name()}</p>    <!-- Only this changes -->
  <footer>Static content</footer>
</div>`
```

With reactive bindings, only the specific values update:

```typescript
// Efficient: Only bound elements update
static template = `<div>
  <h1>Title</h1>
  <p id="r0">Count: 0</p>       <!-- Updates via __bindText -->
  <p id="r1">Name: John</p>      <!-- Updates via __bindText -->
  <footer>Static content</footer>
</div>`

initializeBindings() {
  __bindText(this.shadowRoot, this.count, 'r0');
  __bindText(this.shadowRoot, this.name, 'r1');
}
```

---

## 📦 Key Types

### `SignalExpression`

Captures a single reactive value in your template:

```typescript
interface SignalExpression {
  signalName: string;      // e.g., "count"
  fullExpression: string;  // e.g., "this.count()"
  start: number;           // Position in source where expression starts
  end: number;             // Position in source where expression ends
}
```

**Example:**
```typescript
// In your component:
html`<span>${this.count()}</span>`
//         ^^^^^^^^^^^^^^^
//         This becomes a SignalExpression:

{
  signalName: "count",
  fullExpression: "this.count()",
  start: 15,
  end: 28
}
```

---

### `TemplateInfo`

Captures an entire `html`\`...\`` template:

```typescript
interface TemplateInfo {
  node: TaggedTemplateExpression;  // The AST node for html`...`
  expressions: SignalExpression[]; // All signal expressions inside
  templateStart: number;           // Where template starts
  templateEnd: number;             // Where template ends
}
```

---

### `ReactiveBinding`

Describes how a signal connects to a DOM element:

```typescript
interface ReactiveBinding {
  signalName: string;                           // "count"
  elementSelector: string;                      // "r0" (auto-generated ID)
  propertyType: 'style' | 'attribute' | 'innerText';
  property?: string;                            // For style: "color", for attr: "disabled"
}
```

---

### `TemplateEdit`

Represents an edit operation on the template:

```typescript
interface TemplateEdit {
  type: 'remove' | 'replace' | 'insertId';
  start: number;
  end: number;
  content?: string;    // For 'replace' type
  elementId?: string;  // For 'insertId' type
}
```

---

## 🔄 Transformation Pipeline

### Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCE CODE                                                    │
│  html`<div style="color: ${this.color()}">${this.text()}</div>` │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TemplateInfo                                                   │
│  ├─ templateStart: 0                                            │
│  ├─ templateEnd: 58                                             │
│  └─ expressions: [                                              │
│       SignalExpression { signalName: "color", ... },            │
│       SignalExpression { signalName: "text", ... }              │
│     ]                                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BINDING TYPE DETECTION                                         │
│  ├─ style="color: ${...}" → STYLE binding, property: "color"   │
│  └─ >${...}< → INNERTEXT binding                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPILED OUTPUT                                                │
│  static template = `<div id="r0" style="color: red">Hello</div>`│
│  + __bindStyle(shadowRoot, this.color, 'r0', 'color')           │
│  + __bindText(shadowRoot, this.text, 'r0')                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💡 Core Functions Explained

### `findHtmlTemplates()`

Finds all `html` tagged template literals and extracts signal expressions:

```typescript
// Input:
html`<div>${this.count()}</div>`

// Returns:
[{
  node: /* AST node */,
  expressions: [
    { signalName: 'count', fullExpression: 'this.count()', start: 10, end: 23 }
  ],
  templateStart: 0,
  templateEnd: 30
}]
```

---

### `determineBindingType()`

Analyzes the HTML context to determine what type of binding to create:

| HTML Context | Detection Pattern | Binding Type | Property |
|--------------|-------------------|--------------|----------|
| `style="color: ${...}"` | `/style\s*=.*:([\w-]+)\s*:\s*$/` | `style` | `color` |
| `class="${...}"` | `/([\w-]+)\s*=\s*["']$/` | `attribute` | `class` |
| `>${...}</div>` | Default | `innerText` | - |

**Example:**
```typescript
// style="background-color: ${this.bg()}"
//                          ^^^^^^^^^^^^
// → { propertyType: 'style', property: 'background-color' }

// disabled="${this.isDisabled()}"
// ^^^^^^^^
// → { propertyType: 'attribute', property: 'disabled' }

// <span>${this.text()}</span>
//       ^^^^^^^^^^^^^^
// → { propertyType: 'innerText' }
```

---

### `findEnclosingElement()`

Finds the parent HTML element that contains the expression:

```typescript
// Input HTML:
<div class="outer">
  <span>${this.count()}</span>
</div>

// For expression at position of ${this.count()}:
// Returns: { tagStart: 25, tagNameEnd: 30, tagName: 'span' }
```

This is crucial for injecting the unique ID attribute.

---

### `processHtmlTemplate()`

The core transformation function that:
1. Finds all `${this.signal()}` expressions
2. Determines binding types
3. Injects unique IDs into parent elements
4. Replaces expressions with initial values
5. Generates binding metadata

```typescript
// Input:
templateContent = `<div style="color: ${this.color()}">
  <span>${this.count()}</span>
</div>`
signalInitializers = Map { 'color' => 'red', 'count' => 0 }

// Output:
{
  processedContent: `<div id="r0" style="color: red">
    <span id="r1">0</span>
  </div>`,
  bindings: [
    { signalName: 'color', elementSelector: 'r0', propertyType: 'style', property: 'color' },
    { signalName: 'count', elementSelector: 'r1', propertyType: 'innerText' }
  ],
  nextId: 2
}
```

---

### `generateBindingsCode()`

Generates the binding initialization code:

```typescript
// Input bindings:
[
  { signalName: 'color', elementSelector: 'r0', propertyType: 'style', property: 'background-color' },
  { signalName: 'text', elementSelector: 'r1', propertyType: 'innerText' },
  { signalName: 'disabled', elementSelector: 'r2', propertyType: 'attribute', property: 'disabled' }
]

// Output code:
`    __bindStyle(this.shadowRoot,this.color,'r0','backgroundColor');
    __bindText(this.shadowRoot,this.text,'r1');
    __bindAttr(this.shadowRoot,this.disabled,'r2','disabled');`
```

Note: CSS property names are converted to camelCase for JavaScript style manipulation.

---

### `generateStaticTemplate()`

Creates the static template getter:

```typescript
// Input:
`<div id="r0">Hello</div>`

// Output:
`
  static template = (() => {
    const t = document.createElement('template');
    t.innerHTML = \`<div id="r0">Hello</div>\`;
    return t;
  })();`
```

---

## 📊 Complete Transformation Example

### Input Component (test.ts):

```typescript
import { Component, registerComponent } from '../framework/runtime/dom/shadow-dom.js';
import { signal } from '../framework/runtime/signal/signal.js';

export default class extends Component {
  color = signal('#ff0000');
  text = signal('Hello World');

  render = () => html`
    <div class="box" style="background-color: ${this.color()}"></div>
    <div class="box2">${this.text()}</div>
  `;

  styles = () => css`
    .box { width: 100px; height: 100px; }
    .box2 { padding: 10px; }
  `;
}

registerComponent({ selector: 'ui-test', component: 'component' });
```

### Output (After Compilation):

```typescript
import { Component, registerComponent, __bindStyle, __bindText } from '../framework/runtime/dom/index.js';
import { signal } from '../framework/runtime/signal/signal.js';

export default class extends Component {
  static template = (() => {
    const t = document.createElement('template');
    t.innerHTML = `
    <div id="r0" class="box" style="background-color: #ff0000"></div>
    <div id="r1" class="box2">Hello World</div>
  `;
    return t;
  })();

  initializeBindings = () => {
    // Auto-generated reactive bindings
    __bindStyle(this.shadowRoot,this.color,'r0','backgroundColor');
    __bindText(this.shadowRoot,this.text,'r1');
  };

  color = signal('#ff0000');
  text = signal('Hello World');

  render = () => ``;

  styles = () => `
    .box { width: 100px; height: 100px; }
    .box2 { padding: 10px; }
  `;
}

registerComponent({ selector: 'ui-test', component: 'component' });
```

---

## 🔧 Binding Functions

The plugin generates calls to these runtime binding functions:

### `__bindText(shadowRoot, signal, elementId)`

Binds a signal to an element's text content:

```typescript
// Generated:
__bindText(this.shadowRoot, this.count, 'r0');

// Runtime behavior:
// 1. Finds element with id="r0" in shadowRoot
// 2. Subscribes to signal changes
// 3. Updates element.textContent when signal changes
```

### `__bindStyle(shadowRoot, signal, elementId, property)`

Binds a signal to a CSS style property:

```typescript
// Generated:
__bindStyle(this.shadowRoot, this.color, 'r0', 'backgroundColor');

// Runtime behavior:
// 1. Finds element with id="r0"
// 2. Subscribes to signal changes
// 3. Updates element.style.backgroundColor when signal changes
```

### `__bindAttr(shadowRoot, signal, elementId, attribute)`

Binds a signal to an HTML attribute:

```typescript
// Generated:
__bindAttr(this.shadowRoot, this.disabled, 'r0', 'disabled');

// Runtime behavior:
// 1. Finds element with id="r0"
// 2. Subscribes to signal changes
// 3. Updates element.setAttribute('disabled', value) when signal changes
```

---

## 📊 Import Transformation

The plugin also updates imports to include the required binding functions:

| Before | After |
|--------|-------|
| `import { Component } from '.../shadow-dom.js'` | `import { Component, __bindText } from '.../index.js'` |
| Uses `shadow-dom.js` | Redirects to `dom/index.js` |
| No binding functions | Adds required `__bind*` functions |

---

## 🚀 Performance Benefits

| Aspect | Traditional | Reactive Bindings |
|--------|-------------|-------------------|
| Re-render scope | Entire template | Single element |
| DOM operations | Create new nodes | Update existing |
| Memory | Recreate elements | Reuse elements |
| Diffing | Required | Not needed |

### Bundle Size Impact

```
Before: Dynamic template + runtime evaluation
After:  Static template + minimal binding code
```

---

## ⚠️ Limitations

### Supported Expressions:
- ✓ `${this.signal()}`
- ✓ Style bindings: `style="prop: ${this.signal()}"`
- ✓ Attribute bindings: `attr="${this.signal()}"`
- ✓ Text content: `<span>${this.signal()}</span>`

### Not Supported:
- ✗ Computed expressions: `${this.a() + this.b()}`
- ✗ Function calls: `${this.format(this.value())}`
- ✗ Ternary operators: `${this.active() ? 'yes' : 'no'}`
- ✗ Array mapping: `${this.items().map(...)}`

For complex cases, create a computed signal or handle in the component logic.

---

## 🔧 Plugin Configuration

The plugin processes all `.ts` files that:
1. Extend `Component` class
2. Contain `html` tagged template literals

**Automatic detection:**
```typescript
// Quick string checks before AST parsing:
if (!extendsComponent(source) || !hasHtmlTemplates(source)) {
  return undefined; // Skip file
}
```
