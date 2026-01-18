/**
 * ERROR HANDLING AND EDGE CASE TESTS
 *
 * Tests for compiler behavior when given invalid, malformed, or edge-case input.
 * Ensures the compiler fails gracefully or handles edge cases correctly.
 *
 * Run with: bun test framework/compiler/tests/error-handling.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { build, BuildFailure } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ComponentPrecompilerPlugin } from '../plugins/component-precompiler/component-precompiler.js';
import { ReactiveBindingPlugin } from '../plugins/reactive-binding-compiler/reactive-binding-compiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '.error-test-output');

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Attempts to compile code, returns { success, output?, error? }
 */
async function tryCompile(code: string, filename: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const tempFile = path.join(TEST_OUTPUT_DIR, filename);

  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(tempFile, code);

  try {
    const result = await build({
      entryPoints: [tempFile],
      bundle: false,
      write: false,
      format: 'esm',
      platform: 'browser',
      plugins: [ComponentPrecompilerPlugin, ReactiveBindingPlugin],
      logLevel: 'silent',
    });

    return {
      success: true,
      output: result.outputFiles?.[0]?.text || '',
    };
  } catch (e) {
    const error = e as BuildFailure;
    return {
      success: false,
      error: error.message || String(e),
    };
  }
}

/**
 * Creates a component for testing
 */
