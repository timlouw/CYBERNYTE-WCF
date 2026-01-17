# Repeat Directive

## Overview

The `repeat` directive provides efficient list rendering with automatic keying. Unlike most frameworks where you need to explicitly provide keys, this implementation automatically generates stable keys based on item content.

**Features:**
- ✅ Automatic keying (no manual key management)
- ✅ Fragment support (multiple root elements per item)
- ✅ Empty state template
- ✅ Efficient diffing with DOM reuse

---

## 🎯 Usage

### Basic Usage

```typescript
// Basic usage with primitives
${repeat(this._items(), (item) => html`<li>${item}</li>`)}

// With index
${repeat(this._items(), (item, index) => html`<li>${index}: ${item}</li>`)}

// With objects
${repeat(this._users(), (user) => html`
  <div class="user-card">
    <h3>${user.name}</h3>
    <p>${user.email}</p>
  </div>
`)}
```

### Fragment Support (Multiple Root Elements)

```typescript
// Render multiple elements per item (no wrapper needed!)
${repeat(this._items(), (item) => html`
  <dt>${item.term}</dt>
  <dd>${item.definition}</dd>
`)}
```

### Empty State Template

```typescript
// Show fallback content when list is empty
${repeat(
  this._items(), 
  (item) => html`<li>${item}</li>`,
  html`<p class="empty">No items to display</p>`
)}
```

---

## 🔑 Automatic Keying

The framework automatically generates stable keys for items:

| Item Type | Key Generation Strategy |
|-----------|------------------------|
| Primitives (string, number) | Value itself: `__p_${value}` |
| Objects with `id` | `__id_${item.id}` |
| Objects with `key` | `__key_${item.key}` |
| Objects with `_id` | `__id_${item._id}` |
| Other objects | Index-based: `__idx_${index}` (⚠️ not stable for reordering) |
| Null/undefined | Index-based: `__null_${index}` |

**Best Practice:** For objects, always include an `id` or `key` property for optimal performance.

---

## 📦 Compilation

### Input

```typescript
render = () => {
  return html`
    <ul>
      ${repeat(this._countries(), (country) => html`<div class="item">${country}</div>`)}
    </ul>
  `;
};
```

### Output (Compiled)

```typescript
static template = (() => {
  const t = document.createElement('template');
  t.innerHTML = `<ul> <template id="b0"></template> </ul>`;
  return t;
})();

initializeBindings = () => {
  const r = this.shadowRoot;
  __bindRepeat(r, this._countries, 'b0', 
    (country) => `<div class="item">${country}</div>`,
    (el, country) => []
  );
};
```

---

## 🔄 Runtime Behavior

### Initial Render
1. Template anchor (`<template id="b0">`) is placed in the DOM
2. `__bindRepeat` is called with the signal, anchor ID, and template function
3. Initial items are rendered and inserted before the anchor

### Updates
When the signal changes:
1. New keys are generated for all items
2. Items no longer present are removed (with cleanup)
3. New items are created and inserted in correct position
4. Existing items are reordered if needed (moved, not recreated)

### Diffing Algorithm
The diffing uses a simple but efficient approach:
- Process items in reverse order for correct `insertBefore` positioning
- Reuse existing DOM elements when keys match
- Only move elements when position changes
- Create new elements only for new items

---

## � Updating Arrays

Signals use **immutable updates** - you must set a new array reference to trigger re-renders.

### Adding Items

```typescript
// ❌ WRONG - mutating the array doesn't trigger an update
this._items().push('new item');

// ✅ CORRECT - create a new array
this._items([...this._items(), 'new item']);
```

### Removing Items

```typescript
// ✅ Filter creates a new array
this._items(this._items().filter(item => item !== 'remove me'));
```

### Updating an Item

```typescript
// ✅ Map creates a new array
this._items(this._items().map(item => 
  item.id === targetId ? { ...item, name: 'Updated' } : item
));
```

### Reordering

```typescript
// ✅ Spread and sort creates a new array
this._items([...this._items()].sort((a, b) => a.name.localeCompare(b.name)));
```

---

## 💡 Best Practices

### DO

```typescript
// Use with signals that return arrays
${repeat(this._items(), (item) => html`<li>${item}</li>`)}

// Objects with unique identifiers work best
${repeat(this._users(), (user) => html`<div id="${user.id}">${user.name}</div>`)}

// Always create new array references when updating
this._items([...this._items(), newItem]);
```

### DON'T

```typescript
// ❌ Don't mutate the array directly
this._items().push('item'); // Won't trigger update!

// ❌ Don't use computed arrays inline (creates new array each render)
${repeat(this._items().filter(x => x.active), ...)}
// ✅ Use a computed signal instead
```

---

## ⚠️ Limitations & Known Issues

### 1. Item Template Bindings Are Not Reactive

`${item}` or `${item.property}` inside item templates use JavaScript template literal interpolation, **not** reactive signal bindings. This means:

```typescript
// ❌ Updating a property won't update the DOM
this._users()[0].name = 'New Name'; // DOM won't reflect this

// ✅ Replace the entire array to re-render
this._users(this._users().map((u, i) => 
  i === 0 ? { ...u, name: 'New Name' } : u
));
```

### 2. Objects Without IDs Use Index-Based Keys

For best performance with reordering, ensure objects have an `id`, `key`, or `_id` property:

```typescript
// ✅ Good - stable keys
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];

// ✅ Primitives use value as key (stable)
const names = ['Alice', 'Bob'];

// ⚠️ Falls back to index-based keys (reordering recreates DOM)
const data = [{ value: 1 }, { value: 2 }]; // No id/key property
```
// ✅ Workaround: wrap in container
${repeat(items, (item) => html`<div><dt>${item.term}</dt><dd>${item.def}</dd></div>`)}
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCE: ${repeat(this._items(), (item) => html`...`)}         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PARSER: parseRepeatExpression()                                │
│  ├─ itemsExpression: "this._items()"                           │
│  ├─ itemVar: "item"                                            │
│  ├─ indexVar: undefined                                        │
│  └─ itemTemplate: "<li>${item}</li>"                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPILED OUTPUT                                                │
│  static template: `<template id="b0"></template>`              │
│  __bindRepeat(r, this._items, 'b0', templateFn, initFn)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME: __bindRepeat()                                        │
│  ├─ Generates automatic keys for items                         │
│  ├─ Renders items into DOM                                     │
│  ├─ Subscribes to signal changes                               │
│  └─ Efficiently diffs and updates on changes                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Internal Types

### RepeatBlock (Compiler)
```typescript
interface RepeatBlock {
  id: string;              // Anchor element ID
  signalName: string;      // Primary signal name
  signalNames: string[];   // All signals in expression
  itemsExpression: string; // e.g., "this._countries()"
  itemVar: string;         // e.g., "country"
  indexVar?: string;       // e.g., "index" (optional)
  itemTemplate: string;    // HTML template for each item
  emptyTemplate?: string;  // HTML template shown when list is empty
  startIndex: number;      // Position in HTML
  endIndex: number;        // Position in HTML
  itemBindings: BindingInfo[]; // Bindings inside template
}
```

### RenderedItem (Runtime)
```typescript
interface RenderedItem {
  key: string;             // Generated key for this item
  elements: Element[];     // DOM elements (supports fragments)
  cleanups: (() => void)[]; // Cleanup functions for bindings
}
```

---

## 🔮 Future Enhancements

1. **Reactive item bindings** - Support `${this.someSignal()}` inside item templates
2. **Virtual scrolling** - For very large lists
3. **Transition animations** - Enter/leave animations for items
