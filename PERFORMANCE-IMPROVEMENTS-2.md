# Performance Improvements Roadmap - Part 2

Based on analysis of the current dist output. Starting score: **75**

---

## 15. Remove Unused `html` Tagged Template Function Call

### Problem
The compiled output contains `return html\`\`` in the base component class:
```javascript
render(){return html``}
```
The `html` tag function doesn't exist at runtime (it's compile-time only), causing a runtime error or no-op overhead.

### Solution
Strip the `html` tag from empty template literals in the compiled output, or ensure the base class doesn't reference it.

### Implementation
**File:** `framework/runtime/dom/shadow-dom.ts`

Change the default render method:
```typescript
private render(): string {
  return ''; // Instead of html``
}
```

### Impact
- Removes potential runtime error
- Slightly smaller bundle
- Cleaner output

---

## 16. Use `defer` Instead of `type="module"` for Faster Parsing

### Problem
`type="module"` scripts are deferred by default but also parsed as ES modules which has overhead. For a single bundled file with no imports, this parsing overhead is unnecessary.

### Solution
If the bundle has no dynamic imports, output as a regular script with `defer`:
```html
<script defer src="main-HASH.js"></script>
```

### Implementation
**File:** `framework/compiler/build.ts`

Add a config option for module vs classic script output. When `format: 'iife'` is used instead of `format: 'esm'`, output classic script.

**File:** `apps/index.html`

Conditionally use:
```html
<script defer src="MAIN_JS_FILE_PLACEHOLDER"></script>
```

### Impact
- Faster script parsing
- Better compatibility with older browsers
- Reduced module resolution overhead

### Caution
Only applicable when not using code splitting or dynamic imports.

---

## 17. Reduce Variable Name Length in Minified Output

### Problem
Looking at the output, some variable names could be shorter:
```javascript
var M=Object.defineProperty;var L=(n,e,o)=>...
```
Single letters are used, but class names like `HTMLElement` extensions use longer internal names.

### Solution
Ensure esbuild's `minifyIdentifiers: true` is working optimally. Consider using `mangleProps` for private properties.

### Implementation
**File:** `framework/compiler/build.ts`

Add property mangling for internal properties:
```typescript
mangleProps: /^_/, // Mangle properties starting with _
```

### Impact
- Smaller bundle size
- Faster parsing

### Caution
Test thoroughly - property mangling can break code that uses string property access.

---

## 18. Inline Small Component Templates as Strings

### Problem
The template creation at runtime:
```javascript
l(C,"template",(()=>{let e=document.createElement("template");return e.innerHTML='...';e})())
```
This IIFE creates overhead and the function syntax adds bytes.

### Solution
Pre-create template elements at build time or simplify the template assignment:
```javascript
C.template=document.createElement("template");
C.template.innerHTML='...';
```

### Implementation
**File:** `framework/compiler/plugins/component-precompiler/component-precompiler.ts`

Optimize the template generation to avoid IIFE wrapper when possible.

### Impact
- Smaller bundle size (~20-50 bytes per component)
- Slightly faster template creation

---

## 19. Use Shorter DOM API Aliases

### Problem
The output repeatedly uses long DOM API calls:
- `document.createElement` (21 chars)
- `document.getElementById` (22 chars)
- `this.shadowRoot` (15 chars)

### Solution
Create short aliases at the top of the bundle:
```javascript
var d=document,c=d.createElement.bind(d),g=d.getElementById.bind(d);
```

### Implementation
**File:** `framework/compiler/plugins/post-build-processor/post-build-processor.ts`

Add a post-processing step that injects aliases and replaces long calls:
```javascript
// Prepend to bundle
const aliases = 'var $d=document,$c=$d.createElement.bind($d);';
```

Then replace occurrences in the bundle.

### Impact
- Significant size reduction for component-heavy apps
- Faster gzip compression (more repetition)

### Caution
Only beneficial when the calls appear many times. Calculate break-even point.

---

## 20. Lazy Initialize Signal Subscriber Sets

### Problem
Every signal creates a `new Set()` immediately:
```javascript
let o=new Set
```
Even signals that are never subscribed to allocate a Set.

### Solution
Lazily initialize the subscriber Set on first subscription:
```javascript
let subscribers;
// In subscribe:
if (!subscribers) subscribers = new Set();
subscribers.add(callback);
```

### Implementation
**File:** `framework/runtime/signal/signal.ts`

```typescript
export const signal = <T>(initialValue: T): Signal<T> => {
  let value = initialValue;
  let subscribers: Set<(val: T) => void> | null = null;

  // ... in subscribe:
  (reactiveFunction as any).subscribe = (callback, skipInitial) => {
    if (!subscribers) subscribers = new Set();
    subscribers.add(callback);
    // ...
  };
};
```

