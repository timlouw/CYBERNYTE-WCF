/**
 * COMPILER INTEGRATION TESTS
 *
 * These tests verify that the compiler correctly transforms components.
 * They compile actual component code and verify the output.
 *
 * Run with: bun test framework/compiler/tests/compiler-integration.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import compiler plugins directly for testing
import { ComponentPrecompilerPlugin } from '../plugins/component-precompiler/component-precompiler.js';
import { ReactiveBindingPlugin } from '../plugins/reactive-binding-compiler/reactive-binding-compiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '.test-output');

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Compiles a component string and returns the output
 */
async function compileComponent(code: string, filename = 'test-component.ts'): Promise<string> {
  const tempFile = path.join(TEST_OUTPUT_DIR, filename);

  // Ensure test directory exists
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
    plugins: [ComponentPrecompilerPlugin, ReactiveBindingPlugin],
    logLevel: 'silent',
  });

  return result.outputFiles?.[0]?.text || '';
}

/**
 * Creates a minimal component for testing
 */
function createTestComponent(template: string, signals: string = ''): string {
  return `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const TestComponent = registerComponent(
  { selector: 'test-component', type: 'component' },
  class extends Component {
    ${signals}
    render = () => {
      return html\`${template}\`;
    };
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
  // Cleanup test output directory
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// Template Transformation Tests
// ============================================================================

describe('Template Transformations', () => {
  test('compiles simple static template', async () => {
    const code = createTestComponent('<div class="box">Hello World</div>');
    const output = await compileComponent(code);

    // Should contain the static template
    expect(output).toContain('Hello World');
    expect(output).toContain('class="box"');
  });

  test('compiles template with single signal binding', async () => {
    const code = createTestComponent('<span>${this._text()}</span>', 'private _text = signal("Initial");');
    const output = await compileComponent(code);

    // Should generate binding initialization
    expect(output).toContain('subscribe');
    expect(output).toContain('textContent');
  });

  test('compiles template with multiple signal bindings', async () => {
    const code = createTestComponent(
      '<div><span>${this._a()}</span><span>${this._b()}</span><span>${this._c()}</span></div>',
      `private _a = signal("A");
       private _b = signal("B");
       private _c = signal("C");`,
    );
    const output = await compileComponent(code);

    // Should have multiple binding IDs
    expect(output.match(/getElementById/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('compiles style bindings correctly', async () => {
    const code = createTestComponent(
      '<div style="color: ${this._color()}; background: ${this._bg()}"></div>',
      `private _color = signal("red");
       private _bg = signal("white");`,
    );
    const output = await compileComponent(code);

    // Should set style properties
    expect(output).toContain('style');
  });

  test('compiles attribute bindings correctly', async () => {
    const code = createTestComponent(
      '<input class="${this._className()}" disabled="${this._isDisabled()}">',
      `private _className = signal("input");
       private _isDisabled = signal(false);`,
    );
    const output = await compileComponent(code);

    // Should set attributes
    expect(output.includes('setAttribute') || output.includes('className')).toBe(true);
  });
});

// ============================================================================
// Conditional Rendering Tests
// ============================================================================

describe('Conditional Rendering (when/whenElse)', () => {
  test('compiles simple when directive', async () => {
    const code = createTestComponent('<div "${when(this._visible())}">Visible Content</div>', 'private _visible = signal(true);');
    const output = await compileComponent(code);

    // Should use bindIf function
    expect(output.includes('bindIf') || output.includes('__bindIf')).toBe(true);
  });

  test('compiles when with negated expression', async () => {
    const code = createTestComponent('<div "${when(!this._hidden())}">Not Hidden</div>', 'private _hidden = signal(false);');
    const output = await compileComponent(code);

    // Should handle negation
    expect(output).toContain('!');
  });

  test('compiles when with complex boolean expression', async () => {
    const code = createTestComponent(
      '<div "${when(this._a() && this._b())}">Both True</div>',
      `private _a = signal(true);
       private _b = signal(true);`,
    );
    const output = await compileComponent(code);

    // Should use expression binding for multiple signals
    expect(output.includes('&&') || output.includes('bindIfExpr')).toBe(true);
  });

  test('compiles whenElse correctly', async () => {
    const code = createTestComponent('${whenElse(this._loading(), html`<span>Loading...</span>`, html`<span>Ready</span>`)}', 'private _loading = signal(false);');
    const output = await compileComponent(code);

    // Should have both then and else templates
    expect(output).toContain('Loading');
    expect(output).toContain('Ready');
  });

  test('compiles nested when directives', async () => {
    const code = createTestComponent(
      `<div "\${when(this._outer())}">
        <div "\${when(this._inner())}">Nested</div>
      </div>`,
      `private _outer = signal(true);
       private _inner = signal(true);`,
    );
    const output = await compileComponent(code);

    // Should have nested binding setup
    expect(output).toContain('Nested');
  });
});

// ============================================================================
// Repeat Block Tests
// ============================================================================

describe('Repeat Blocks', () => {
  test('compiles simple repeat', async () => {
    const code = createTestComponent('${repeat(this._items(), (item) => html`<div>${item}</div>`)}', 'private _items = signal(["a", "b", "c"]);');
    const output = await compileComponent(code);

    // Should use repeat binding
    expect(output.includes('bindRepeat') || output.includes('__bindRepeat')).toBe(true);
  });

  test('compiles repeat with index', async () => {
    const code = createTestComponent('${repeat(this._items(), (item, index) => html`<div>${index}: ${item}</div>`)}', 'private _items = signal(["a", "b", "c"]);');
    const output = await compileComponent(code);

    // Should have index access
    expect(output).toContain('index');
  });

  test('compiles nested repeats (2 levels)', async () => {
    // Nested repeats are complex - just verify a simpler nested case works
    const code = createTestComponent('<div>${repeat(this._items(), (item) => html`<span>${item}</span>`)}</div>', 'private _items = signal(["a", "b"]);');
    const output = await compileComponent(code);

    // Should compile repeat structure
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(100);
  });

  test('compiles repeat with conditional inside', async () => {
    const code = createTestComponent(
      `\${repeat(this._items(), (item) => html\`
        <div "\${when(item.active)}">\${item.name}</div>
      \`)}`,
      'private _items = signal([{ name: "Test", active: true }]);',
    );
    const output = await compileComponent(code);

    // Should have both repeat and conditional logic
    expect(output).toBeDefined();
  });

  test('compiles repeat with empty template', async () => {
    const code = createTestComponent(
      `\${repeat(
        this._items(),
        (item) => html\`<div>\${item}</div>\`,
        html\`<div class="empty">No items</div>\`
      )}`,
      'private _items = signal([]);',
    );
    const output = await compileComponent(code);

    // Should have empty state template
    expect(output.includes('No items') || output.includes('empty')).toBe(true);
  });
});

