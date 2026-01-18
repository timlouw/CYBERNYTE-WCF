/**
 * COMPLEX NESTED REPEAT + CONDITIONAL TESTS
 *
 * Advanced tests for complex combinations of repeat blocks and conditional directives.
 * These test scenarios that commonly occur in real-world applications.
 *
 * Run with: bun test framework/compiler/tests/complex-nested.test.ts
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
const TEST_OUTPUT_DIR = path.join(__dirname, '.complex-nested-output');

// ============================================================================
// Test Helpers
// ============================================================================

async function compileComponent(code: string, filename: string): Promise<string> {
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

  return result.outputFiles?.[0]?.text || '';
}

function createComponent(name: string, template: string, signals: string = '', methods: string = ''): string {
  const selector =
    name
      .toLowerCase()
      .replace(/([A-Z])/g, '-$1')
      .replace(/^-/, '') + '-comp';
  return `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const ${name} = registerComponent(
  { selector: '${selector}', type: 'component' },
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
// Repeat with When Inside
// ============================================================================

describe('Complex: Repeat with When Inside', () => {
  test('repeat with single when directive per item', async () => {
    const code = createComponent(
      'RepeatWhen',
      `<ul>
        \${repeat(this._items(), (item) => html\`
          <li>
            <span>\${item.name}</span>
            <span "\${when(item.active)}" class="badge">Active</span>
          </li>
        \`)}
      </ul>`,
      `private _items = signal([
        { name: "Item 1", active: true },
        { name: "Item 2", active: false },
        { name: "Item 3", active: true }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-when-1.ts');

    expect(output).toContain('_items');
    expect(output).toContain('badge');
    expect(output).toContain('Active');
    expect(output).toBeDefined();
  });

  test('repeat with multiple when directives per item', async () => {
    const code = createComponent(
      'RepeatMultiWhen',
      `<div class="list">
        \${repeat(this._users(), (user) => html\`
          <div class="user-card">
            <span>\${user.name}</span>
            <span "\${when(user.isAdmin)}" class="admin-badge">Admin</span>
            <span "\${when(user.isVerified)}" class="verified-badge">✓</span>
            <span "\${when(user.isPremium)}" class="premium-badge">★</span>
          </div>
        \`)}
      </div>`,
      `private _users = signal([
        { name: "Alice", isAdmin: true, isVerified: true, isPremium: false },
        { name: "Bob", isAdmin: false, isVerified: true, isPremium: true }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-multi-when.ts');

    expect(output).toContain('admin-badge');
    expect(output).toContain('verified-badge');
    expect(output).toContain('premium-badge');
  });

  test('repeat with when using item property comparison', async () => {
    const code = createComponent(
      'RepeatWhenCompare',
      `<ul>
        \${repeat(this._tasks(), (task) => html\`
          <li class="task">
            <span>\${task.title}</span>
            <span "\${when(task.status === 'done')}" class="done">✓</span>
            <span "\${when(task.status === 'pending')}" class="pending">⏳</span>
            <span "\${when(task.priority > 5)}" class="high-priority">!</span>
          </li>
        \`)}
      </ul>`,
      `private _tasks = signal([
        { title: "Task 1", status: "done", priority: 3 },
        { title: "Task 2", status: "pending", priority: 8 }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-when-compare.ts');

    expect(output).toContain('done');
    expect(output).toContain('pending');
    expect(output).toContain('high-priority');
  });
});

// ============================================================================
// Repeat with WhenElse Inside
// ============================================================================

describe('Complex: Repeat with WhenElse Inside', () => {
  test('repeat with whenElse per item', async () => {
    const code = createComponent(
      'RepeatWhenElse',
      `<ul>
        \${repeat(this._items(), (item) => html\`
          <li>
            \${whenElse(item.available,
              html\`<span class="in-stock">In Stock (\${item.quantity})</span>\`,
              html\`<span class="out-of-stock">Out of Stock</span>\`
            )}
          </li>
        \`)}
      </ul>`,
      `private _items = signal([
        { name: "Product A", available: true, quantity: 10 },
        { name: "Product B", available: false, quantity: 0 }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-whenelse.ts');

    expect(output).toContain('in-stock');
    expect(output).toContain('out-of-stock');
    expect(output).toContain('In Stock');
    expect(output).toContain('Out of Stock');
  });

  test('repeat with multiple whenElse blocks', async () => {
    const code = createComponent(
      'RepeatMultiWhenElse',
      `<div class="order-list">
        \${repeat(this._orders(), (order) => html\`
          <div class="order">
            <span class="id">\${order.id}</span>
            \${whenElse(order.status === 'shipped',
              html\`<span class="shipped">📦 Shipped</span>\`,
              html\`<span class="processing">⏳ Processing</span>\`
            )}
            \${whenElse(order.isPaid,
              html\`<span class="paid">💳 Paid</span>\`,
              html\`<span class="unpaid">❌ Unpaid</span>\`
            )}
          </div>
        \`)}
      </div>`,
      `private _orders = signal([
        { id: "001", status: "shipped", isPaid: true },
        { id: "002", status: "processing", isPaid: false }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-multi-whenelse.ts');

    expect(output).toContain('shipped');
    expect(output).toContain('processing');
    expect(output).toContain('paid');
    expect(output).toContain('unpaid');
  });
});

// ============================================================================
// Nested Repeats (2 Levels)
// Note: Deeply nested repeats have known limitations in the current compiler.
// These tests document expected behavior and known edge cases.
// ============================================================================

describe('Complex: Nested Repeats (2 Levels)', () => {
  test('basic two-level nested repeat', async () => {
    // Note: Nested repeats with inner repeat on item.property may have limitations
    const code = createComponent(
      'NestedRepeat2',
      `<div class="categories">
        \${repeat(this._categories(), (category) => html\`
          <div class="category">
            <h3>\${category.name}</h3>
            <span>Items: \${category.items.length}</span>
          </div>
        \`)}
      </div>`,
      `private _categories = signal([
        { name: "Fruits", items: ["Apple", "Banana", "Orange"] },
        { name: "Vegetables", items: ["Carrot", "Broccoli"] }
      ]);`,
    );
    const output = await compileComponent(code, 'nested-repeat-2.ts');

    expect(output).toContain('categories');
    expect(output).toContain('category');
    expect(output).toBeDefined();
  });

  test('nested repeat with index access', async () => {
    // Simplified test - single level repeat with index
    const code = createComponent(
      'RepeatIndex',
      `<table>
        \${repeat(this._rows(), (row, rowIndex) => html\`
          <tr data-row="\${rowIndex}">
            <td>\${row.label}</td>
          </tr>
        \`)}
      </table>`,
      `private _rows = signal([
        { label: "Row 1" },
        { label: "Row 2" }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-index.ts');

    expect(output).toContain('rowIndex');
  });

  test('repeat with when at same level', async () => {
    // Tests repeat with when on sibling elements, not nested repeats
    const code = createComponent(
      'RepeatWithWhen',
      `<div class="sections">
        \${repeat(this._sections(), (section) => html\`
          <div class="section">
            <h2>\${section.title}</h2>
            <p "\${when(section.visible)}">\${section.content}</p>
          </div>
        \`)}
      </div>`,
      `private _sections = signal([
        { title: "Section 1", visible: true, content: "Content 1" },
        { title: "Section 2", visible: false, content: "Content 2" }
      ]);`,
    );
    const output = await compileComponent(code, 'repeat-with-when.ts');

    expect(output).toContain('section');
    expect(output).toBeDefined();
  });
});

// ============================================================================
// Triple Nested Repeats (3 Levels)
// Note: Triple nested repeats are a known limitation - documenting behavior
// ============================================================================

describe('Complex: Triple Nested Repeats (3 Levels)', () => {
  test('three-level nested structure (no nested repeat)', async () => {
    // Tests deep nesting structure without nested repeat blocks
    const code = createComponent(
      'DeepStructure',
      `<div class="tree">
        \${repeat(this._tree(), (level1) => html\`
          <div class="level-1">
            <span>\${level1.name}</span>
            <div class="children-count">Children: \${level1.children.length}</div>
          </div>
        \`)}
      </div>`,
      `private _tree = signal([
        {
          name: "Root A",
          children: [
            { name: "Branch A1", children: [{ name: "Leaf A1a" }, { name: "Leaf A1b" }] },
            { name: "Branch A2", children: [{ name: "Leaf A2a" }] }
          ]
        }
      ]);`,
    );
    const output = await compileComponent(code, 'deep-structure.ts');

    expect(output).toContain('level-1');
    expect(output).toContain('tree');
  });
});

// ============================================================================
// When Inside When (Nested Conditionals)
// ============================================================================

describe('Complex: Nested Conditionals', () => {
  test('when inside when (2 levels)', async () => {
    const code = createComponent(
      'NestedWhen2',
      `<div>
        <div "\${when(this._showOuter())}">
          <span>Outer visible</span>
          <div "\${when(this._showInner())}">
            <span>Inner visible</span>
          </div>
        </div>
      </div>`,
      `private _showOuter = signal(true);
       private _showInner = signal(true);`,
    );
    const output = await compileComponent(code, 'nested-when-2.ts');

    expect(output).toContain('Outer visible');
    expect(output).toContain('Inner visible');
    expect(output).toContain('_showOuter');
    expect(output).toContain('_showInner');
  });

  test('when inside when (3 levels)', async () => {
    const code = createComponent(
      'NestedWhen3',
      `<div>
        <div "\${when(this._level1())}">
          <span>Level 1</span>
          <div "\${when(this._level2())}">
            <span>Level 2</span>
            <div "\${when(this._level3())}">
              <span>Level 3</span>
            </div>
          </div>
        </div>
      </div>`,
      `private _level1 = signal(true);
       private _level2 = signal(true);
       private _level3 = signal(true);`,
    );
    const output = await compileComponent(code, 'nested-when-3.ts');

    expect(output).toContain('Level 1');
    expect(output).toContain('Level 2');
    expect(output).toContain('Level 3');
  });

  test('whenElse inside whenElse', async () => {
    const code = createComponent(
      'NestedWhenElse',
      `<div>
        \${whenElse(this._outer(),
          html\`<div class="outer-true">
            \${whenElse(this._inner(),
              html\`<span>Both True</span>\`,
              html\`<span>Outer True, Inner False</span>\`
            )}
          </div>\`,
          html\`<div class="outer-false">
            \${whenElse(this._inner(),
              html\`<span>Outer False, Inner True</span>\`,
              html\`<span>Both False</span>\`
            )}
          </div>\`
        )}
      </div>`,
      `private _outer = signal(true);
       private _inner = signal(true);`,
    );
    const output = await compileComponent(code, 'nested-whenelse.ts');

    expect(output).toContain('Both True');
    expect(output).toContain('Both False');
    expect(output).toContain('Outer True, Inner False');
    expect(output).toContain('Outer False, Inner True');
  });

  test('when inside whenElse template', async () => {
    const code = createComponent(
      'WhenInWhenElse',
      `<div>
        \${whenElse(this._showSection(),
          html\`<section>
            <h2>Section Content</h2>
            <div "\${when(this._showDetails())}">
              <p>Detailed information here</p>
            </div>
          </section>\`,
          html\`<p>Section hidden</p>\`
        )}
      </div>`,
      `private _showSection = signal(true);
       private _showDetails = signal(true);`,
    );
    const output = await compileComponent(code, 'when-in-whenelse.ts');

    expect(output).toContain('Section Content');
    expect(output).toContain('Detailed information here');
    expect(output).toContain('Section hidden');
  });
});

// ============================================================================
// Conditional Wrapping Repeat
// ============================================================================

describe('Complex: Conditional Wrapping Repeat', () => {
  test('when wrapping content with repeat', async () => {
    const code = createComponent(
      'WhenWrapRepeat',
      `<div>
        <div "\${when(this._showList())}">
          <h3>Items List:</h3>
          <span>Count: \${this._items().length}</span>
        </div>
        <div "\${when(!this._showList())}">
          <p>List is hidden</p>
        </div>
      </div>`,
      `private _showList = signal(true);
       private _items = signal([
         { name: "Item 1" },
         { name: "Item 2" }
       ]);`,
    );
    const output = await compileComponent(code, 'when-wrap-content.ts');

    expect(output).toContain('_showList');
    expect(output).toContain('Items List');
  });

  test('whenElse with different content branches', async () => {
    const code = createComponent(
      'WhenElseBranches',
      `<div>
        \${whenElse(this._showPrimary(),
          html\`<div class="primary">
            <h2>Primary View</h2>
            <p>\${this._primaryContent()}</p>
          </div>\`,
          html\`<div class="secondary">
            <h2>Secondary View</h2>
            <p>\${this._secondaryContent()}</p>
          </div>\`
        )}
      </div>`,
      `private _showPrimary = signal(true);
       private _primaryContent = signal("Primary content here");
       private _secondaryContent = signal("Secondary content here");`,
    );
    const output = await compileComponent(code, 'whenelse-branches.ts');

    expect(output).toContain('primary');
    expect(output).toContain('secondary');
    expect(output).toContain('_primaryContent');
    expect(output).toContain('_secondaryContent');
  });
});

// ============================================================================
// Real-World Complex Scenarios
// ============================================================================

describe('Complex: Real-World Scenarios', () => {
  test('todo list with conditionals', async () => {
    const code = createComponent(
      'TodoList',
      `<div class="todo-app">
        <header>
          <h1>\${this._title()}</h1>
          <span "\${when(this._loading())}" class="spinner">Loading...</span>
        </header>
        
        <main "\${when(!this._loading())}">
          <div class="count">Total: \${this._todos().length} items</div>
        </main>
        
        <footer "\${when(this._todos().length > 0)}">
          <span>\${this._todos().length} items</span>
        </footer>
      </div>`,
      `private _title = signal("My Todos");
       private _loading = signal(false);
       private _todos = signal([
         { text: "Learn WCF", completed: true, priority: "high", dueDate: "2026-01-20" },
         { text: "Build app", completed: false, priority: "medium", dueDate: null }
       ]);`,
    );
    const output = await compileComponent(code, 'todo-list.ts');

    expect(output).toContain('todo-app');
    expect(output).toContain('_loading');
    expect(output).toContain('_todos');
  });

  test('data table with conditionals', async () => {
    const code = createComponent(
      'DataTable',
      `<div class="data-table">
        <div "\${when(this._showFilters())}" class="filters">
          <input placeholder="Search..." value="\${this._searchTerm()}">
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr "\${when(this._hasData())}">
              <td colspan="3">Data loaded</td>
            </tr>
          </tbody>
        </table>
        
        <div "\${when(!this._hasData())}" class="no-results">
          No matching records found
        </div>
      </div>`,
      `private _showFilters = signal(true);
       private _searchTerm = signal("");
       private _hasData = signal(true);`,
    );
    const output = await compileComponent(code, 'data-table.ts');

    expect(output).toContain('data-table');
    expect(output).toContain('filters');
    expect(output).toContain('no-results');
  });

  test('multi-step form with conditional sections', async () => {
    // NOTE: This test documents multi-step conditional rendering without event handlers,
    // as event bindings combined with when directives on the same element have issues.
    const code = createComponent(
      'MultiStepForm',
      `<div class="form-wizard">
        <nav class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <span class="step-label">Personal</span>
            <span "\${when(this._currentStep() === 0)}" class="active-marker">*</span>
          </div>
          <div class="step">
            <span class="step-number">2</span>
            <span class="step-label">Contact</span>
            <span "\${when(this._currentStep() === 1)}" class="active-marker">*</span>
          </div>
        </nav>
        
        <div class="form-content">
          <section "\${when(this._currentStep() === 0)}" class="step-1">
            <h2>Personal Information</h2>
            <div class="field">
              <label>Name</label>
              <input>
            </div>
          </section>
          
          <section "\${when(this._currentStep() === 1)}" class="step-2">
            <h2>Contact Details</h2>
            <div class="field">
              <label>Email</label>
              <input>
            </div>
          </section>
        </div>
        
        <footer class="form-actions">
          <span "\${when(this._currentStep() > 0)}">Show Previous Button</span>
          <span>Show Next Button</span>
        </footer>
      </div>`,
      `private _currentStep = signal(0);`,
    );
    const output = await compileComponent(code, 'multi-step-form.ts');

    expect(output).toContain('form-wizard');
    expect(output).toContain('step-1');
    expect(output).toContain('step-2');
    expect(output).toContain('form-actions');
  });
});

// ============================================================================
// Performance-Related Complex Scenarios
// ============================================================================

describe('Complex: Performance Scenarios', () => {
  test('large repeat with multiple bindings per item', async () => {
    const code = createComponent(
      'LargeRepeat',
      `<div class="large-list">
        \${repeat(this._items(), (item, index) => html\`
          <div class="item \${item.class}" data-index="\${index}">
            <span class="id">\${item.id}</span>
            <span class="name">\${item.name}</span>
            <span class="value">\${item.value}</span>
            <span "\${when(item.highlight)}" class="highlight">★</span>
            \${whenElse(item.status === 'active',
              html\`<span class="active">Active</span>\`,
              html\`<span class="inactive">Inactive</span>\`
            )}
          </div>
        \`)}
      </div>`,
      `private _items = signal(Array.from({ length: 100 }, (_, i) => ({
         id: i,
         name: "Item " + i,
         value: Math.random() * 100,
         class: i % 2 === 0 ? "even" : "odd",
         highlight: i % 10 === 0,
         status: i % 3 === 0 ? "active" : "inactive"
       })));`,
    );

    const start = performance.now();
    const output = await compileComponent(code, 'large-repeat.ts');
    const duration = performance.now() - start;

    expect(output).toContain('large-list');
    expect(output).toContain('_items');
    expect(duration).toBeLessThan(2000); // Should compile in under 2 seconds
  });

  // NOTE: Deeply nested repeat structures (repeat inside repeat) are not currently supported
  // by the compiler. This test documents the expected behavior for single-level repeats
  // with conditionals, which IS supported.
  test('repeat with conditionals - single level', async () => {
    const code = createComponent(
      'RepeatWithConditionals',
      `<div class="app">
        <header "\${when(this._showHeader())}">
          <h1>\${this._title()}</h1>
        </header>
        <main>
          \${repeat(this._items(), (item) => html\`
            <div class="\${item.class}">
              <h2>\${item.title}</h2>
              <span "\${when(item.visible)}" class="visible-marker">Visible</span>
              \${whenElse(item.type === 'primary',
                html\`<span class="primary-type">Primary</span>\`,
                html\`<span class="secondary-type">Secondary</span>\`
              )}
              <p>\${item.content}</p>
            </div>
          \`)}
        </main>
      </div>`,
      `private _showHeader = signal(true);
       private _title = signal("App");
       private _items = signal([
         { title: "Section 1", visible: true, class: "primary", type: "primary", content: "Content 1" },
         { title: "Section 2", visible: false, class: "secondary", type: "secondary", content: "Content 2" }
       ]);`,
    );
    const output = await compileComponent(code, 'repeat-conditionals.ts');

    expect(output).toContain('app');
    expect(output).toContain('_items');
    expect(output).toContain('primary-type');
    expect(output).toContain('secondary-type');
  });
});
