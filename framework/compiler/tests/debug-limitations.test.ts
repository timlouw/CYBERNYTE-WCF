/**
 * DEBUG TEST - Understanding Compiler Limitations
 *
 * These tests output the compiled code to understand what's breaking.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ComponentPrecompilerPlugin } from '../plugins/component-precompiler/component-precompiler.js';
import { ReactiveBindingPlugin } from '../plugins/reactive-binding-compiler/reactive-binding-compiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_OUTPUT_DIR = path.join(__dirname, 'debug-output');

beforeAll(() => {
  if (!fs.existsSync(DEBUG_OUTPUT_DIR)) {
    fs.mkdirSync(DEBUG_OUTPUT_DIR, { recursive: true });
  }
});

function createComponent(name: string, template: string, signals: string = '', methods: string = ''): string {
  return `
import { Component, registerComponent } from '../../../runtime/dom/shadow-dom.js';
import { signal } from '../../../runtime/signal/signal.js';

export const ${name} = registerComponent(
  { selector: '${name
    .toLowerCase()
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')}-comp', type: 'component' },
  class extends Component {
    ${signals}
    render = () => {
      return html\`${template}\`;
    };
    ${methods}
    static styles = css\`\`;
  },
);
`.trim();
}

async function compileAndDebug(code: string, filename: string): Promise<{ output?: string; error?: string; intermediate?: string }> {
  const tempFile = path.join(DEBUG_OUTPUT_DIR, filename);
  fs.writeFileSync(tempFile, code);

  // First pass: just precompiler to see intermediate output
  let intermediateOutput = '';
  try {
    const precompileResult = await build({
      entryPoints: [tempFile],
      bundle: false,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      plugins: [ComponentPrecompilerPlugin],
      logLevel: 'silent',
    });
    intermediateOutput = precompileResult.outputFiles?.[0]?.text || '';
    fs.writeFileSync(path.join(DEBUG_OUTPUT_DIR, filename.replace('.ts', '.precompiled.js')), intermediateOutput);
  } catch (e: any) {
    return { error: 'Precompiler error: ' + e.message, intermediate: '' };
  }

  // Try with ONLY ReactiveBindingPlugin to isolate the issue
  try {
    await build({
      entryPoints: [tempFile],
      bundle: false, // Don't bundle to avoid import resolution
      write: true, // Write to disk so we can inspect
      outdir: DEBUG_OUTPUT_DIR,
      outExtension: { '.js': '.reactive.js' },
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      plugins: [ReactiveBindingPlugin],
      logLevel: 'silent',
    });
    const reactiveOnlyOutput = await fs.promises
      .readFile(path.join(DEBUG_OUTPUT_DIR, filename.replace('.ts', '.reactive.js')), 'utf8')
      .catch(() => 'Could not read reactive output file');
    console.log('\n=== REACTIVE ONLY OUTPUT (first 2000 chars) ===\n', reactiveOnlyOutput.substring(0, 2000));
  } catch (e: any) {
    console.log('REACTIVE ONLY ERROR:', e.message);
  }

  // Second pass: full compilation
  try {
    const result = await build({
      entryPoints: [tempFile],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      plugins: [ComponentPrecompilerPlugin, ReactiveBindingPlugin],
      logLevel: 'silent',
    });

    const output = result.outputFiles?.[0]?.text || '';

    // Save output for inspection
    fs.writeFileSync(path.join(DEBUG_OUTPUT_DIR, filename.replace('.ts', '.out.js')), output);

    return { output, intermediate: intermediateOutput };
  } catch (e: any) {
    return { error: e.message, intermediate: intermediateOutput };
  }
}

describe('Debug: Event + When on Same Element', () => {
  test('button with when directive and click handler', async () => {
    const code = createComponent(
      'EventWhenTest',
      `<button "\${when(this._visible())}" @click=\${this._handleClick}>Click</button>`,
      `private _visible = signal(true);`,
      `private _handleClick() { console.log('clicked'); }`,
    );

    const result = await compileAndDebug(code, 'event-when-same-element.ts');

    console.log('Event+When Error:', result.error || 'None');
    if (result.intermediate) {
      console.log('\n=== INTERMEDIATE (after precompiler) ===\n');
      console.log(result.intermediate.substring(0, 3000));
    }
    if (result.output) {
      console.log('\n=== FINAL OUTPUT ===\n');
      console.log(result.output.substring(0, 2000));
    }

    expect(result.error).toBeUndefined();
  });

  test('separate elements - when on wrapper, click on button', async () => {
    const code = createComponent(
      'SeparateTest',
      `<div "\${when(this._visible())}"><button @click=\${this._handleClick}>Click</button></div>`,
      `private _visible = signal(true);`,
      `private _handleClick() { console.log('clicked'); }`,
    );

    const result = await compileAndDebug(code, 'event-when-separate.ts');

    console.log('Separate Error:', result.error || 'None');
    if (result.intermediate) {
      console.log('\n=== INTERMEDIATE (after precompiler) ===\n');
      console.log(result.intermediate.substring(0, 3000));
    }

    expect(result.error).toBeUndefined();
  });
});

describe('Debug: Nested Repeat', () => {
  test('repeat with item.children nested repeat', async () => {
    const code = createComponent(
      'NestedRepeatTest',
      `<ul>
        \${repeat(this._items(), (item) => html\`
          <li>
            \${item.name}
            <ul>
              \${repeat(item.children, (child) => html\`<li>\${child}</li>\`)}
            </ul>
          </li>
        \`)}
      </ul>`,
      `private _items = signal([
        { name: "Item 1", children: ["a", "b"] },
        { name: "Item 2", children: ["c", "d"] }
      ]);`,
    );

    const result = await compileAndDebug(code, 'nested-repeat.ts');

    console.log('Nested Repeat Error:', result.error || 'None');
    if (result.output) {
      console.log('Nested Repeat Output (first 2000 chars):', result.output.substring(0, 2000));
    }

    expect(result.error).toBeUndefined();
  });

  test('repeat with this._signal() nested repeat', async () => {
    const code = createComponent(
      'SignalNestedRepeatTest',
      `<ul>
        \${repeat(this._groups(), (group) => html\`
          <li>
            \${group.name}
            <ul>
              \${repeat(this._itemsForGroup(group.id), (item) => html\`<li>\${item}</li>\`)}
            </ul>
          </li>
        \`)}
      </ul>`,
      `private _groups = signal([{ id: 1, name: "Group 1" }, { id: 2, name: "Group 2" }]);
       private _itemsForGroup = (id: number) => signal(["item-" + id]);`,
    );

    const result = await compileAndDebug(code, 'signal-nested-repeat.ts');

    console.log('Signal Nested Repeat Error:', result.error || 'None');

    expect(result.error).toBeUndefined();
  });
});

describe('Debug: WhenElse Inside Repeat', () => {
  test('whenElse inside repeat template', async () => {
    const code = createComponent(
      'WhenElseInRepeatTest',
      `<ul>
        \${repeat(this._items(), (item) => html\`
          <li>
            \${whenElse(item.active,
              html\`<span class="active">Active: \${item.name}</span>\`,
              html\`<span class="inactive">Inactive: \${item.name}</span>\`
            )}
          </li>
        \`)}
      </ul>`,
      `private _items = signal([
        { name: "Item 1", active: true },
        { name: "Item 2", active: false }
      ]);`,
    );

    const result = await compileAndDebug(code, 'whenelse-in-repeat.ts');

    console.log('WhenElse in Repeat Error:', result.error || 'None');
    if (result.output) {
      console.log('WhenElse in Repeat Output (first 2000 chars):', result.output.substring(0, 2000));
    }

    expect(result.error).toBeUndefined();
  });
});