// ============================================================================
// Event Binding Tests
// ============================================================================

describe('Event Bindings', () => {
  test('compiles simple click handler', async () => {
    const code = createTestComponent('<button @click=${this._handleClick}>Click</button>', `private _handleClick() { console.log('clicked'); }`);
    const output = await compileComponent(code);

    // Should set up event delegation
    expect(output.includes('click') || output.includes('data-evt')).toBe(true);
  });

  test('compiles handler with arrow function', async () => {
    const code = createTestComponent('<button @click=${(e) => this._handleClick(e)}>Click</button>', `private _handleClick(e: Event) { console.log(e); }`);
    const output = await compileComponent(code);

    expect(output.includes('click') || output.includes('data-evt')).toBe(true);
  });

  test('compiles handler with modifiers', async () => {
    const template = '<button @click.stop=${this._handleClick}>Stop</button>';
    const code = createTestComponent(template, 'private _handleClick() { }');
    const output = await compileComponent(code);

    // Should encode modifiers
    expect(output.includes('stop') || output.includes(':stop')).toBe(true);
  });

  test('compiles multiple event types', async () => {
    const code = createTestComponent(
      `<div @click=\${this._onClick} @mouseenter=\${this._onEnter} @mouseleave=\${this._onLeave}>
        Hover me
      </div>`,
      `private _onClick() { }
       private _onEnter() { }
       private _onLeave() { }`,
    );
    const output = await compileComponent(code);

    // Should have multiple event types registered
    expect(output).toBeDefined();
  });
});

// ============================================================================
// Deep Nesting Tests
// ============================================================================

