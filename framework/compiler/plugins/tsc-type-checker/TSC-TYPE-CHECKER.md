# TypeScript Type Checker Plugin

## Overview

The TypeScript Type Checker runs `tsc --noEmit` asynchronously during builds to validate TypeScript types. This catches type errors early while allowing esbuild to continue bundling in parallel - you get fast builds AND type safety.

---

## 🎯 What Problem Does It Solve?

esbuild is fast but **does not check types** - it only strips type annotations:

```typescript
// This builds successfully with esbuild, but is a type error!
const count: number = "hello";  // esbuild: ✅ | tsc: ❌

function add(a: number, b: number): number {
  return a + b;
}
add("1", "2");  // esbuild: ✅ | tsc: ❌
```

Without type checking, type errors only surface at runtime or during IDE usage.

This plugin runs `tsc` in parallel with esbuild:

```
┌─────────────────────────────────────────────────────────────────┐
│  Build Start                                                    │
│  ├─ esbuild compiles TypeScript (fast, no type check)          │
│  └─ tsc --noEmit runs in parallel (type check only)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│  esbuild finishes       │  │  tsc finishes          │
│  (bundle ready)         │  │  (type errors shown)   │
└─────────────────────────┘  └─────────────────────────┘
```

---

## 📦 Key Concepts

### Why `--noEmit`?

```bash
tsc --noEmit
```

| Flag | Purpose |
|------|---------|
| `--noEmit` | Only check types, don't generate JavaScript |

Without `--noEmit`, tsc would:
- Generate JS files (duplicate work - esbuild does this)
- Overwrite esbuild's output
- Take longer

With `--noEmit`, tsc only:
- Validates types
- Reports errors
- Exits

---

### Asynchronous Execution

The type checker runs **asynchronously** - it doesn't block esbuild:

```typescript
exec('tsc --noEmit', (error, stdout) => {
  // This runs whenever tsc finishes
  // esbuild may have already finished by now
});
```

**Benefits:**
- Build output appears immediately
- Type errors appear when ready
- No waiting for slow type checks

---

## 🔄 Plugin Flow

### Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  build.onStart()                                                │
│  ├─ Check if type check already running                         │
│  └─ If not running, spawn `tsc --noEmit`                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  tsc runs in background                                         │
│  ├─ Reads tsconfig.json                                         │
│  ├─ Parses all TypeScript files                                 │
│  └─ Validates types                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  No Errors              │    │  Type Errors Found      │
│  (silent completion)    │    │  (errors printed)       │
└─────────────────────────┘    └─────────────────────────┘
```

---

## 💡 Core Implementation

### The Complete Plugin

```typescript
const NAME = PLUGIN_NAME.TYPE_CHECK;
let isRunning = false;  // Prevents concurrent type checks

const runTypeCheck = (): void => {
  // Guard: Don't run if already checking
  if (isRunning) return;
  isRunning = true;

  logger.info(NAME, 'Running TypeScript type check...');

  // Spawn tsc as child process
  exec('tsc --noEmit', (error, stdout) => {
    isRunning = false;  // Allow future checks

    if (error) {
      // Type errors found
      logger.error(NAME, 'Type check failed');
      console.error('---------------------------------------------------------------');
      console.error(stdout);  // Contains the actual error messages
      console.error('---------------------------------------------------------------');
    }
    // If no error, type check passed silently
  });
};

export const TypeCheckPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onStart(() => runTypeCheck());
  },
};
```

---

### Guard Against Concurrent Runs

```typescript
let isRunning = false;

const runTypeCheck = (): void => {
  if (isRunning) return;  // Already running, skip
  isRunning = true;
  
  exec('tsc --noEmit', () => {
    isRunning = false;  // Mark complete
  });
};
```

**Why?** In watch mode, rapid file changes could trigger multiple type checks. Running them concurrently wastes resources.

---

## 📊 Example Output

### Successful Type Check

```
[TYPE_CHECK] Running TypeScript type check...
(esbuild output appears here)
(no additional output - types are valid)
```

### Failed Type Check

```
[TYPE_CHECK] Running TypeScript type check...
(esbuild output appears here)
[TYPE_CHECK] Type check failed
---------------------------------------------------------------
apps/client/pages/landing.ts:15:3 - error TS2322: Type 'string' is not assignable to type 'number'.

15   count: "hello",
     ~~~~~

apps/client/components/button.ts:8:5 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

8     add("1", "2");
      ~~~

Found 2 errors in 2 files.

---------------------------------------------------------------
```

---

## 🔧 Configuration

### tsconfig.json

The plugin uses your project's `tsconfig.json`. Common settings:

```json
{
  "compilerOptions": {
    "strict": true,           // Enable all strict checks
    "noUnusedLocals": true,   // Error on unused variables
    "noUnusedParameters": true, // Error on unused parameters
    "noEmit": true,           // Don't generate files (can also be here)
    "skipLibCheck": true      // Skip .d.ts checking (faster)
  },
  "include": ["apps/**/*", "framework/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 🚀 Performance Considerations

### esbuild vs tsc Speed Comparison

| Task | esbuild | tsc |
|------|---------|-----|
| Parse + Transform | ~50ms | ~2000ms |
| Type Check | ❌ (skipped) | ~1500ms |
| Output Generation | ~10ms | ~500ms |

By running in parallel, you get:
- **Fast bundle**: esbuild finishes in ~60ms
- **Type safety**: tsc errors appear ~2-3 seconds later

---

### Optimization Tips

1. **Use `skipLibCheck`**: Skips type checking `.d.ts` files
   ```json
   { "compilerOptions": { "skipLibCheck": true } }
   ```

2. **Exclude unnecessary files**: Don't type-check test files during build
   ```json
   { "exclude": ["**/*.test.ts", "**/*.spec.ts"] }
   ```

3. **Use project references**: For large monorepos
   ```json
   { "references": [{ "path": "./libs/components" }] }
   ```

---

## 📊 Comparison: With vs Without Plugin

### Without Type Checker Plugin

```
$ bun run build
✓ Build complete in 58ms

# Later at runtime...
TypeError: Cannot read property 'map' of undefined
# 🤦 Could have been caught at compile time!
```

### With Type Checker Plugin

```
$ bun run build
✓ Build complete in 58ms
[TYPE_CHECK] Type check failed
---------------------------------------------------------------
error TS2532: Object is possibly 'undefined'.
---------------------------------------------------------------

# Error caught before runtime! ✅
```

---

## ⚠️ Limitations

### Not a Build Blocker

Type errors **do not stop the build** - esbuild still generates output:

```
Build: ✅ Complete (with type errors in background)
Types: ❌ Errors found

# Bundle is created, but may have runtime issues
```

**Why?** This allows:
- Fast iteration during development
- Immediate feedback on code changes
- Type errors as "warnings" rather than blockers

### For Strict CI/CD

If you want type errors to fail the build, run tsc separately:

```json
{
  "scripts": {
    "build": "tsc --noEmit && bun run esbuild",
    "build:dev": "bun run esbuild"  // Skip type check for speed
  }
}
```

---

## 🔧 Integration with Watch Mode

In watch mode, the plugin runs type check on each rebuild:

```
[watch] build started
[TYPE_CHECK] Running TypeScript type check...
✓ Build complete
[TYPE_CHECK] Type check failed
(errors shown)

[watch] build started (file changed)
[TYPE_CHECK] Running TypeScript type check...
✓ Build complete
(no errors - types are now valid)
```

The `isRunning` guard prevents overlapping type checks during rapid file saves.