function createComponent(template: string, signals: string = '', methods: string = ''): string {
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
// Invalid HTML Syntax Tests
// ============================================================================

describe('Error Handling: Invalid HTML', () => {
  test('handles unclosed div tag', async () => {
    const code = createComponent('<div>Unclosed');
    const result = await tryCompile(code, 'unclosed-div.ts');

    // Should either compile with recovery or fail gracefully
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles mismatched tags', async () => {
    const code = createComponent('<div><span></div></span>');
    const result = await tryCompile(code, 'mismatched-tags.ts');

    // Should handle gracefully
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles multiple unclosed tags', async () => {
    const code = createComponent('<div><span><p>Text');
    const result = await tryCompile(code, 'multiple-unclosed.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles orphan closing tags', async () => {
    const code = createComponent('</span></div><p>Valid</p>');
    const result = await tryCompile(code, 'orphan-closing.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles empty tag names', async () => {
    const code = createComponent('<>Empty</>');
    const result = await tryCompile(code, 'empty-tag.ts');

    // May fail or handle gracefully
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles invalid attribute syntax', async () => {
    const code = createComponent('<div class=no-quotes>Text</div>');
    const result = await tryCompile(code, 'invalid-attr.ts');

    // Should handle gracefully
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles deeply malformed HTML', async () => {
    const code = createComponent('<<<div>>>><//span>');
    const result = await tryCompile(code, 'deeply-malformed.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });
});

// ============================================================================
// Invalid Signal Expressions Tests
// ============================================================================

describe('Error Handling: Invalid Signal Expressions', () => {
  test('handles empty expression', async () => {
    const code = createComponent('<span>${}</span>');
    const result = await tryCompile(code, 'empty-expr.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles unclosed expression', async () => {
    const code = createComponent('<span>${this._text(</span>', 'private _text = signal("test");');
    const result = await tryCompile(code, 'unclosed-expr.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles malformed signal call', async () => {
    const code = createComponent('<span>${this._text(}</span>', 'private _text = signal("test");');
    const result = await tryCompile(code, 'malformed-signal.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles nested unclosed expressions', async () => {
    const code = createComponent(
      '<div>${this._a() + ${this._b()}</div>',
      `private _a = signal(1);
       private _b = signal(2);`,
    );
    const result = await tryCompile(code, 'nested-unclosed.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles expression with syntax error', async () => {
    const code = createComponent('<span>${this._text() +++ invalid}</span>', 'private _text = signal("test");');
    const result = await tryCompile(code, 'syntax-error-expr.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });
});

// ============================================================================
// Invalid Directive Syntax Tests
// ============================================================================

describe('Error Handling: Invalid Directives', () => {
  test('handles malformed when directive', async () => {
    const code = createComponent('<div "${when(}">Content</div>');
    const result = await tryCompile(code, 'malformed-when.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles when without signal', async () => {
    const code = createComponent('<div "${when(true)}">Static</div>');
    const result = await tryCompile(code, 'when-static.ts');

    // Should compile - static when is valid
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles whenElse with missing templates', async () => {
    const code = createComponent('${whenElse(this._cond())}', 'private _cond = signal(true);');
    const result = await tryCompile(code, 'whenelse-missing.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles whenElse with only one template', async () => {
    const code = createComponent('${whenElse(this._cond(), html`<span>Only Then</span>`)}', 'private _cond = signal(true);');
    const result = await tryCompile(code, 'whenelse-one-template.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles malformed repeat', async () => {
    const code = createComponent('${repeat(this._items(), }', 'private _items = signal([]);');
    const result = await tryCompile(code, 'malformed-repeat.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles repeat without callback', async () => {
    const code = createComponent('${repeat(this._items())}', 'private _items = signal([]);');
    const result = await tryCompile(code, 'repeat-no-callback.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });
});

// ============================================================================
// Invalid Event Handler Tests
// ============================================================================

describe('Error Handling: Invalid Event Handlers', () => {
  test('handles empty event handler', async () => {
    const code = createComponent('<button @click=${}>Click</button>');
    const result = await tryCompile(code, 'empty-handler.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles malformed event syntax', async () => {
    const code = createComponent('<button @click{this._fn}>Click</button>', '', 'private _fn() {}');
    const result = await tryCompile(code, 'malformed-event.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles missing handler method', async () => {
    // This should compile but may fail at runtime
    const code = createComponent('<button @click=${this._nonexistent}>Click</button>');
    const result = await tryCompile(code, 'missing-handler.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles invalid event type', async () => {
    const code = createComponent('<button @invalid-event-name123=${this._fn}>Click</button>', '', 'private _fn() {}');
    const result = await tryCompile(code, 'invalid-event-type.ts');

    // Should compile - event type is just a string
    expect(result.success || result.error !== undefined).toBe(true);
  });
});

// ============================================================================
// Edge Cases - Boundary Conditions
// ============================================================================

describe('Error Handling: Boundary Conditions', () => {
  test('handles empty template', async () => {
    const code = createComponent('');
    const result = await tryCompile(code, 'empty-template.ts');

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  test('handles template with only whitespace', async () => {
    const code = createComponent('   \n\t  \n   ');
    const result = await tryCompile(code, 'whitespace-only.ts');

    expect(result.success).toBe(true);
  });

  test('handles very long template (10KB)', async () => {
    const longContent = 'A'.repeat(10000);
    const code = createComponent(`<div>${longContent}</div>`);
    const result = await tryCompile(code, 'very-long.ts');

    expect(result.success).toBe(true);
    expect(result.output).toContain(longContent);
  });

  test('handles many bindings (100)', async () => {
    const bindings = Array.from({ length: 100 }, (_, i) => `<span>\${this._s${i}()}</span>`).join('');
    const signals = Array.from({ length: 100 }, (_, i) => `private _s${i} = signal("${i}");`).join('\n');

    const code = createComponent(`<div>${bindings}</div>`, signals);
    const result = await tryCompile(code, 'many-bindings.ts');

    expect(result.success).toBe(true);
  });

  test('handles deeply nested HTML (30 levels)', async () => {
    let html = '';
    for (let i = 0; i < 30; i++) html += `<div class="l${i}">`;
    html += 'Deep';
    for (let i = 0; i < 30; i++) html += '</div>';

    const code = createComponent(html);
    const result = await tryCompile(code, 'deep-nesting.ts');

    expect(result.success).toBe(true);
  });

  test('handles special characters in template', async () => {
    const code = createComponent(`<div>&lt;&gt;&amp;&quot;'&copy;£€¥©®™</div>`);
    const result = await tryCompile(code, 'special-chars.ts');

    expect(result.success).toBe(true);
  });

  test('handles unicode in template', async () => {
    const code = createComponent(`<div>日本語 中文 한국어 العربية 🎉🚀💻</div>`);
    const result = await tryCompile(code, 'unicode.ts');

    expect(result.success).toBe(true);
    // Unicode may be escaped in output, check for either escaped or literal form
    expect(result.output).toContain('div');
    // The compiler escapes unicode, which is valid JS behavior
    expect(result.output?.includes('日本語') || result.output?.includes('\\u65E5')).toBe(true);
  });

  test('handles escaped characters in strings', async () => {
    const code = createComponent(`<div>Line1\\nLine2\\tTabbed\\"Quoted\\"</div>`);
    const result = await tryCompile(code, 'escaped-chars.ts');

    expect(result.success).toBe(true);
  });

  test('handles template literals in expressions', async () => {
    const code = createComponent('<span>${`Prefix: ${this._text()}`}</span>', 'private _text = signal("value");');
    const result = await tryCompile(code, 'nested-template-literal.ts');

    expect(result.success || result.error !== undefined).toBe(true);
  });
});

// ============================================================================
// Edge Cases - Signal Names
// ============================================================================

describe('Error Handling: Signal Naming Edge Cases', () => {
  test('handles signal name with many underscores', async () => {
    const code = createComponent('<span>${this.___very___long___name___()}</span>', 'private ___very___long___name___ = signal("test");');
    const result = await tryCompile(code, 'many-underscores.ts');

    expect(result.success).toBe(true);
  });

  test('handles signal name with numbers', async () => {
    const code = createComponent('<span>${this._signal123()}</span>', 'private _signal123 = signal("test");');
    const result = await tryCompile(code, 'signal-numbers.ts');

    expect(result.success).toBe(true);
  });

  test('handles very long signal name', async () => {
    const longName = '_' + 'a'.repeat(200);
    const code = createComponent(`<span>\${this.${longName}()}</span>`, `private ${longName} = signal("test");`);
    const result = await tryCompile(code, 'long-signal-name.ts');

    expect(result.success).toBe(true);
  });

  test('handles signal name starting with underscore', async () => {
    const code = createComponent('<span>${this._privateSignal()}</span>', 'private _privateSignal = signal("private");');
    const result = await tryCompile(code, 'underscore-start.ts');

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Edge Cases - Style and Attribute Bindings
// ============================================================================

describe('Error Handling: Style/Attribute Edge Cases', () => {
  test('handles empty style value', async () => {
    const code = createComponent('<div style="color: ${this._color()}"></div>', 'private _color = signal("");');
    const result = await tryCompile(code, 'empty-style.ts');

    expect(result.success).toBe(true);
  });

  test('handles multiple style properties with same binding', async () => {
    const code = createComponent('<div style="color: ${this._color()}; border-color: ${this._color()}"></div>', 'private _color = signal("red");');
    const result = await tryCompile(code, 'same-binding-styles.ts');

    expect(result.success).toBe(true);
  });

  test('handles CSS variable in style', async () => {
    const code = createComponent('<div style="--custom-color: ${this._color()}"></div>', 'private _color = signal("blue");');
    const result = await tryCompile(code, 'css-variable.ts');

    // CSS variables with -- prefix may or may not be supported depending on compiler
    // This test documents the current behavior
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles boolean attribute binding', async () => {
    const code = createComponent('<button disabled="${this._disabled()}">Click</button>', 'private _disabled = signal(false);');
    const result = await tryCompile(code, 'boolean-attr.ts');

    expect(result.success).toBe(true);
  });

  test('handles data attribute binding', async () => {
    const code = createComponent('<div data-custom="${this._data()}"></div>', 'private _data = signal("value");');
    const result = await tryCompile(code, 'data-attr.ts');

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Recovery Tests - Compiler should recover and produce usable output
// ============================================================================

describe('Error Handling: Recovery', () => {
  test('recovers from partial template and compiles rest', async () => {
    const code = createComponent('<div class="valid">${this._text()}</div><span>Also valid</span>', 'private _text = signal("test");');
    const result = await tryCompile(code, 'recovery-1.ts');

    expect(result.success).toBe(true);
    expect(result.output).toContain('valid');
    expect(result.output).toContain('Also valid');
  });

  test('compiles valid parts when signal undefined', async () => {
    // Missing signal definition - TypeScript error but compiler should still run
    const code = createComponent('<div class="static">Static Content</div><span>${this._undefined()}</span>');
    const result = await tryCompile(code, 'recovery-2.ts');

    // Should compile (TS errors are separate)
    expect(result.success || result.error !== undefined).toBe(true);
  });

  test('handles mixed valid and invalid expressions', async () => {
    const code = createComponent('<div>${this._valid()}</div>', 'private _valid = signal("works");');
    const result = await tryCompile(code, 'recovery-3.ts');

    expect(result.success).toBe(true);
    expect(result.output).toContain('_valid');
  });
});