### Impact
- Reduced memory allocation for unused signals
- Faster signal creation
- Better for SSR/prerendering scenarios

---

## 21. Remove Empty Style Sheets

### ✅ RESULT: KEPT (Before: 75 → After: ~75) - Implemented Map cache for stylesheets

### Problem
Components with empty styles still create a CSSStyleSheet:
```javascript
l(_,"styles","")
```
And then:
```javascript
o.replaceSync(":host{contain:layout style;display:block}"+"")
```

### Solution
Skip stylesheet creation for components with only the containment CSS (no user styles), or share a single containment-only stylesheet.

### Implementation
**File:** `framework/runtime/dom/shadow-dom.ts`

```typescript
// Shared stylesheet for components with no custom styles
const defaultStyleSheet = new CSSStyleSheet();
defaultStyleSheet.replaceSync(':host{contain:layout style;display:block}');

// In registerComponent:
const hasCustomStyles = component.styles.trim().length > 0;
const styleSheet = hasCustomStyles 
  ? new CSSStyleSheet() 
  : defaultStyleSheet;

if (hasCustomStyles) {
  styleSheet.replaceSync(containmentCSS + component.styles);
}
```

### Impact
- Reduced memory (shared stylesheet)
- Faster component registration
- Smaller bundle (can skip empty style assignments)

---

## 22. Use `textContent` Instead of `innerHTML` for Text-Only Content

### Problem
When setting simple text content, `innerHTML` is used:
```javascript
this.shadowRoot.innerHTML=this.render()
```
For components returning just text, this triggers HTML parsing overhead.

### Solution
Detect text-only renders and use `textContent`:
```javascript
const content = this.render();
if (!content.includes('<')) {
  this.shadowRoot.textContent = content;
} else {
  this.shadowRoot.innerHTML = content;
}
```

### Implementation
**File:** `framework/runtime/dom/shadow-dom.ts`

Or better, at compile time detect if render returns HTML or plain text.

### Impact
- Faster rendering for text-only components
- Avoids HTML parser overhead

---

## 23. Batch Multiple `getElementById` Calls

### Problem
The compiled binding code makes multiple separate `getElementById` calls:
```javascript
let o=e.getElementById("b4"),a=e.getElementById("b5"),d=e.getElementById("b6")...
```

### Solution
Use a single `querySelectorAll` with an ID selector list, or traverse children once:
```javascript
const els = {};
e.querySelectorAll('[id]').forEach(el => els[el.id] = el);
// Then use els.b4, els.b5, etc.
```

### Implementation
**File:** `framework/compiler/plugins/reactive-binding-compiler/reactive-binding-compiler.ts`

Generate optimized element lookup code when multiple IDs are needed.

### Impact
- Fewer DOM queries
- Better cache utilization
- Faster component initialization

---

## 24. Use CSS Custom Properties for Dynamic Styles

### Problem
Dynamic style changes update individual style properties:
```javascript
o.style.backgroundColor=t
```
Each property change can trigger style recalculation.

### Solution
Use CSS custom properties (variables) which batch better:
```javascript
el.style.setProperty('--bg-color', value);
```
With CSS:
```css
.box { background-color: var(--bg-color); }
```

### Implementation
**File:** `framework/compiler/plugins/reactive-binding-compiler/reactive-binding-compiler.ts`

When detecting style bindings, generate CSS variable updates instead of direct style property updates.

### Impact
- Potentially fewer style recalculations
- Better animation performance
- More maintainable dynamic styles

### Caution
Requires changes to how styles are authored in components.

---

## Implementation Priority

### High Priority (Likely Impact)
1. **#21 - Remove Empty Style Sheets** - Memory + bundle size
2. **#20 - Lazy Signal Sets** - Memory optimization
3. **#15 - Remove unused html tag** - Correctness + size
4. **#18 - Inline Templates** - Bundle size

### Medium Priority
5. **#23 - Batch getElementById** - Initialization speed
6. **#19 - DOM API Aliases** - Bundle size (if many components)
7. **#22 - textContent vs innerHTML** - Render speed
8. **#17 - Property Mangling** - Bundle size

### Lower Priority (Needs Testing)
9. **#16 - defer vs module** - Parse speed (compatibility trade-off)
10. **#24 - CSS Custom Properties** - Requires style authoring changes

---

## Current Output Analysis

**Bundle: `main-I4OZFWKG.js` (4.87 KB)**

| Section | Approx Size | Notes |
|---------|-------------|-------|
| Runtime (signal, bindings) | ~1.5 KB | Core framework |
| DOM helpers | ~0.8 KB | Shadow DOM, templates |
| Component code | ~2.5 KB | User components |

**Opportunities:**
- Empty styles being processed: ~50 bytes wasted
- IIFE template wrappers: ~30 bytes per component
- Repeated `getElementById`: Could share lookup code
