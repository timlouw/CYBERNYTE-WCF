/**
 * DEBUG TEST - Direct transformation test
 *
 * Tests the transformComponentSource function directly without esbuild
 */

import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// We need to import the transform function directly
// For now, let's inline test the html parser

import { parseHtmlTemplate, findElementsWithWhenDirective, getElementHtml, getBindingsForElement } from '../utils/html-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Debug: HTML Parser', () => {
  test('parses button with when and click handler', () => {
    const template = `<button "\${when(this._visible())}" @click=\${this._handleClick}>Click</button>`;

    const parsed = parseHtmlTemplate(template);

    console.log('Parsed roots:', JSON.stringify(parsed.roots, null, 2));
    console.log(
      'Parsed bindings:',
      JSON.stringify(
        parsed.bindings.map((b) => ({
          type: b.type,
          signalName: b.signalName,
          eventName: b.eventName,
          handlerExpression: b.handlerExpression,
        })),
        null,
        2,
      ),
    );

    // Check that we found both the when directive and the event handler
    const hasWhen = parsed.bindings.some((b) => b.type === 'when');
    const hasEvent = parsed.bindings.some((b) => b.type === 'event');

    console.log('Has when:', hasWhen);
    console.log('Has event:', hasEvent);

    expect(hasWhen).toBe(true);
    expect(hasEvent).toBe(true);
  });

  test('parses wrapper div with when and nested button with click', () => {
    const template = `<div "\${when(this._visible())}"><button @click=\${this._handleClick}>Click</button></div>`;

    const parsed = parseHtmlTemplate(template);

    console.log(
      'Parsed bindings:',
      JSON.stringify(
        parsed.bindings.map((b) => ({
          type: b.type,
          signalName: b.signalName,
          eventName: b.eventName,
          handlerExpression: b.handlerExpression,
          element: b.element.tagName,
        })),
        null,
        2,
      ),
    );

    const whenBindings = parsed.bindings.filter((b) => b.type === 'when');
    const eventBindings = parsed.bindings.filter((b) => b.type === 'event');

    console.log('When bindings:', whenBindings.length);
    console.log('Event bindings:', eventBindings.length);

    expect(whenBindings.length).toBe(1);
    expect(eventBindings.length).toBe(1);
    expect(whenBindings[0].element.tagName).toBe('div');
    expect(eventBindings[0].element.tagName).toBe('button');
  });

  test('debug: processConditionalElementHtml flow', () => {
    const template = `<button "\${when(this._visible())}" @click=\${this._handleClick}>Click</button>`;

    const parsed = parseHtmlTemplate(template);
    const conditionalElements = findElementsWithWhenDirective(parsed.roots);

    console.log('Conditional elements found:', conditionalElements.length);

    if (conditionalElements.length > 0) {
      const condEl = conditionalElements[0];
      let processedHtml = getElementHtml(condEl, template);
      console.log('Element HTML:', processedHtml);

      // Get bindings for this element
      const bindings = getBindingsForElement(condEl, parsed.bindings);
      console.log(
        'Bindings for element:',
        bindings.map((b) => ({ type: b.type, eventName: b.eventName })),
      );

      // Check if there are any event bindings for the conditional element
      const eventBindings = bindings.filter((b) => b.type === 'event');
      console.log('Event bindings in conditional:', eventBindings.length);

      // 1. Remove when directive
      if (condEl.whenDirective) {
        processedHtml = processedHtml.replace(condEl.whenDirective, '');
        console.log('After removing when:', processedHtml);
      }

      // 2. Convert @event bindings to data-evt-* attributes
      const eventAttrRegex = /@([\w.]+)=\$\{([^}]+)\}/g;
      const eventReplacements: Array<{ original: string; replacement: string }> = [];
      let eventIdCounter = 0;

      let eventMatch: RegExpExecArray | null;
      while ((eventMatch = eventAttrRegex.exec(processedHtml)) !== null) {
        const fullMatch = eventMatch[0];
        const eventSpec = eventMatch[1]; // e.g., "click" or "click.stop.prevent"
        // const handlerExpression = eventMatch[2].trim(); // Handler expression (unused in this debug test)

        // Parse event name and modifiers
        const parts = eventSpec.split('.');
        const eventName = parts[0];
        const modifiers = parts.slice(1);

        const eventId = `e${eventIdCounter++}`;

        // Build data-evt attribute value
        const attrValue = modifiers.length > 0 ? `${eventId}:${modifiers.join(':')}` : eventId;

        // Store the replacement
        eventReplacements.push({
          original: fullMatch,
          replacement: `data-evt-${eventName}="${attrValue}"`,
        });

        console.log('Event match:', fullMatch, '→', `data-evt-${eventName}="${attrValue}"`);
      }

      // Apply event replacements
      for (const { original, replacement } of eventReplacements) {
        processedHtml = processedHtml.replace(original, replacement);
      }

      console.log('After converting events:', processedHtml);

      // This should now be: <button data-evt-click="e0">Click</button>
      expect(processedHtml).toContain('data-evt-click');
      expect(processedHtml).not.toContain('@click');
    }
  });

  test('nested button click inside when div', () => {
    // This is the case where when is on wrapper, click is on nested button
    const template = `<div "\${when(this._visible())}"><button @click=\${this._handleClick}>Click</button></div>`;

    const parsed = parseHtmlTemplate(template);
    const conditionalElements = findElementsWithWhenDirective(parsed.roots);

    console.log('=== Nested Button Test ===');
    console.log('Conditional elements found:', conditionalElements.length);

    if (conditionalElements.length > 0) {
      const condEl = conditionalElements[0];
      let processedHtml = getElementHtml(condEl, template);
      console.log('Element HTML:', processedHtml);

      // This HTML should include the nested button with @click
      expect(processedHtml).toContain('@click');

      // 1. Remove when directive
      if (condEl.whenDirective) {
        processedHtml = processedHtml.replace(condEl.whenDirective, '');
        console.log('After removing when:', processedHtml);
      }

      // 2. Convert @event bindings to data-evt-* attributes
      const eventAttrRegex = /@([\w.]+)=\$\{([^}]+)\}/g;
      const eventReplacements: Array<{ original: string; replacement: string }> = [];
      let eventIdCounter = 0;

      let eventMatch: RegExpExecArray | null;
      while ((eventMatch = eventAttrRegex.exec(processedHtml)) !== null) {
        const fullMatch = eventMatch[0];
        const eventSpec = eventMatch[1];
        // const handlerExpression = eventMatch[2].trim(); // Handler expression (unused in this debug test)
        const parts = eventSpec.split('.');
        const eventName = parts[0];
        const modifiers = parts.slice(1);
        const eventId = `e${eventIdCounter++}`;
        const attrValue = modifiers.length > 0 ? `${eventId}:${modifiers.join(':')}` : eventId;
        eventReplacements.push({
          original: fullMatch,
          replacement: `data-evt-${eventName}="${attrValue}"`,
        });
        console.log('Event match:', fullMatch, '→', `data-evt-${eventName}="${attrValue}"`);
      }

      // Apply event replacements
      for (const { original, replacement } of eventReplacements) {
        processedHtml = processedHtml.replace(original, replacement);
      }

      console.log('After converting events:', processedHtml);

      expect(processedHtml).toContain('data-evt-click');
      expect(processedHtml).not.toContain('@click');
    }
  });
});