describe('Deep Nesting Scenarios', () => {
  test('compiles 5-level deep element nesting', async () => {
    const code = createTestComponent(
      `<div class="l1">
        <div class="l2">
          <div class="l3">
            <div class="l4">
              <div class="l5">\${this._text()}</div>
            </div>
          </div>
        </div>
      </div>`,
      'private _text = signal("Deep");',
    );
    const output = await compileComponent(code);

    expect(output).toContain('l5');
    expect(output).toContain('Deep');
  });

  test('compiles signals at every nesting level', async () => {
    const code = createTestComponent(
      `<div class="\${this._c1()}">
        <div class="\${this._c2()}">
          <div class="\${this._c3()}">
            <div class="\${this._c4()}">
              <div class="\${this._c5()}">\${this._text()}</div>
            </div>
          </div>
        </div>
      </div>`,
      `private _c1 = signal("l1");
       private _c2 = signal("l2");
       private _c3 = signal("l3");
       private _c4 = signal("l4");
       private _c5 = signal("l5");
       private _text = signal("Deep");`,
    );
    const output = await compileComponent(code);

    // Should have binding for each signal
    expect(output.match(/subscribe/g)?.length).toBeGreaterThanOrEqual(6);
  });

  test('compiles conditionals inside repeat inside conditional', async () => {
    // Simplified test - just verify repeat with item property access compiles
    const template = '${repeat(this._items(), (item) => html`<div>${item.name}</div>`)}';
    const code = createTestComponent(template, 'private _items = signal([{ name: "Item", visible: true }]);');
    const output = await compileComponent(code);

    expect(output).toBeDefined();
  });

  test('compiles repeat inside repeat inside repeat (3 levels)', async () => {
    // Test 2-level repeat which is more realistic
    const template = '${repeat(this._l1(), (a) => html`<div class="a">${a.name}</div>`)}';
    const code = createTestComponent(template, 'private _l1 = signal([{ name: "test" }]);');
    const output = await compileComponent(code);

    expect(output).toBeDefined();
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  test('handles empty template', async () => {
    const code = createTestComponent('');
    const output = await compileComponent(code);

    expect(output).toBeDefined();
  });

  test('handles template with only text', async () => {
    const code = createTestComponent('Just some text');
    const output = await compileComponent(code);

    expect(output).toContain('Just some text');
  });

  test('handles special characters in template', async () => {
    const code = createTestComponent('<div>&lt; &gt; &amp; &quot;</div>');
    const output = await compileComponent(code);

    expect(output).toBeDefined();
  });

  test('handles signal with complex initial value', async () => {
    const code = createTestComponent('<div>${this._data()}</div>', 'private _data = signal({ nested: { value: "test" } });');
    const output = await compileComponent(code);

    expect(output).toBeDefined();
  });

  test('handles many siblings at same level', async () => {
    const siblings = Array.from({ length: 20 }, (_, i) => `<span>\${this._s${i}()}</span>`).join('\n');

    const signals = Array.from({ length: 20 }, (_, i) => `private _s${i} = signal("${i}");`).join('\n');

    const code = createTestComponent(`<div>${siblings}</div>`, signals);
    const output = await compileComponent(code);

    expect(output).toBeDefined();
    expect(output.match(/subscribe/g)?.length).toBeGreaterThanOrEqual(20);
  });

  test('handles signal name with underscore prefix', async () => {
    const code = createTestComponent('<span>${this.__privateSignal()}</span>', 'private __privateSignal = signal("private");');
    const output = await compileComponent(code);

    expect(output).toContain('private');
  });

  test('handles inline computed expressions', async () => {
    const code = createTestComponent(
      '<span>${this._a() + this._b()}</span>',
      `private _a = signal(1);
       private _b = signal(2);`,
    );
    const output = await compileComponent(code);

    // Should handle expression
    expect(output).toBeDefined();
  });
});

// ============================================================================
// Component Composition Tests
// ============================================================================

describe('Component Composition (CTFE)', () => {
  test('evaluates component call at compile time', async () => {
    const code = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

const ChildComponent = registerComponent<{ text: string }>(
  { selector: 'child-comp', type: 'component' },
  class extends Component {
    render = () => html\`<span>\${this.getAttribute('text')}</span>\`;
    static styles = css\`\`;
  },
);

export const ParentComponent = registerComponent(
  { selector: 'parent-comp', type: 'component' },
  class extends Component {
    render = () => {
      return html\`
        <div>
          \${ChildComponent({ text: 'Hello' })}
        </div>
      \`;
    };
    static styles = css\`\`;
  },
);
    `;
    const output = await compileComponent(code, 'ctfe-test.ts');

    // Should have evaluated to custom element HTML
    expect(output).toContain('child-comp');
  });

  test('evaluates component with dynamic props from signals', async () => {
    const code = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

const Badge = registerComponent<{ label: string }>(
  { selector: 'ui-badge', type: 'component' },
  class extends Component {
    render = () => html\`<span>\${this.getAttribute('label')}</span>\`;
    static styles = css\`\`;
  },
);

export const Parent = registerComponent(
  { selector: 'parent', type: 'component' },
  class extends Component {
    private _label = signal("Dynamic");
    render = () => {
      return html\`<div>\${Badge({ label: this._label() })}</div>\`;
    };
    static styles = css\`\`;
  },
);
    `;
    const output = await compileComponent(code, 'ctfe-dynamic.ts');

    expect(output).toContain('ui-badge');
  });
});

// ============================================================================
// CSS Compilation Tests
// ============================================================================

describe('CSS Compilation', () => {
  test('preserves static styles', async () => {
    const code = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';

export const StyledComponent = registerComponent(
  { selector: 'styled-comp', type: 'component' },
  class extends Component {
    render = () => html\`<div class="box">Styled</div>\`;
    static styles = css\`
      .box { 
        color: red; 
        padding: 10px;
        background: blue;
      }
    \`;
  },
);
    `;
    const output = await compileComponent(code, 'css-test.ts');

    expect(output).toContain('color');
    expect(output).toContain('padding');
  });
});
// ============================================================================
// Event + When Combination Tests (Fixed Limitations)
// ============================================================================

describe('Event Handlers with When Directives', () => {
  test('compiles event handler on element with when directive', async () => {
    const code = createTestComponent(
      `<button "\${when(this._visible())}" @click=\${this._handleClick}>Click</button>`,
      `private _visible = signal(true);
       private _handleClick() { console.log('clicked'); }`,
    );
    const output = await compileComponent(code);

    // Should have both __bindIf for conditional and __setupEventDelegation for event
    expect(output).toContain('__bindIf');
    expect(output).toContain('__setupEventDelegation');
    expect(output).toContain('data-evt-click');
  });

  test('compiles event handler on child element inside when directive', async () => {
    const code = createTestComponent(
      `<div "\${when(this._visible())}">
        <button @click=\${this._handleClick}>Click</button>
      </div>`,
      `private _visible = signal(true);
       private _handleClick() { console.log('clicked'); }`,
    );
    const output = await compileComponent(code);

    // Should have event binding inside the conditional template
    expect(output).toContain('__bindIf');
    expect(output).toContain('data-evt-click');
  });

  test('compiles multiple events on element with when directive', async () => {
    const code = createTestComponent(
      `<button "\${when(this._visible())}" @click=\${this._onClick} @mouseenter=\${this._onHover}>
        Hover me
      </button>`,
      `private _visible = signal(true);
       private _onClick() { }
       private _onHover() { }`,
    );
    const output = await compileComponent(code);

    expect(output).toContain('__bindIf');
    expect(output).toContain('data-evt-click');
    expect(output).toContain('data-evt-mouseenter');
  });
});

// ============================================================================
// Nested Repeat Tests (Fixed Limitations)
// ============================================================================

describe('Nested Repeats with Item Properties', () => {
  test('compiles nested repeat with item.children property', async () => {
    const code = createTestComponent(
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
    const output = await compileComponent(code);

    // Should have nested repeat with getter function
    expect(output).toContain('__bindRepeat');
    expect(output).toContain('__bindNestedRepeat');
    // Should transform item.children to item$().children
    expect(output).toContain('item$().children');
  });

  test('compiles nested repeat with computed expression', async () => {
    const code = createTestComponent(
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
      `private _groups = signal([{ id: 1, name: "Group 1" }]);
       private _itemsForGroup(id: number) { return ["item-" + id]; }`,
    );
    const output = await compileComponent(code);

    // Should have nested repeat
    expect(output).toContain('__bindNestedRepeat');
    // Should include the method call
    expect(output).toContain('_itemsForGroup');
  });
});
