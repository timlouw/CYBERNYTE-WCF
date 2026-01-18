/**
 * COMPILER OUTPUT SNAPSHOT TESTS
 *
 * These tests capture the exact compiled output of representative components
 * to ensure the compiler generates identical code after refactoring.
 *
 * When updating the compiler, if a test fails:
 * 1. Review the diff to ensure the change is intentional
 * 2. Update the snapshot if the change is correct
 *
 * Run with: bun test framework/compiler/tests/compiler-snapshots.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ComponentPrecompilerPlugin } from '../plugins/component-precompiler/component-precompiler.js';
import { ReactiveBindingPlugin } from '../plugins/reactive-binding-compiler/reactive-binding-compiler.js';
// import { RegisterComponentStripperPlugin } from '../plugins/register-component-stripper/register-component-stripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '.snapshot-output');
const SNAPSHOT_DIR = path.join(__dirname, '__snapshots__');

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Compiles a component and returns normalized output for snapshot comparison.
 * Normalizes: binding IDs, whitespace, and non-deterministic content.
 */
async function compileForSnapshot(code: string, filename: string): Promise<string> {
  const tempFile = path.join(TEST_OUTPUT_DIR, filename);

  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(tempFile, code);

  const result = await build({
    entryPoints: [tempFile],
    bundle: false,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [ComponentPrecompilerPlugin, ReactiveBindingPlugin],
    logLevel: 'silent',
  });

  let output = result.outputFiles?.[0]?.text || '';

  // Normalize output for stable snapshots
  output = normalizeOutput(output);

  return output;
}

/**
 * Normalizes compiler output for consistent snapshots.
 * Removes non-deterministic parts while preserving meaningful structure.
 */
