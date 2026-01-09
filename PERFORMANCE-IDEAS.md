# Performance Optimization Ideas

## Priority Order

| Priority | Issue | Impact |
|----------|-------|--------|
| 🔴 Critical | Closure per subscriber in `scheduleUpdate` | GC pressure on every signal change |
| 🔴 Critical | `getElementById` on every visibility toggle | Unnecessary DOM queries |
| 🔴 Medium-High | `for...of` on Sets creates iterators | GC pressure in hot path |
| 🟡 Medium | Eager nested binding initialization | Wasted work for hidden content |
| 🟡 Medium | Style property assignment pattern | Not optimal for batching |
| 🟢 Minor | `arguments.length` check | Marginal |

---

## 🔴 1. Signal Update Scheduling - Closure Overhead (Critical)

In `signal.ts`:

```typescript
if (subscribers) {
  for (const callback of subscribers) {
    scheduleUpdate(() => callback(value)); // ❌ Creates new closure per subscriber per update
  }
}
```

**Problem:** Every signal change creates N closures (one per subscriber). This generates garbage on every update and defeats efficient batching.

**Fix:** Store `{ callback, value }` pairs directly in the pending set, or use a single shared closure:

```typescript
// Better approach - store callback + value pairs
type PendingUpdate = [callback: (val: any) => void, value: any];
let pendingUpdates: PendingUpdate[] | null = null;

const flushUpdates = () => {
  if (pendingUpdates) {
    const updates = pendingUpdates;
    pendingUpdates = null;
    rafScheduled = false;
    for (let i = 0; i < updates.length; i++) {
      updates[i][0](updates[i][1]);
    }
  }
};

// In reactiveFunction:
if (subscribers) {
  subscribers.forEach(callback => {
    if (!pendingUpdates) pendingUpdates = [];
    pendingUpdates.push([callback, value]); // No closure - just store the pair
  });
}
```

---

## 🔴 2. Repeated `getElementById` Lookups (Critical)

In the compiled output, every visibility toggle does:
```javascript
const currentEl = root.getElementById(id); // ❌ Called on EVERY signal update
```

**Problem:** DOM lookup on every signal update is wasteful.

**Fix:** Cache the element reference once at subscription time and use it directly.

```typescript
// Cache element once
const el = root.getElementById(id);

signal.subscribe((value) => {
  // Use cached el directly, no lookup
  if (el) {
    el.style.display = value ? '' : 'none';
  }
}, false);
```

---

## 🔴 3. `for...of` Loop on Sets (Medium-High)

In `signal.ts`:
```typescript
for (const update of updates) { update(); }
```

**Problem:** `for...of` on `Set` creates iterator objects = GC pressure in hot path.

**Fix:** Use `.forEach()` or indexed array loop:
```typescript
updates.forEach(fn => fn());
// Or convert to array and use indexed loop
const arr = Array.from(updates);
for (let i = 0; i < arr.length; i++) arr[i]();
```

---

## 🟡 4. Conditional Binding Initializes Hidden Elements (Medium) - FIXED

**Problem:** `__bindIf` / `__bindIfExpr` always initializes nested bindings even when the element starts hidden. This means subscribing to signals and setting up bindings for content the user may never see.

**Fix:** Lazily initialize nested bindings only when the condition becomes true for the first time.

---

## 🟡 5. Style Property String Assignment (Medium)

The compiled code sets:
```javascript
b4.style.backgroundColor = this._color();
```

**Problem:** Direct property assignment is slower than `setProperty()` for CSS variables and doesn't benefit from style batching.

**Fix:** For frequently changing styles, consider using CSS custom properties + a single class toggle, or batch style changes.

---

## 🟡 6. `innerHTML` for Page Components

In `shadow-dom.ts`:
```typescript
this.shadowRoot.innerHTML = this.render();
```

**Problem:** For pages that return component strings, this triggers full HTML parsing.

**Fix:** Since you control the output format, you could emit pre-parsed DOM fragments or use `insertAdjacentHTML`.

---

## 🟢 7. Signal Type Check (Minor)

```typescript
if (arguments.length === 0) { return value; }
```

**Problem:** Using `arguments` object can be slower than checking `newValue === undefined` in some engines.

**Note:** Modern engines handle this reasonably well now, low priority.

---

## 🟢 8. Missing Referential Equality Short-Circuit for Objects

```typescript
if (value !== newValue) { ... }
```

**Problem:** This works for primitives but if someone updates a signal with `{}` repeatedly, it will always trigger updates.

**Fix:** Consider documenting this behavior or adding optional deep equality parameter.

---

## Implementation Status

- [x] #4 - Lazy nested binding initialization
- [x] Conditional binding uses real DOM insertion/removal (not display:none)
- [ ] #1 - Closure overhead in scheduleUpdate
- [ ] #2 - getElementById caching
- [ ] #3 - for...of iterator allocation