describe('Debug: Full Component Source Transformation', () => {
  test('reads actual transformation output', async () => {
    // Create a temporary component source file
    const sourceCode = `
import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const EventWhenTest = registerComponent(
  { selector: 'eventwhentest-comp', type: 'component' },
  class extends Component {
    private _visible = signal(true);
    render = () => {
      return html\`<button "\${when(this._visible())}" @click=\${this._handleClick}>Click</button>\`;
    };
    private _handleClick() { console.log('clicked'); }
    static styles = css\`\`;
  },
);
`.trim();

    // Write to temp file
    const tempDir = path.join(__dirname, 'debug-output');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, 'direct-transform.ts');
    fs.writeFileSync(tempFile, sourceCode);

    // Now we need to simulate what transformComponentSource does
    // Since it's not exported, let's trace through the logic manually

    // Parse the HTML template
    const templateMatch = sourceCode.match(/html`([^`]+)`/);
    if (templateMatch) {
      const templateContent = templateMatch[1];
      console.log('Template content:', templateContent);

      const parsed = parseHtmlTemplate(templateContent);
      console.log(
        'Parsed bindings:',
        parsed.bindings.map((b) => ({
          type: b.type,
          signalName: b.signalName,
          eventName: b.eventName,
          element: b.element.tagName,
        })),
      );

      const conditionalElements = findElementsWithWhenDirective(parsed.roots);
      console.log('Conditional elements:', conditionalElements.length);

      // For each conditional element, process it
      for (const condEl of conditionalElements) {
        let html = getElementHtml(condEl, templateContent);
        console.log('Original HTML:', html);

        // Remove when directive
        if (condEl.whenDirective) {
          html = html.replace(condEl.whenDirective, '');
        }

        // Convert @events
        const eventAttrRegex = /@([\w.]+)=\$\{([^}]+)\}/g;
        let match: RegExpExecArray | null;
        const replacements: Array<{ original: string; replacement: string }> = [];
        let eventId = 0;

        while ((match = eventAttrRegex.exec(html)) !== null) {
          const eventName = match[1].split('.')[0];
          const fullMatch = match[0];
          replacements.push({
            original: fullMatch,
            replacement: `data-evt-${eventName}="e${eventId++}"`,
          });
        }

        for (const { original, replacement } of replacements) {
          html = html.replace(original, replacement);
        }

        console.log('Processed HTML:', html);

        // Check that it's valid
        expect(html).not.toContain('@click');
        expect(html).toContain('data-evt-click');
      }
    }
  });
});