function normalizeOutput(output: string): string {
  return (
    output
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      // Remove trailing whitespace
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      // Normalize multiple empty lines to single
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Creates a minimal component for testing
 */
function createComponent(name: string, template: string, signals: string = '', methods: string = ''): string {
  return `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

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

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeAll(() => {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// Snapshot Helper
// ============================================================================

/**
 * Compares output against stored snapshot or creates new snapshot.
 * Similar to Jest's toMatchSnapshot but simpler.
 */
function expectToMatchSnapshot(output: string, snapshotName: string): void {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${snapshotName}.snap`);

  if (fs.existsSync(snapshotPath)) {
    const existingSnapshot = fs.readFileSync(snapshotPath, 'utf-8');
    expect(output).toBe(existingSnapshot);
  } else {
    // Create new snapshot
    fs.writeFileSync(snapshotPath, output);
    console.log(`  📸 Created new snapshot: ${snapshotName}`);
  }
}

// ============================================================================
// Snapshot Tests - Static Templates
// ============================================================================

describe('Snapshot: Static Templates', () => {
  test('simple div with text', async () => {
    const code = createComponent('SimpleStatic', '<div class="box">Hello World</div>');
    const output = await compileForSnapshot(code, 'snapshot-static-1.ts');

    // Verify key structural elements are present
    expect(output).toContain('Hello World');
    expect(output).toContain('class="box"');
    expect(output).toContain('registerComponent');

    expectToMatchSnapshot(output, 'static-simple-div');
  });

  test('nested elements structure', async () => {
    const code = createComponent(
      'NestedStatic',
      `
      <div class="outer">
        <header><h1>Title</h1></header>
        <main><p>Content</p></main>
        <footer><span>Footer</span></footer>
      </div>
    `,
    );
    const output = await compileForSnapshot(code, 'snapshot-static-2.ts');

    expect(output).toContain('outer');
    expect(output).toContain('Title');
    expect(output).toContain('Content');
    expect(output).toContain('Footer');

    expectToMatchSnapshot(output, 'static-nested-elements');
  });
});

// ============================================================================
// Snapshot Tests - Signal Bindings
// ============================================================================

describe('Snapshot: Signal Bindings', () => {
  test('single text binding', async () => {
    const code = createComponent('SingleBinding', '<span>${this._text()}</span>', 'private _text = signal("Initial");');
    const output = await compileForSnapshot(code, 'snapshot-binding-1.ts');

    // Key binding code patterns
    expect(output).toContain('subscribe');
    expect(output).toContain('textContent');
    expect(output).toContain('_text');

    expectToMatchSnapshot(output, 'binding-single-text');
  });

  test('multiple text bindings', async () => {
    const code = createComponent(
      'MultiBinding',
      '<div><span>${this._a()}</span><span>${this._b()}</span><span>${this._c()}</span></div>',
      `private _a = signal("A");
       private _b = signal("B");
       private _c = signal("C");`,
    );
    const output = await compileForSnapshot(code, 'snapshot-binding-2.ts');

    // Should have multiple binding setups
    expect(output.match(/_a/g)?.length).toBeGreaterThan(1);
    expect(output.match(/_b/g)?.length).toBeGreaterThan(1);
    expect(output.match(/_c/g)?.length).toBeGreaterThan(1);

    expectToMatchSnapshot(output, 'binding-multiple-text');
  });

  test('attribute binding', async () => {
    const code = createComponent(
      'AttrBinding',
      '<input class="${this._className()}" value="${this._value()}">',
      `private _className = signal("input-field");
       private _value = signal("default");`,
    );
    const output = await compileForSnapshot(code, 'snapshot-binding-3.ts');

    expect(output).toContain('_className');
    expect(output).toContain('_value');

    expectToMatchSnapshot(output, 'binding-attributes');
  });

  test('style binding', async () => {
    const code = createComponent(
      'StyleBinding',
      '<div style="color: ${this._color()}; background: ${this._bg()}; font-size: ${this._size()}"></div>',
      `private _color = signal("red");
       private _bg = signal("white");
       private _size = signal("16px");`,
    );
    const output = await compileForSnapshot(code, 'snapshot-binding-4.ts');

    expect(output).toContain('style');
    expect(output).toContain('_color');
    expect(output).toContain('_bg');

    expectToMatchSnapshot(output, 'binding-styles');
  });
});

// ============================================================================
// Snapshot Tests - Conditional Rendering
// ============================================================================

describe('Snapshot: Conditional Rendering', () => {
  test('when directive', async () => {
    const code = createComponent('WhenDirective', '<div "${when(this._visible())}"><span>Visible Content</span></div>', 'private _visible = signal(true);');
    const output = await compileForSnapshot(code, 'snapshot-when-1.ts');

    expect(output).toContain('_visible');
    expect(output).toContain('Visible Content');

    expectToMatchSnapshot(output, 'conditional-when-simple');
  });

  test('when with negation', async () => {
    const code = createComponent('WhenNegated', '<div "${when(!this._hidden())}"><span>Not Hidden</span></div>', 'private _hidden = signal(false);');
    const output = await compileForSnapshot(code, 'snapshot-when-2.ts');

    expect(output).toContain('!');
    expect(output).toContain('_hidden');

    expectToMatchSnapshot(output, 'conditional-when-negated');
  });

  test('whenElse directive', async () => {
    const code = createComponent(
      'WhenElseDirective',
      '${whenElse(this._loading(), html`<div class="loader">Loading...</div>`, html`<div class="content">Ready!</div>`)}',
      'private _loading = signal(false);',
    );
    const output = await compileForSnapshot(code, 'snapshot-whenelse-1.ts');

    expect(output).toContain('Loading');
    expect(output).toContain('Ready');
    expect(output).toContain('_loading');

    expectToMatchSnapshot(output, 'conditional-whenelse');
  });

  test('when with complex expression', async () => {
    const code = createComponent(
      'WhenComplex',
      '<div "${when(this._a() && this._b() || this._c())}"><span>Complex</span></div>',
      `private _a = signal(true);
       private _b = signal(true);
       private _c = signal(false);`,
    );
    const output = await compileForSnapshot(code, 'snapshot-when-3.ts');

    expect(output).toContain('&&');
    expect(output).toContain('||');

    expectToMatchSnapshot(output, 'conditional-when-complex');
  });
});

// ============================================================================
// Snapshot Tests - Repeat Blocks
// ============================================================================

describe('Snapshot: Repeat Blocks', () => {
  test('simple repeat', async () => {
    const code = createComponent('SimpleRepeat', '${repeat(this._items(), (item) => html`<div class="item">${item}</div>`)}', 'private _items = signal(["one", "two", "three"]);');
    const output = await compileForSnapshot(code, 'snapshot-repeat-1.ts');

    expect(output).toContain('_items');
    expect(output).toContain('item');

    expectToMatchSnapshot(output, 'repeat-simple');
  });

  test('repeat with index', async () => {
    const code = createComponent('RepeatWithIndex', '${repeat(this._items(), (item, index) => html`<div>${index}: ${item}</div>`)}', 'private _items = signal(["a", "b", "c"]);');
    const output = await compileForSnapshot(code, 'snapshot-repeat-2.ts');

    expect(output).toContain('index');

    expectToMatchSnapshot(output, 'repeat-with-index');
  });

  test('repeat with empty template', async () => {
    const code = createComponent(
      'RepeatWithEmpty',
      `\${repeat(
        this._items(),
        (item) => html\`<div class="item">\${item.name}</div>\`,
        html\`<div class="empty">No items available</div>\`
      )}`,
      'private _items = signal<{name: string}[]>([]);',
    );
    const output = await compileForSnapshot(code, 'snapshot-repeat-3.ts');

    expect(output).toContain('No items available');
    expect(output).toContain('empty');

    expectToMatchSnapshot(output, 'repeat-with-empty');
  });
});

// ============================================================================
// Snapshot Tests - Event Handlers
// ============================================================================

describe('Snapshot: Event Handlers', () => {
  test('click handler', async () => {
    const code = createComponent('ClickHandler', '<button @click=${this._handleClick}>Click Me</button>', '', 'private _handleClick() { console.log("clicked"); }');
    const output = await compileForSnapshot(code, 'snapshot-event-1.ts');

    expect(output).toContain('click');
    expect(output).toContain('_handleClick');

    expectToMatchSnapshot(output, 'event-click');
  });

  test('multiple events on element', async () => {
    const code = createComponent(
      'MultipleEvents',
      `<div 
        @click=\${this._onClick} 
        @mouseenter=\${this._onEnter} 
        @mouseleave=\${this._onLeave}
      >Interactive</div>`,
      '',
      `private _onClick() {}
       private _onEnter() {}
       private _onLeave() {}`,
    );
    const output = await compileForSnapshot(code, 'snapshot-event-2.ts');

    expect(output).toContain('click');
    expect(output).toContain('mouseenter');
    expect(output).toContain('mouseleave');

    expectToMatchSnapshot(output, 'event-multiple');
  });

  test('event with modifiers', async () => {
    const code = createComponent('EventModifiers', '<button @click.stop.prevent=${this._handleSubmit}>Submit</button>', '', 'private _handleSubmit() {}');
    const output = await compileForSnapshot(code, 'snapshot-event-3.ts');

    expect(output).toContain('stop');
    expect(output).toContain('prevent');

    expectToMatchSnapshot(output, 'event-modifiers');
  });
});

// ============================================================================
// Snapshot Tests - Complex Combined Scenarios
// ============================================================================

describe('Snapshot: Complex Scenarios', () => {
  test('signals with conditionals and events', async () => {
    const code = createComponent(
      'ComplexCombined',
      `<div class="\${this._containerClass()}">
        <header>
          <h1>\${this._title()}</h1>
          <button @click=\${this._toggle}>Toggle</button>
        </header>
        <main "\${when(this._showContent())}">
          <p>\${this._description()}</p>
        </main>
        <footer>
          <span "\${when(this._isLoggedIn())}">Welcome, \${this._username()}</span>
          <span "\${when(!this._isLoggedIn())}">Not logged in</span>
        </footer>
      </div>`,
      `private _containerClass = signal("container");
       private _title = signal("Dashboard");
       private _showContent = signal(true);
       private _description = signal("Welcome to the app");
       private _isLoggedIn = signal(false);
       private _username = signal("Guest");`,
      `private _toggle() { this._showContent(!this._showContent()); }`,
    );
    const output = await compileForSnapshot(code, 'snapshot-complex-1.ts');

    // Verify all major features are present
    expect(output).toContain('Dashboard');
    expect(output).toContain('_containerClass');
    expect(output).toContain('_showContent');
    expect(output).toContain('Welcome');
    expect(output).toContain('Not logged in');

    expectToMatchSnapshot(output, 'complex-combined');
  });

  test('repeat with nested conditionals', async () => {
    const code = createComponent(
      'RepeatNested',
      `<ul>
        \${repeat(this._items(), (item) => html\`
          <li class="\${item.class}">
            <span>\${item.name}</span>
            <span "\${when(item.active)}" class="badge">Active</span>
            \${whenElse(item.status === 'online',
              html\`<span class="online">●</span>\`,
              html\`<span class="offline">○</span>\`
            )}
          </li>
        \`)}
      </ul>`,
      `private _items = signal([
        { name: "Item 1", class: "item", active: true, status: "online" },
        { name: "Item 2", class: "item", active: false, status: "offline" }
      ]);`,
    );
    const output = await compileForSnapshot(code, 'snapshot-complex-2.ts');

    expect(output).toContain('_items');
    expect(output).toContain('badge');
    expect(output).toContain('online');
    expect(output).toContain('offline');

    expectToMatchSnapshot(output, 'complex-repeat-nested');
  });

  test('deeply nested structure', async () => {
    const code = createComponent(
      'DeepNesting',
      `<div class="l1 \${this._c1()}">
        <div class="l2 \${this._c2()}">
          <div class="l3 \${this._c3()}">
            <div class="l4 \${this._c4()}">
              <div class="l5">
                <span>\${this._deepText()}</span>
                <button @click=\${this._action}>Action</button>
              </div>
            </div>
          </div>
        </div>
      </div>`,
      `private _c1 = signal("level-1");
       private _c2 = signal("level-2");
       private _c3 = signal("level-3");
       private _c4 = signal("level-4");
       private _deepText = signal("Deep Content");`,
      'private _action() {}',
    );
    const output = await compileForSnapshot(code, 'snapshot-complex-3.ts');

    expect(output).toContain('l5');
    expect(output).toContain('Deep Content');
    expect(output).toContain('_deepText');

    expectToMatchSnapshot(output, 'complex-deep-nesting');
  });
});
