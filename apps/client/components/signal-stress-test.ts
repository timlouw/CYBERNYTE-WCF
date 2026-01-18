/**
 * SIGNAL STRESS TEST COMPONENT
 *
 * Tests extreme signal scenarios:
 * - Many signals updating rapidly
 * - Complex signal expressions in templates
 * - Signal subscriptions and cleanup
 * - Cascading signal updates
 * - Memory leak detection scenarios
 */
import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

interface SignalStressProps {}

export const SignalStressComponent = registerComponent<SignalStressProps>(
  { selector: 'signal-stress-test', type: 'component' },
  class extends Component {
    // Array of 50 independent signals to test batching
    private _signals = Array.from({ length: 50 }, (_, i) => signal(i));

    // Nested object signals (reserved for future deep nesting tests)
    // @ts-expect-error Reserved for future use
    private _nested1 = signal({ level1: { level2: { level3: { value: 'deep' } } } });

    // Boolean signals for complex expressions
    private _a = signal(true);
    private _b = signal(false);
    private _c = signal(true);
    private _d = signal(false);

    // Numeric signals for computed displays
    private _x = signal(0);
    private _y = signal(0);
    private _z = signal(0);

    // String signal that changes rapidly
    private _rapidText = signal('Initial');

    // Array signal for large list testing
    private _largeArray = signal<number[]>([]);

    // Control signals
    private _isRunning = signal(false);
    private _updateCount = signal(0);
    private _batchSize = signal(10);
    private _intervalMs = signal(16); // ~60fps

    private _intervalId: number | null = null;

    render = () => {
      return html`
        <div class="stress-test">
          <header class="header">
            <h1>Signal Stress Test</h1>
            <div class="stats">
              <span>Updates: ${this._updateCount()}</span>
              <span>Running: ${this._isRunning() ? 'Yes' : 'No'}</span>
            </div>
          </header>

          <section class="controls">
            <div class="control-row">
              <label>Batch Size: ${this._batchSize()}</label>
              <input type="range" min="1" max="50" value="${this._batchSize()}" 
                     @input=${(e: Event) => this._batchSize(+(e.target as HTMLInputElement).value)}>
            </div>
            <div class="control-row">
              <label>Interval (ms): ${this._intervalMs()}</label>
              <input type="range" min="1" max="100" value="${this._intervalMs()}" 
                     @input=${(e: Event) => this._intervalMs(+(e.target as HTMLInputElement).value)}>
            </div>
            <div class="buttons">
              <button @click=${this._startStressTest} "${when(!this._isRunning())}">Start Stress Test</button>
              <button @click=${this._stopStressTest} "${when(this._isRunning())}">Stop Stress Test</button>
              <button @click=${this._resetAll}>Reset All</button>
              <button @click=${this._triggerBurstUpdate}>Burst Update (100)</button>
            </div>
          </section>

          <!-- Test 1: Many independent signals -->
          <section class="test-section">
            <h2>Test 1: 50 Independent Signals</h2>
            <div class="signal-grid">
              ${repeat(
                this._signals.map((s, i) => ({ signal: s, index: i })),
                (item) => html` <div class="signal-cell" style="background-color: hsl(${item.signal() * 7}, 70%, 80%)"> ${item.index}: ${item.signal()} </div> `,
              )}
            </div>
          </section>

          <!-- Test 2: Complex boolean expressions -->
          <section class="test-section">
            <h2>Test 2: Complex Boolean Expressions</h2>
            <div class="bool-grid">
              <div class="bool-control">
                <button @click=${() => this._a(!this._a())}>A: ${this._a()}</button>
                <button @click=${() => this._b(!this._b())}>B: ${this._b()}</button>
                <button @click=${() => this._c(!this._c())}>C: ${this._c()}</button>
                <button @click=${() => this._d(!this._d())}>D: ${this._d()}</button>
              </div>
              
              <!-- Complex conditional expressions -->
              <div "${when(this._a() && this._b())}" class="expr-result">A && B = true</div>
              <div "${when(this._a() || this._b())}" class="expr-result">A || B = true</div>
              <div "${when(!this._a())}" class="expr-result">!A = true</div>
              <div "${when(this._a() && !this._b() && this._c())}" class="expr-result">A && !B && C = true</div>
              <div "${when((this._a() || this._b()) && (this._c() || this._d()))}" class="expr-result">(A||B) && (C||D) = true</div>
              
              <!-- whenElse with complex expressions -->
              ${whenElse(this._a() && this._c(), html`<div class="expr-then">A && C is TRUE</div>`, html`<div class="expr-else">A && C is FALSE</div>`)}
              
              ${whenElse(this._b() || this._d(), html`<div class="expr-then">B || D is TRUE</div>`, html`<div class="expr-else">B || D is FALSE</div>`)}
            </div>
          </section>

          <!-- Test 3: Numeric computations displayed -->
          <section class="test-section">
            <h2>Test 3: Computed Numeric Displays</h2>
            <div class="numeric-display">
              <div class="num-controls">
                <button @click=${() => this._x(this._x() + 1)}>X++ (${this._x()})</button>
                <button @click=${() => this._y(this._y() + 1)}>Y++ (${this._y()})</button>
                <button @click=${() => this._z(this._z() + 1)}>Z++ (${this._z()})</button>
              </div>
              <div class="computed-values">
                <span>X + Y = ${this._x() + this._y()}</span>
                <span>X * Y = ${this._x() * this._y()}</span>
                <span>X + Y + Z = ${this._x() + this._y() + this._z()}</span>
                <span>Sum > 10: ${this._x() + this._y() + this._z() > 10 ? 'Yes' : 'No'}</span>
              </div>
              
              <!-- Conditional based on computed -->
              <div "${when(this._x() > 5)}" class="conditional-msg">X is greater than 5!</div>
              <div "${when(this._y() > 5)}" class="conditional-msg">Y is greater than 5!</div>
              <div "${when(this._x() + this._y() > 10)}" class="conditional-msg">X + Y exceeds 10!</div>
            </div>
          </section>

          <!-- Test 4: Rapid text updates -->
          <section class="test-section">
            <h2>Test 4: Rapid Text Updates</h2>
            <div class="rapid-text-display">
              <div class="text-box">${this._rapidText()}</div>
              <button @click=${this._triggerRapidTextUpdates}>Trigger 100 Rapid Updates</button>
            </div>
          </section>

          <!-- Test 5: Large array operations -->
          <section class="test-section">
            <h2>Test 5: Large Array (${this._largeArray().length} items)</h2>
            <div class="array-controls">
              <button @click=${this._addManyItems}>Add 100 Items</button>
              <button @click=${this._removeHalfItems}>Remove Half</button>
              <button @click=${this._shuffleItems}>Shuffle All</button>
              <button @click=${this._updateAllItems}>Update All Values</button>
              <button @click=${this._clearItems}>Clear All</button>
            </div>
            <div class="large-array-display" "${when(this._largeArray().length > 0)}">
              ${repeat(this._largeArray(), (item, index) => html` <span class="array-item" style="background: hsl(${item % 360}, 50%, 70%)">${item}</span> `)}
            </div>
            <div "${when(this._largeArray().length === 0)}" class="empty-msg">Array is empty</div>
          </section>
        </div>
      `;
    };

    private _startStressTest() {
      if (this._isRunning()) return;
      this._isRunning(true);

      const runUpdate = () => {
        const batchSize = this._batchSize();
        for (let i = 0; i < batchSize; i++) {
          const idx = Math.floor(Math.random() * this._signals.length);
          this._signals[idx](this._signals[idx]() + 1);
        }
        this._updateCount(this._updateCount() + batchSize);

        if (this._isRunning()) {
          this._intervalId = window.setTimeout(runUpdate, this._intervalMs());
        }
      };

      runUpdate();
    }

    private _stopStressTest() {
      this._isRunning(false);
      if (this._intervalId) {
        clearTimeout(this._intervalId);
        this._intervalId = null;
      }
    }

    private _resetAll() {
      this._stopStressTest();
      this._signals.forEach((s, i) => s(i));
      this._a(true);
      this._b(false);
      this._c(true);
      this._d(false);
      this._x(0);
      this._y(0);
      this._z(0);
      this._rapidText('Initial');
      this._largeArray([]);
      this._updateCount(0);
    }

    private _triggerBurstUpdate() {
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor(Math.random() * this._signals.length);
        this._signals[idx](this._signals[idx]() + 1);
      }
      this._updateCount(this._updateCount() + 100);
    }

    private _triggerRapidTextUpdates() {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          this._rapidText(`Update #${i + 1} at ${Date.now()}`);
        }, i * 5);
      }
    }

    private _addManyItems() {
      const current = this._largeArray();
      const newItems = Array.from({ length: 100 }, (_, i) => current.length + i);
      this._largeArray([...current, ...newItems]);
    }

    private _removeHalfItems() {
      const current = this._largeArray();
      this._largeArray(current.slice(0, Math.floor(current.length / 2)));
    }

    private _shuffleItems() {
      const arr = [...this._largeArray()];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      this._largeArray(arr);
    }

    private _updateAllItems() {
      this._largeArray(this._largeArray().map((x) => x + 1));
    }

    private _clearItems() {
      this._largeArray([]);
    }

    static styles = css`
      :host {
        display: block;
        font-family: system-ui, sans-serif;
      }
      .stress-test {
        padding: 20px;
      }
      .header {
        margin-bottom: 20px;
      }
      .stats {
        display: flex;
        gap: 20px;
      }
      .controls {
        background: #f5f5f5;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      .control-row {
        margin: 8px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .control-row input {
        flex: 1;
        max-width: 200px;
      }
      .buttons {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .test-section {
        margin-bottom: 24px;
        padding: 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
      }
      .signal-grid {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 4px;
      }
      .signal-cell {
        padding: 8px;
        text-align: center;
        font-size: 11px;
        border-radius: 4px;
      }
      .bool-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bool-control {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .expr-result {
        padding: 8px 16px;
        background: #d4edda;
        border-radius: 4px;
        width: fit-content;
      }
      .expr-then {
        padding: 8px 16px;
        background: #cce5ff;
        border-radius: 4px;
      }
      .expr-else {
        padding: 8px 16px;
        background: #f8d7da;
        border-radius: 4px;
      }
      .numeric-display {
      }
      .num-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .computed-values {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .computed-values span {
        padding: 4px 12px;
        background: #eee;
        border-radius: 4px;
      }
      .conditional-msg {
        padding: 8px 16px;
        background: #fff3cd;
        border-radius: 4px;
        margin: 4px 0;
        width: fit-content;
      }
      .rapid-text-display {
      }
      .text-box {
        padding: 16px;
        background: #333;
        color: #0f0;
        font-family: monospace;
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .array-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .large-array-display {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        max-height: 200px;
        overflow: auto;
      }
      .array-item {
        padding: 4px 8px;
        font-size: 10px;
        border-radius: 2px;
      }
      .empty-msg {
        color: #666;
        font-style: italic;
      }
      button {
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
      }
      button:hover {
        background: #f0f0f0;
      }
    `;
  },
);
