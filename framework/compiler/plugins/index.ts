/**
 * Compiler Plugins Index
 *
 * Re-exports all esbuild plugins for the WCF compiler.
 * Plugins are listed in recommended execution order.
 */

// 1. Type Checking - Validates TypeScript types in parallel
export { TypeCheckPlugin } from './tsc-type-checker/tsc-type-checker.js';

// 2. Routes Precompiler - Injects page selectors into route definitions
export { RoutesPrecompilerPlugin } from './routes-precompiler/routes-precompiler.js';

// 3. Component Precompiler - CTFE for component HTML generation
export { ComponentPrecompilerPlugin } from './component-precompiler/component-precompiler.js';

// 4. Reactive Binding Compiler - Compiles signal bindings into DOM operations
export { ReactiveBindingPlugin } from './reactive-binding-compiler/reactive-binding-compiler.js';

// 5. Register Component Stripper - Removes compile-time-only code
export { RegisterComponentStripperPlugin } from './register-component-stripper/register-component-stripper.js';

// 6. Post Build Processor - Copies assets, updates HTML, starts dev server
export { PostBuildPlugin } from './post-build-processor/post-build-processor.js';
