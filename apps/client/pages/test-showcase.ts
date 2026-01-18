/**
 * TEST SHOWCASE PAGE
 *
 * This page mounts all test components for visual verification.
 * Use this to manually verify the framework works correctly.
 */
import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

// Import test components
import { ExtremeNestingComponent } from '../components/extreme-nesting-test.js';
import { SignalStressComponent } from '../components/signal-stress-test.js';
import { CompositionTestComponent } from '../components/composition-test.js';

export const TestShowcasePage = registerComponent(
  { selector: 'test-showcase-page', type: 'page' },
  class extends Component {
    private _activeTab = signal<'extreme' | 'signal' | 'composition'>('extreme');
    private _showAll = signal(false);

    render = () => {
      return html`
        <div class="test-showcase">
          <header class="header">
            <h1>🧪 WCF Framework Test Showcase</h1>
            <p>Testing extreme scenarios to ensure compiler stability</p>
          </header>

          <nav class="tabs">
            <button 
              class="${this._activeTab() === 'extreme' ? 'active' : ''}"
              @click=${() => this._activeTab('extreme')}
            >
              Extreme Nesting Test
            </button>
            <button 
              class="${this._activeTab() === 'signal' ? 'active' : ''}"
              @click=${() => this._activeTab('signal')}
            >
              Signal Stress Test
            </button>
            <button 
              class="${this._activeTab() === 'composition' ? 'active' : ''}"
              @click=${() => this._activeTab('composition')}
            >
              Composition Test
            </button>
            <label class="show-all">
              <input type="checkbox" @change=${() => this._showAll(!this._showAll())}>
              Show All
            </label>
          </nav>

          <main class="content">
            <!-- Individual test views -->
            <section "${when(this._activeTab() === 'extreme' || this._showAll())}" class="test-section">
              <div class="test-header">
                <h2>🔗 Extreme Nesting Test</h2>
                <p>Tests 10+ levels of nesting, 3-level nested repeats, nested conditionals</p>
              </div>
              ${ExtremeNestingComponent({})}
            </section>

            <section "${when(this._activeTab() === 'signal' || this._showAll())}" class="test-section">
              <div class="test-header">
                <h2>⚡ Signal Stress Test</h2>
                <p>Tests rapid signal updates, batching, complex boolean expressions</p>
              </div>
              ${SignalStressComponent({})}
            </section>

            <section "${when(this._activeTab() === 'composition' || this._showAll())}" class="test-section">
              <div class="test-header">
                <h2>🧱 Component Composition Test</h2>
                <p>Tests nested components, CTFE, dynamic props from signals</p>
              </div>
              ${CompositionTestComponent({})}
            </section>
          </main>

          <footer class="footer">
            <p>If all tests render correctly without errors, the compiler is working as expected.</p>
            <p>Check browser console for any runtime errors.</p>
          </footer>
        </div>
      `;
    };

    static styles = css`
      :host {
        display: block;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        min-height: 100vh;
        background: #f5f5f5;
      }

      .test-showcase {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
      }

      .header {
        text-align: center;
        padding: 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px;
        margin-bottom: 20px;
      }

      .header h1 {
        margin: 0 0 8px 0;
        font-size: 28px;
      }

      .header p {
        margin: 0;
        opacity: 0.9;
      }

      .tabs {
        display: flex;
        gap: 8px;
        padding: 12px;
        background: white;
        border-radius: 8px;
        margin-bottom: 20px;
        flex-wrap: wrap;
        align-items: center;
      }

      .tabs button {
        padding: 10px 20px;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
      }

      .tabs button:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }

      .tabs button.active {
        border-color: #667eea;
        background: #667eea;
        color: white;
      }

      .show-all {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        cursor: pointer;
      }

      .content {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .test-section {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .test-header {
        padding: 16px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #e0e0e0;
      }

      .test-header h2 {
        margin: 0 0 4px 0;
        font-size: 18px;
      }

      .test-header p {
        margin: 0;
        color: #666;
        font-size: 14px;
      }

      .footer {
        text-align: center;
        padding: 24px;
        color: #666;
        font-size: 14px;
      }

      .footer p {
        margin: 4px 0;
      }
    `;
  },
);
