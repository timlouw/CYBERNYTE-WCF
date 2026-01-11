/**
 * HTML Parser Tests
 *
 * Comprehensive tests for the state machine HTML parser.
 * Run with: bun test framework/compiler/utils/html-parser.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  parseHtmlTemplate,
  walkElements,
  findElements,
  findElementsWithWhenDirective,
  getElementHtml,
  getElementInnerHtml,
  getBindingsForElement,
  isElementInside,
} from './html-parser';

// ============================================================================
// Basic Parsing Tests
// ============================================================================

describe('Basic HTML Parsing', () => {
  test('parses single element', () => {
    const result = parseHtmlTemplate('<div></div>');
    expect(result.roots.length).toBe(1);
    expect(result.roots[0].tagName).toBe('div');
  });

  test('parses self-closing element', () => {
    const result = parseHtmlTemplate('<br />');
    expect(result.roots.length).toBe(1);
    expect(result.roots[0].tagName).toBe('br');
    expect(result.roots[0].isSelfClosing).toBe(true);
  });

  test('parses void element without closing', () => {
    const result = parseHtmlTemplate('<input><span></span>');
    expect(result.roots.length).toBe(2);
    expect(result.roots[0].tagName).toBe('input');
    expect(result.roots[0].isVoid).toBe(true);
    expect(result.roots[1].tagName).toBe('span');
  });

  test('parses multiple sibling elements', () => {
    const result = parseHtmlTemplate('<div></div><span></span><p></p>');
    expect(result.roots.length).toBe(3);
    expect(result.roots[0].tagName).toBe('div');
    expect(result.roots[1].tagName).toBe('span');
    expect(result.roots[2].tagName).toBe('p');
  });

  test('parses element with text content', () => {
    const result = parseHtmlTemplate('<div>Hello World</div>');
    expect(result.roots[0].textContent.length).toBe(1);
    expect(result.roots[0].textContent[0].content).toBe('Hello World');
  });

  test('handles empty elements', () => {
    const result = parseHtmlTemplate('<div></div>');
    expect(result.roots[0].children.length).toBe(0);
    expect(result.roots[0].textContent.length).toBe(0);
  });
});

// ============================================================================
// Attribute Parsing Tests
// ============================================================================

describe('Attribute Parsing', () => {
  test('parses single attribute', () => {
    const result = parseHtmlTemplate('<div class="box"></div>');
    expect(result.roots[0].attributes.get('class')?.value).toBe('box');
  });

  test('parses multiple attributes', () => {
    const result = parseHtmlTemplate('<div id="myId" class="box" data-value="123"></div>');
    expect(result.roots[0].attributes.get('id')?.value).toBe('myId');
    expect(result.roots[0].attributes.get('class')?.value).toBe('box');
    expect(result.roots[0].attributes.get('data-value')?.value).toBe('123');
  });

  test('parses single-quoted attributes', () => {
    const result = parseHtmlTemplate("<div class='box'></div>");
    expect(result.roots[0].attributes.get('class')?.value).toBe('box');
  });

  test('parses boolean attributes', () => {
    const result = parseHtmlTemplate('<input disabled readonly>');
    expect(result.roots[0].attributes.has('disabled')).toBe(true);
    expect(result.roots[0].attributes.has('readonly')).toBe(true);
  });

  test('parses attributes with spaces around equals', () => {
    const result = parseHtmlTemplate('<div class = "box"></div>');
    expect(result.roots[0].attributes.get('class')?.value).toBe('box');
  });

  test('parses style attribute with multiple properties', () => {
    const result = parseHtmlTemplate('<div style="color: red; background: blue;"></div>');
    expect(result.roots[0].attributes.get('style')?.value).toBe('color: red; background: blue;');
  });

  test('preserves attribute positions', () => {
    const html = '<div class="box"></div>';
    const result = parseHtmlTemplate(html);
    const attr = result.roots[0].attributes.get('class')!;
    expect(html.substring(attr.start, attr.end)).toBe('class="box"');
    expect(html.substring(attr.valueStart, attr.valueEnd)).toBe('box');
  });

  test('handles attributes with expressions inside', () => {
    const result = parseHtmlTemplate('<div style="color: ${this.color()}"></div>');
    expect(result.roots[0].attributes.get('style')?.value).toBe('color: ${this.color()}');
  });
});

// ============================================================================
// Nested Elements Tests
// ============================================================================

describe('Nested Elements', () => {
  test('parses single level nesting', () => {
    const result = parseHtmlTemplate('<div><span></span></div>');
    expect(result.roots.length).toBe(1);
    expect(result.roots[0].children.length).toBe(1);
    expect(result.roots[0].children[0].tagName).toBe('span');
    expect(result.roots[0].children[0].parent).toBe(result.roots[0]);
  });

  test('parses deeply nested elements (5 levels)', () => {
    const html = '<div><section><article><p><span>Deep</span></p></article></section></div>';
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(1);
    let current = result.roots[0];

    const expectedTags = ['div', 'section', 'article', 'p', 'span'];
    for (let i = 0; i < expectedTags.length; i++) {
      expect(current.tagName).toBe(expectedTags[i]);
      if (i < expectedTags.length - 1) {
        expect(current.children.length).toBe(1);
        current = current.children[0];
      }
    }
  });

  test('parses very deeply nested elements (10 levels)', () => {
    const depth = 10;
    let html = '';
    for (let i = 0; i < depth; i++) html += `<div data-level="${i}">`;
    html += 'Content';
    for (let i = 0; i < depth; i++) html += '</div>';

    const result = parseHtmlTemplate(html);

    let current = result.roots[0];
    for (let i = 0; i < depth; i++) {
      expect(current.tagName).toBe('div');
      expect(current.attributes.get('data-level')?.value).toBe(String(i));
      if (i < depth - 1) {
        current = current.children[0];
      }
    }
  });

  test('parses multiple children at same level', () => {
    const result = parseHtmlTemplate('<div><span></span><p></p><a></a></div>');
    expect(result.roots[0].children.length).toBe(3);
    expect(result.roots[0].children[0].tagName).toBe('span');
    expect(result.roots[0].children[1].tagName).toBe('p');
    expect(result.roots[0].children[2].tagName).toBe('a');
  });

  test('parses nested same-name elements', () => {
    const html = '<div class="outer"><div class="middle"><div class="inner"></div></div></div>';
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(1);
    expect(result.roots[0].attributes.get('class')?.value).toBe('outer');
    expect(result.roots[0].children[0].attributes.get('class')?.value).toBe('middle');
    expect(result.roots[0].children[0].children[0].attributes.get('class')?.value).toBe('inner');
  });

  test('parses complex nested structure', () => {
    const html = `
      <div class="container">
        <header>
          <h1>Title</h1>
          <nav>
            <a href="#">Link 1</a>
            <a href="#">Link 2</a>
          </nav>
        </header>
        <main>
          <article>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
          </article>
        </main>
        <footer>
          <span>Footer</span>
        </footer>
      </div>
    `;
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(1);
    const container = result.roots[0];
    expect(container.children.length).toBe(3); // header, main, footer

    const header = container.children[0];
    expect(header.tagName).toBe('header');
    expect(header.children.length).toBe(2); // h1, nav

    const nav = header.children[1];
    expect(nav.tagName).toBe('nav');
    expect(nav.children.length).toBe(2); // two anchor tags
  });
});

// ============================================================================
// Signal Binding Detection Tests
// ============================================================================

describe('Signal Binding Detection', () => {
  test('detects text binding', () => {
    const result = parseHtmlTemplate('<span>${this.count()}</span>');
    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].type).toBe('text');
    expect(result.bindings[0].signalName).toBe('count');
  });

  test('detects style binding', () => {
    const result = parseHtmlTemplate('<div style="color: ${this.textColor()}"></div>');
    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].type).toBe('style');
    expect(result.bindings[0].signalName).toBe('textColor');
    expect(result.bindings[0].property).toBe('color');
  });

  test('detects attribute binding', () => {
    const result = parseHtmlTemplate('<input value="${this.inputValue()}">');
    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].type).toBe('attr');
    expect(result.bindings[0].signalName).toBe('inputValue');
    expect(result.bindings[0].property).toBe('value');
  });

  test('detects when directive', () => {
    const result = parseHtmlTemplate('<div "${when(this.isVisible())}"></div>');
    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].type).toBe('when');
    expect(result.bindings[0].signalName).toBe('isVisible');
  });

  test('detects multiple bindings in same element', () => {
    const result = parseHtmlTemplate('<div class="${this.className()}" style="color: ${this.color()}">${this.text()}</div>');
    expect(result.bindings.length).toBe(3);

    const types = result.bindings.map((b) => b.type).sort();
    expect(types).toEqual(['attr', 'style', 'text']);
  });

  test('detects bindings in nested elements', () => {
    const html = '<div>${this.outer()}<span>${this.inner()}</span></div>';
    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(2);
    expect(result.bindings[0].signalName).toBe('outer');
    expect(result.bindings[1].signalName).toBe('inner');
  });

  test('detects multiple style bindings', () => {
    const result = parseHtmlTemplate('<div style="color: ${this.color()}; background: ${this.bg()}"></div>');
    expect(result.bindings.length).toBe(2);
    expect(result.bindings[0].property).toBe('color');
    expect(result.bindings[1].property).toBe('background');
  });

  test('preserves binding positions', () => {
    const html = '<span>${this.count()}</span>';
    const result = parseHtmlTemplate(html);
    const binding = result.bindings[0];
    expect(html.substring(binding.expressionStart, binding.expressionEnd)).toBe('${this.count()}');
  });
});

// ============================================================================
// Complex Binding Scenarios
// ============================================================================

describe('Complex Binding Scenarios', () => {
  test('handles when directive with nested bindings', () => {
    const html = '<div "${when(this.visible())}"><span>${this.text()}</span></div>';
    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(2);

    const whenBinding = result.bindings.find((b) => b.type === 'when');
    const textBinding = result.bindings.find((b) => b.type === 'text');

    expect(whenBinding?.signalName).toBe('visible');
    expect(textBinding?.signalName).toBe('text');
  });

  test('handles deeply nested bindings', () => {
    const html = `
      <div class="\${this.cls1()}">
        <section style="color: \${this.color()}">
          <article "\${when(this.show())}">
            <p>\${this.para()}</p>
            <span>\${this.span()}</span>
          </article>
        </section>
      </div>
    `;
    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(5);

    const signals = result.bindings.map((b) => b.signalName).sort();
    expect(signals).toEqual(['cls1', 'color', 'para', 'show', 'span']);
  });

  test('handles multiple elements with same binding type', () => {
    const html = `
      <div>\${this.text1()}</div>
      <div>\${this.text2()}</div>
      <div>\${this.text3()}</div>
    `;
    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(3);
    expect(result.bindings.every((b) => b.type === 'text')).toBe(true);
  });

  test('handles mixed static and dynamic attributes', () => {
    const html = '<div id="static" class="${this.dynamic()}" data-static="value"></div>';
    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(1);
    expect(result.bindings[0].signalName).toBe('dynamic');
    expect(result.roots[0].attributes.get('id')?.value).toBe('static');
    expect(result.roots[0].attributes.get('data-static')?.value).toBe('value');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  test('handles < and > in attribute values', () => {
    const result = parseHtmlTemplate('<div title="1 < 2 > 0"></div>');
    expect(result.roots[0].attributes.get('title')?.value).toBe('1 < 2 > 0');
  });

  test('handles quotes in attribute values', () => {
    const result = parseHtmlTemplate(`<div title="He said 'hello'"></div>`);
    expect(result.roots[0].attributes.get('title')?.value).toBe("He said 'hello'");
  });

  test('handles multi-line elements', () => {
    const html = `<div
      class="box"
      id="myDiv"
      style="color: red"
    >Content</div>`;
    const result = parseHtmlTemplate(html);

    expect(result.roots[0].tagName).toBe('div');
    expect(result.roots[0].attributes.get('class')?.value).toBe('box');
    expect(result.roots[0].attributes.get('id')?.value).toBe('myDiv');
  });

  test('handles HTML comments', () => {
    const result = parseHtmlTemplate('<div><!-- comment --><span></span></div>');
    expect(result.roots[0].children.length).toBe(1);
    expect(result.roots[0].children[0].tagName).toBe('span');
  });

  test('handles multiple consecutive comments', () => {
    const result = parseHtmlTemplate('<!-- c1 --><!-- c2 --><div></div><!-- c3 -->');
    expect(result.roots.length).toBe(1);
    expect(result.roots[0].tagName).toBe('div');
  });

  test('handles whitespace between elements', () => {
    const result = parseHtmlTemplate('<div>  <span>  </span>  </div>');
    expect(result.roots[0].children.length).toBe(1);
    expect(result.roots[0].children[0].tagName).toBe('span');
  });

  test('handles custom element names', () => {
    const result = parseHtmlTemplate('<my-component data-attr="value"></my-component>');
    expect(result.roots[0].tagName).toBe('my-component');
  });

  test('handles elements with colons', () => {
    const result = parseHtmlTemplate('<svg:rect></svg:rect>');
    expect(result.roots[0].tagName).toBe('svg:rect');
  });

  test('handles empty attribute value', () => {
    const result = parseHtmlTemplate('<div class=""></div>');
    expect(result.roots[0].attributes.get('class')?.value).toBe('');
  });

  test('handles orphan closing tags gracefully', () => {
    const result = parseHtmlTemplate('<div></div></span></p>');
    expect(result.roots.length).toBe(1);
    expect(result.roots[0].tagName).toBe('div');
  });

  test('handles unclosed tags gracefully', () => {
    const result = parseHtmlTemplate('<div><span>Text</div>');
    expect(result.roots.length).toBe(1);
    // Parser should handle unclosed span
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  test('walkElements visits all elements', () => {
    const html = '<div><span><a></a></span><p></p></div>';
    const result = parseHtmlTemplate(html);

    const visited: string[] = [];
    walkElements(result.roots, (el) => visited.push(el.tagName));

    expect(visited).toEqual(['div', 'span', 'a', 'p']);
  });

  test('walkElements provides correct depth', () => {
    const html = '<div><span><a></a></span></div>';
    const result = parseHtmlTemplate(html);

    const depths: number[] = [];
    walkElements(result.roots, (_, depth) => depths.push(depth));

    expect(depths).toEqual([0, 1, 2]);
  });

  test('findElements filters correctly', () => {
    const html = '<div class="box"><span class="item"></span><p></p></div>';
    const result = parseHtmlTemplate(html);

    const withClass = findElements(result.roots, (el) => el.attributes.has('class'));
    expect(withClass.length).toBe(2);
  });

  test('findElementsWithWhenDirective works', () => {
    const html = '<div "${when(this.show())}"><span></span></div>';
    const result = parseHtmlTemplate(html);

    const withWhen = findElementsWithWhenDirective(result.roots);
    expect(withWhen.length).toBe(1);
    expect(withWhen[0].tagName).toBe('div');
  });

  test('getElementHtml returns full element HTML', () => {
    const html = '<div class="box"><span>Text</span></div>';
    const result = parseHtmlTemplate(html);

    const outerHtml = getElementHtml(result.roots[0], html);
    expect(outerHtml).toBe(html);
  });

  test('getElementInnerHtml returns content only', () => {
    const html = '<div class="box"><span>Text</span></div>';
    const result = parseHtmlTemplate(html);

    const innerHtml = getElementInnerHtml(result.roots[0], html);
    expect(innerHtml).toBe('<span>Text</span>');
  });

  test('getBindingsForElement includes nested bindings', () => {
    const html = '<div "${when(this.show())}"><span>${this.text()}</span></div><p>${this.other()}</p>';
    const result = parseHtmlTemplate(html);

    const divBindings = getBindingsForElement(result.roots[0], result.bindings);
    expect(divBindings.length).toBe(2); // when and text, not other
  });

  test('isElementInside correctly identifies ancestry', () => {
    const html = '<div><section><span></span></section></div>';
    const result = parseHtmlTemplate(html);

    const div = result.roots[0];
    const section = div.children[0];
    const span = section.children[0];

    expect(isElementInside(span, div)).toBe(true);
    expect(isElementInside(span, section)).toBe(true);
    expect(isElementInside(section, div)).toBe(true);
    expect(isElementInside(div, section)).toBe(false);
  });
});

// ============================================================================
// Real-World Template Tests
// ============================================================================

describe('Real-World Templates', () => {
  test('handles component-like template', () => {
    const html = `
      <div class="always-visible">Always visible - Count: \${this.count()}</div>
      <div "\${when(this.isVisible())}" class="conditional-box" style="background-color: \${this.color()}">
        <span>Conditional content - Count: \${this.count()}</span>
        <p>Text: \${this.text()}</p>
      </div>
      <div class="footer">Footer - always visible</div>
    `;
    const result = parseHtmlTemplate(html);

    // Should have 3 root divs
    expect(result.roots.length).toBe(3);

    // Check bindings
    expect(result.bindings.length).toBe(5);

    const whenBinding = result.bindings.find((b) => b.type === 'when');
    expect(whenBinding?.signalName).toBe('isVisible');

    const styleBinding = result.bindings.find((b) => b.type === 'style');
    expect(styleBinding?.signalName).toBe('color');

    const textBindings = result.bindings.filter((b) => b.type === 'text');
    expect(textBindings.length).toBe(3);
  });

  test('handles form template', () => {
    const html = `
      <form class="\${this.formClass()}">
        <div class="field">
          <label>Name</label>
          <input type="text" value="\${this.name()}" placeholder="Enter name">
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" value="\${this.email()}">
        </div>
        <button type="submit" disabled="\${this.isSubmitting()}">
          \${this.buttonText()}
        </button>
      </form>
    `;
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(1);
    expect(result.roots[0].tagName).toBe('form');

    // 5 bindings: formClass, name, email, isSubmitting, buttonText
    expect(result.bindings.length).toBe(5);
  });

  test('handles table template', () => {
    const html = `
      <table class="data-table">
        <thead>
          <tr>
            <th>\${this.col1Header()}</th>
            <th>\${this.col2Header()}</th>
          </tr>
        </thead>
        <tbody>
          <tr "\${when(this.hasData())}">
            <td>\${this.col1Value()}</td>
            <td style="color: \${this.col2Color()}">\${this.col2Value()}</td>
          </tr>
        </tbody>
      </table>
    `;
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(1);

    const bindings = result.bindings;
    expect(bindings.length).toBe(6);

    const whenBinding = bindings.find((b) => b.type === 'when');
    expect(whenBinding?.signalName).toBe('hasData');
  });

  test('handles navigation template', () => {
    const html = `
      <nav class="\${this.navClass()}">
        <ul>
          <li class="\${this.item1Active()}"><a href="#">Home</a></li>
          <li class="\${this.item2Active()}"><a href="#">About</a></li>
          <li class="\${this.item3Active()}"><a href="#">Contact</a></li>
        </ul>
        <div "\${when(this.showSearch())}" class="search">
          <input type="search" value="\${this.searchQuery()}">
        </div>
      </nav>
    `;
    const result = parseHtmlTemplate(html);

    // navClass, item1Active, item2Active, item3Active, showSearch, searchQuery
    expect(result.bindings.length).toBe(6);
  });
});

// ============================================================================
// Position Accuracy Tests
// ============================================================================

describe('Position Accuracy', () => {
  test('element positions are accurate', () => {
    const html = '<div><span>Text</span></div>';
    const result = parseHtmlTemplate(html);

    const div = result.roots[0];
    expect(div.tagStart).toBe(0);
    expect(html[div.tagStart]).toBe('<');
    expect(html.substring(div.tagStart, div.closeTagEnd)).toBe(html);

    const span = div.children[0];
    expect(html.substring(span.tagStart, span.closeTagEnd)).toBe('<span>Text</span>');
  });

  test('attribute positions are accurate', () => {
    const html = '<div class="box" id="test"></div>';
    const result = parseHtmlTemplate(html);

    const classAttr = result.roots[0].attributes.get('class')!;
    expect(html.substring(classAttr.start, classAttr.end)).toBe('class="box"');
    expect(html.substring(classAttr.valueStart, classAttr.valueEnd)).toBe('box');

    const idAttr = result.roots[0].attributes.get('id')!;
    expect(html.substring(idAttr.start, idAttr.end)).toBe('id="test"');
  });

  test('binding positions are accurate', () => {
    const html = '<span>Count: ${this.count()}</span>';
    const result = parseHtmlTemplate(html);

    const binding = result.bindings[0];
    expect(html.substring(binding.expressionStart, binding.expressionEnd)).toBe('${this.count()}');
  });

  test('nested binding positions are accurate', () => {
    const html = '<div><span style="color: ${this.color()}">${this.text()}</span></div>';
    const result = parseHtmlTemplate(html);

    for (const binding of result.bindings) {
      const extracted = html.substring(binding.expressionStart, binding.expressionEnd);
      expect(extracted).toBe(binding.fullExpression);
    }
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

describe('Stress Tests', () => {
  test('handles 50 sibling elements', () => {
    let html = '';
    for (let i = 0; i < 50; i++) {
      html += `<div data-index="${i}">Item ${i}</div>`;
    }
    const result = parseHtmlTemplate(html);

    expect(result.roots.length).toBe(50);
    expect(result.roots[49].attributes.get('data-index')?.value).toBe('49');
  });

  test('handles 20 levels of nesting', () => {
    const depth = 20;
    let html = '';
    for (let i = 0; i < depth; i++) html += `<div data-level="${i}">`;
    html += 'Deep content';
    for (let i = 0; i < depth; i++) html += '</div>';

    const result = parseHtmlTemplate(html);

    let current = result.roots[0];
    let count = 0;
    while (current) {
      count++;
      current = current.children[0];
    }
    expect(count).toBe(depth);
  });

  test('handles many bindings', () => {
    let html = '<div>';
    for (let i = 0; i < 30; i++) {
      html += `<span>\${this.signal${i}()}</span>`;
    }
    html += '</div>';

    const result = parseHtmlTemplate(html);

    expect(result.bindings.length).toBe(30);
    expect(result.bindings[29].signalName).toBe('signal29');
  });

  test('handles many attributes', () => {
    let attrs = '';
    for (let i = 0; i < 20; i++) {
      attrs += ` data-attr-${i}="value${i}"`;
    }
    const html = `<div${attrs}></div>`;

    const result = parseHtmlTemplate(html);

    expect(result.roots[0].attributes.size).toBe(20);
    expect(result.roots[0].attributes.get('data-attr-19')?.value).toBe('value19');
  });

  test('handles complex mixed content', () => {
    const html = `
      <div class="\${this.c1()}">
        <div class="\${this.c2()}">
          <div class="\${this.c3()}">
            <span "\${when(this.show1())}">\${this.t1()}</span>
            <span "\${when(this.show2())}">\${this.t2()}</span>
            <span "\${when(this.show3())}">\${this.t3()}</span>
          </div>
        </div>
      </div>
      <div class="\${this.c4()}">
        <p style="color: \${this.color1()}; background: \${this.bg1()}">\${this.t4()}</p>
        <p style="color: \${this.color2()}; background: \${this.bg2()}">\${this.t5()}</p>
      </div>
    `;
    const result = parseHtmlTemplate(html);

    // 4 class attrs + 3 whens + 5 text + 4 styles = 16 bindings
    expect(result.bindings.length).toBe(16);
  });
});
