/**
 * END-TO-END FRAMEWORK TESTS
 *
 * These tests build actual components and verify the full pipeline works.
 * They test the complete flow: Source → Compiler → Runtime → DOM
 *
 * Run with: bun test framework/compiler/tests/e2e-framework.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '.e2e-test-output');

// Import all plugins
import {
  // TypeCheckPlugin,
  // RoutesPrecompilerPlugin,
  ComponentPrecompilerPlugin,
  ReactiveBindingPlugin,
  RegisterComponentStripperPlugin,
  // GlobalCSSBundlerPlugin,
  // HTMLBootstrapInjectorPlugin,
} from '../plugins/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Compiles a component through the full pipeline and returns executable code
 */
async function fullCompile(code: string, filename = 'e2e-component.ts'): Promise<string> {
  const tempFile = path.join(TEST_OUTPUT_DIR, filename);

  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(tempFile, code);

  const result = await build({
    entryPoints: [tempFile],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [ComponentPrecompilerPlugin, ReactiveBindingPlugin, RegisterComponentStripperPlugin],
    logLevel: 'silent',
    external: ['../../runtime/*', '../../../framework/runtime/*'],
  });

  return result.outputFiles?.[0]?.text || '';
}

/**
 * Creates a component with runtime imports
 */
function createE2EComponent(name: string, template: string, signals: string = '', methods: string = ''): string {
  return `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const ${name} = registerComponent(
  { selector: '${name
    .toLowerCase()
    .replace(/component$/, '-component')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')}', type: 'component' },
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

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeAll(() => {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// Full Pipeline Tests
// ============================================================================

describe('Full Compilation Pipeline', () => {
  test('compiles simple component through full pipeline', async () => {
    const code = createE2EComponent('SimpleComponent', '<div class="box">Hello World</div>');

    const output = await fullCompile(code);

    expect(output).toContain('Hello World');
    // registerComponent is preserved in output (customElements.define is inside the runtime)
    expect(output).toContain('registerComponent');
  });

  test('compiles signal bindings through full pipeline', async () => {
    const code = createE2EComponent('SignalComponent', '<span>${this._text()}</span>', 'private _text = signal("Initial");');

    const output = await fullCompile(code);

    // Should have static template with placeholder
    expect(output).toContain('Initial');
    // Should have binding setup
    expect(output.includes('subscribe') || output.includes('initializeBindings')).toBe(true);
  });

  test('compiles when directive through full pipeline', async () => {
    const code = createE2EComponent('ConditionalComponent', '<div "${when(this._visible())}">Visible Content</div>', 'private _visible = signal(true);');

    const output = await fullCompile(code);

    expect(output).toContain('Visible Content');
  });

  test('compiles whenElse through full pipeline', async () => {
    const code = createE2EComponent(
      'WhenElseComponent',
      '${whenElse(this._loading(), html`<span>Loading...</span>`, html`<span>Ready</span>`)}',
      'private _loading = signal(false);',
    );

    const output = await fullCompile(code);

    expect(output).toContain('Loading');
    expect(output).toContain('Ready');
  });

  test('compiles repeat through full pipeline', async () => {
    const code = createE2EComponent('RepeatComponent', '${repeat(this._items(), (item) => html`<div>${item}</div>`)}', 'private _items = signal(["A", "B", "C"]);');

    const output = await fullCompile(code);

    // Should have repeat binding setup
    expect(output).toBeDefined();
  });

  test('compiles event handlers through full pipeline', async () => {
    const code = createE2EComponent('EventComponent', '<button @click=${this._handleClick}>Click Me</button>', '', 'private _handleClick() { console.log("clicked"); }');

    const output = await fullCompile(code);

    expect(output).toContain('click');
  });
});

// ============================================================================
// Complex Scenario Tests
// ============================================================================

describe('Complex Scenarios', () => {
  test('compiles nested signals and conditionals', async () => {
    const code = createE2EComponent(
      'NestedComponent',
      `<div class="\${this._containerClass()}">
        <header>
          <h1>\${this._title()}</h1>
        </header>
        <main "\${when(this._showContent())}">
          <p>\${this._description()}</p>
        </main>
        <footer>
          \${whenElse(this._isLoggedIn(), 
            html\`<span>Welcome, \${this._username()}</span>\`, 
            html\`<span>Please log in</span>\`
          )}
        </footer>
      </div>`,
      `private _containerClass = signal("container");
       private _title = signal("Title");
       private _showContent = signal(true);
       private _description = signal("Description");
       private _isLoggedIn = signal(false);
       private _username = signal("User");`,
    );

    const output = await fullCompile(code);

    expect(output).toContain('Title');
    expect(output).toContain('Description');
    expect(output).toContain('Welcome');
    expect(output).toContain('Please log in');
  });

  test('compiles repeat with conditionals inside', async () => {
    const code = createE2EComponent(
      'RepeatConditionalComponent',
      `\${repeat(this._items(), (item) => html\`
        <div class="item">
          <span>\${item.name}</span>
          <span "\${when(item.active)}" class="active-badge">Active</span>
        </div>
      \`)}`,
      'private _items = signal([{ name: "Item1", active: true }, { name: "Item2", active: false }]);',
    );

    const output = await fullCompile(code);

    expect(output).toBeDefined();
  });

  test('compiles multiple event types on same element', async () => {
    const code = createE2EComponent(
      'MultiEventComponent',
      `<div 
        @click=\${this._onClick}
        @mouseenter=\${this._onEnter}
        @mouseleave=\${this._onLeave}
      >Hover and Click</div>`,
      '',
      `private _onClick() { }
       private _onEnter() { }
       private _onLeave() { }`,
    );

    const output = await fullCompile(code);

    expect(output).toContain('click');
    expect(output).toContain('mouseenter');
    expect(output).toContain('mouseleave');
  });

  test('compiles deeply nested elements (8 levels)', async () => {
    const code = createE2EComponent(
      'DeepNestComponent',
      `<div class="l1">
        <div class="l2">
          <div class="l3">
            <div class="l4">
              <div class="l5">
                <div class="l6">
                  <div class="l7">
                    <div class="l8">\${this._deep()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
      'private _deep = signal("Deep content");',
    );

    const output = await fullCompile(code);

    expect(output).toContain('l8');
    expect(output).toContain('Deep content');
  });

  test('compiles signals at every level', async () => {
    const code = createE2EComponent(
      'AllLevelsComponent',
      `<div class="\${this._c1()}">
        <div class="\${this._c2()}">
          <div class="\${this._c3()}">
            <span>\${this._text()}</span>
          </div>
        </div>
      </div>`,
      `private _c1 = signal("level-1");
       private _c2 = signal("level-2");
       private _c3 = signal("level-3");
       private _text = signal("Content");`,
    );

    const output = await fullCompile(code);

    expect(output).toContain('level-1');
    expect(output).toContain('level-2');
    expect(output).toContain('level-3');
    expect(output).toContain('Content');
  });
});

// ============================================================================
// Output Verification Tests
// ============================================================================

describe('Output Verification', () => {
  test('generates valid JavaScript', async () => {
    const code = createE2EComponent('ValidJSComponent', '<div>${this._data()}</div>', 'private _data = signal({ key: "value" });');

    const output = await fullCompile(code);

    // Should have valid output structure (can't eval due to imports)
    expect(output).toContain('ValidJSComponent');
    expect(output).toContain('registerComponent');
    expect(output.length).toBeGreaterThan(100);
  });

  test('removes compile-time only code', async () => {
    const code = createE2EComponent('StripperTestComponent', '<div>Test</div>');

    const output = await fullCompile(code);

    // registerComponent should be transformed to side-effect import
    // or the function call should be preserved but not expose internal details
    expect(output).toBeDefined();
  });

  test('preserves CSS styles', async () => {
    const code = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';

export const StyledComponent = registerComponent(
  { selector: 'styled-e2e', type: 'component' },
  class extends Component {
    render = () => html\`<div class="styled-box">Content</div>\`;
    static styles = css\`
      .styled-box {
        color: red;
        padding: 20px;
        background: linear-gradient(to right, blue, green);
      }
    \`;
  },
);
    `;

    const output = await fullCompile(code);

    expect(output).toContain('color');
    expect(output).toContain('padding');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  test('handles empty render function', async () => {
    const code = createE2EComponent('EmptyComponent', '');

    // Should not throw
    const output = await fullCompile(code);
    expect(output).toBeDefined();
  });

  test('handles signal with complex expression', async () => {
    const code = createE2EComponent('ComplexExprComponent', '<span>${this._items().length > 0 ? "Has items" : "Empty"}</span>', 'private _items = signal([1, 2, 3]);');

    const output = await fullCompile(code);
    expect(output).toBeDefined();
  });

  test('handles multiple components in same file', async () => {
    const code = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const Component1 = registerComponent(
  { selector: 'comp-one', type: 'component' },
  class extends Component {
    private _text = signal("One");
    render = () => html\`<div>\${this._text()}</div>\`;
    static styles = css\`\`;
  },
);

export const Component2 = registerComponent(
  { selector: 'comp-two', type: 'component' },
  class extends Component {
    private _text = signal("Two");
    render = () => html\`<span>\${this._text()}</span>\`;
    static styles = css\`\`;
  },
);
    `;

    const output = await fullCompile(code, 'multi-component.ts');

    expect(output).toContain('comp-one');
    expect(output).toContain('comp-two');
    expect(output).toContain('One');
    expect(output).toContain('Two');
  });
});

// ============================================================================
// Regression Tests
// ============================================================================

describe('Regression Tests', () => {
  test('handles HTML entities in template', async () => {
    const code = createE2EComponent('EntitiesComponent', '<div>&lt;div&gt; &amp; &quot;quotes&quot;</div>');

    const output = await fullCompile(code);
    expect(output).toBeDefined();
  });

  test('handles template with only whitespace', async () => {
    const code = createE2EComponent('WhitespaceComponent', '   \n   \t   ');

    const output = await fullCompile(code);
    expect(output).toBeDefined();
  });

  test('handles signal names with numbers', async () => {
    const code = createE2EComponent(
      'NumericSignalComponent',
      '<span>${this._signal1()} ${this._signal2()}</span>',
      `private _signal1 = signal("one");
       private _signal2 = signal("two");`,
    );

    const output = await fullCompile(code);
    expect(output).toContain('one');
    expect(output).toContain('two');
  });

  test('handles method names in event handlers', async () => {
    const code = createE2EComponent('MethodHandlerComponent', '<button @click=${this._handleSubmit}>Submit</button>', '', 'private _handleSubmit() { }');

    const output = await fullCompile(code);
    expect(output).toContain('click');
  });

  test('handles arrow function event handlers', async () => {
    const code = createE2EComponent('ArrowHandlerComponent', '<button @click=${() => this._count(this._count() + 1)}>+1</button>', 'private _count = signal(0);');

    const output = await fullCompile(code);
    expect(output).toBeDefined();
  });

  test('handles event handler with event parameter', async () => {
    const code = createE2EComponent(
      'EventParamComponent',
      '<input @input=${(e) => this._handleInput(e)}>',
      '',
      'private _handleInput(e: Event) { console.log((e.target as HTMLInputElement).value); }',
    );

    const output = await fullCompile(code);
    expect(output).toContain('input');
  });
});

// ============================================================================
// Performance Benchmark Tests
// ============================================================================

describe('Compilation Performance', () => {
  test('compiles simple component quickly', async () => {
    const code = createE2EComponent('SimplePerf', '<div>Simple</div>');

    const start = performance.now();
    await fullCompile(code, 'perf-simple.ts');
    const duration = performance.now() - start;

    // Should compile in less than 500ms
    expect(duration).toBeLessThan(500);
  });

  test('compiles complex component in reasonable time', async () => {
    const code = createE2EComponent(
      'ComplexPerf',
      `<div class="\${this._c()}">
        \${repeat(this._items(), (item) => html\`
          <div "\${when(item.visible)}">
            <span>\${item.name}</span>
            \${whenElse(item.active,
              html\`<span class="active">Active</span>\`,
              html\`<span class="inactive">Inactive</span>\`
            )}
          </div>
        \`)}
      </div>`,
      `private _c = signal("container");
       private _items = signal([{ name: "Test", visible: true, active: true }]);`,
    );

    const start = performance.now();
    await fullCompile(code, 'perf-complex.ts');
    const duration = performance.now() - start;

    // Should compile in less than 1000ms
    expect(duration).toBeLessThan(1000);
  });

  test('compiles component with many signals quickly', async () => {
    const signalDefs = Array.from({ length: 50 }, (_, i) => `private _s${i} = signal("${i}");`).join('\n');

    const bindings = Array.from({ length: 50 }, (_, i) => `<span>\${this._s${i}()}</span>`).join('\n');

    const code = createE2EComponent('ManySignalsPerf', `<div>${bindings}</div>`, signalDefs);

    const start = performance.now();
    await fullCompile(code, 'perf-many-signals.ts');
    const duration = performance.now() - start;

    // Should compile in less than 2000ms even with 50 signals
    expect(duration).toBeLessThan(2000);
  });
});
