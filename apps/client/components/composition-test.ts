/**
 * COMPONENT COMPOSITION TEST
 *
 * Tests nested component scenarios:
 * - Components inside repeat blocks
 * - Components with dynamic props from signals
 * - Components inside conditional blocks
 * - Multiple instances of same component with different props
 * - Deeply nested component trees
 */
import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

// ============================================================================
// Leaf Components (simplest, used inside other components)
// ============================================================================

interface BadgeProps {
  text: string;
  variant?: string;
}

export const BadgeComponent = registerComponent<BadgeProps>(
  { selector: 'ui-badge', type: 'component' },
  class extends Component {
    render = () => {
      const variant = this.getAttribute('variant') || 'default';
      const text = this.getAttribute('text') || '';
      return html`<span class="badge ${variant}">${text}</span>`;
    };

    static styles = css`
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
      }
      .default {
        background: #eee;
        color: #333;
      }
      .success {
        background: #d4edda;
        color: #155724;
      }
      .warning {
        background: #fff3cd;
        color: #856404;
      }
      .danger {
        background: #f8d7da;
        color: #721c24;
      }
      .info {
        background: #cce5ff;
        color: #004085;
      }
    `;
  },
);

interface CounterDisplayProps {
  value: string;
  label?: string;
}

export const CounterDisplayComponent = registerComponent<CounterDisplayProps>(
  { selector: 'ui-counter-display', type: 'component' },
  class extends Component {
    render = () => {
      const value = this.getAttribute('value') || '0';
      const label = this.getAttribute('label') || 'Count';
      return html`
        <div class="counter-display">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </div>
      `;
    };

    static styles = css`
      .counter-display {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 8px;
      }
      .label {
        font-size: 11px;
        opacity: 0.8;
        text-transform: uppercase;
      }
      .value {
        font-size: 24px;
        font-weight: bold;
      }
    `;
  },
);

// ============================================================================
// Card Component (mid-level, contains slots and badges)
// ============================================================================

interface CardProps {
  title: string;
  description?: string;
  status?: string;
}

export const CardComponent = registerComponent<CardProps>(
  { selector: 'ui-card', type: 'component' },
  class extends Component {
    render = () => {
      const title = this.getAttribute('title') || 'Untitled';
      const description = this.getAttribute('description') || '';
      const status = this.getAttribute('status') || 'default';

      return html`
        <article class="card">
          <header class="card-header">
            <h3 class="card-title">${title}</h3>
            ${BadgeComponent({ text: status, variant: status })}
          </header>
          <div class="card-body">
            <p class="description">${description}</p>
            <slot></slot>
          </div>
          <footer class="card-footer">
            <slot name="actions"></slot>
          </footer>
        </article>
      `;
    };

    static styles = css`
      .card {
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
        background: white;
      }
      .card-header {
        padding: 12px 16px;
        background: #f8f9fa;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-title {
        margin: 0;
        font-size: 16px;
      }
      .card-body {
        padding: 16px;
      }
      .description {
        margin: 0 0 12px 0;
        color: #666;
      }
      .card-footer {
        padding: 12px 16px;
        background: #f8f9fa;
        border-top: 1px solid #ddd;
      }
    `;
  },
);

// ============================================================================
// Main Composition Test Component
// ============================================================================

interface CompositionTestProps {}

interface DataItem {
  id: number;
  title: string;
  description: string;
  status: 'success' | 'warning' | 'danger' | 'info' | 'default';
  tags: string[];
  count: number;
}

export const CompositionTestComponent = registerComponent<CompositionTestProps>(
  { selector: 'composition-test', type: 'component' },
  class extends Component {
    private _items = signal<DataItem[]>([
      { id: 1, title: 'Task Alpha', description: 'First task in the list', status: 'success', tags: ['urgent', 'dev'], count: 42 },
      { id: 2, title: 'Task Beta', description: 'Second task with warnings', status: 'warning', tags: ['review'], count: 17 },
      { id: 3, title: 'Task Gamma', description: 'Critical priority task', status: 'danger', tags: ['urgent', 'blocking'], count: 99 },
      { id: 4, title: 'Task Delta', description: 'Informational task', status: 'info', tags: ['docs'], count: 5 },
      { id: 5, title: 'Task Epsilon', description: 'Regular task', status: 'default', tags: [], count: 0 },
    ]);

    private _showCards = signal(true);
    private _showBadges = signal(true);
    private _filterStatus = signal<string>('all');
    private _totalCount = signal(0);
    private _selectedId = signal<number | null>(null);

    render = () => {
      // Calculate total
      this._totalCount(this._items().reduce((sum, item) => sum + item.count, 0));

      // Filter items
      const filteredItems = this._filterStatus() === 'all' ? this._items() : this._items().filter((i) => i.status === this._filterStatus());

      return html`
        <div class="composition-test">
          <header class="header">
            <h1>Component Composition Test</h1>
            <div class="header-counters">
              <!-- Components with dynamic signal values as props -->
              ${CounterDisplayComponent({ value: String(this._items().length), label: 'Items' })}
              ${CounterDisplayComponent({ value: String(this._totalCount()), label: 'Total' })}
              ${CounterDisplayComponent({ value: String(filteredItems.length), label: 'Filtered' })}
            </div>
          </header>

          <section class="controls">
            <div class="toggles">
              <label>
                <input type="checkbox" checked @change=${() => this._showCards(!this._showCards())}>
                Show Cards
              </label>
              <label>
                <input type="checkbox" checked @change=${() => this._showBadges(!this._showBadges())}>
                Show Badges
              </label>
            </div>
            
            <div class="filter">
              <label>Filter by status:</label>
              <select @change=${(e: Event) => this._filterStatus((e.target as HTMLSelectElement).value)}>
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="danger">Danger</option>
                <option value="info">Info</option>
                <option value="default">Default</option>
              </select>
            </div>

            <div class="actions">
              <button @click=${this._addItem}>Add Item</button>
              <button @click=${this._shuffleItems}>Shuffle</button>
              <button @click=${this._incrementAllCounts}>Increment All</button>
            </div>
          </section>

          <!-- Test: Components inside conditional blocks -->
          <section "${when(this._showCards())}" class="cards-section">
            <h2>Cards with Nested Components</h2>
            
            <!-- Test: Components inside repeat with dynamic props -->
            <div class="cards-grid">
              ${repeat(
                filteredItems,
                (item) => html`
                  <div class="card-wrapper ${this._selectedId() === item.id ? 'selected' : ''}" 
                       @click=${() => this._selectedId(item.id)}>
                    <!-- Card component with item data as props -->
                    ${CardComponent({
                      title: item.title,
                      description: item.description,
                      status: item.status,
                    })}
                    
                    <!-- Nested badges inside repeat -->
                    <div "${when(this._showBadges())}" class="badges-row">
                      ${repeat(item.tags, (tag) => html` ${BadgeComponent({ text: tag, variant: 'info' })} `)}
                      <!-- Badge showing count -->
                      ${BadgeComponent({ text: String(item.count), variant: item.count > 50 ? 'success' : 'default' })}
                    </div>

                    <!-- Counter display for each item -->
                    ${CounterDisplayComponent({ value: String(item.count), label: 'Count' })}

                    <!-- Actions -->
                    <div class="item-actions">
                      <button @click.stop=${() => this._incrementCount(item.id)}>+1</button>
                      <button @click.stop=${() => this._addTag(item.id)}>Add Tag</button>
                      <button @click.stop=${() => this._removeItem(item.id)}>Remove</button>
                    </div>
                  </div>
                `,
              )}
            </div>
          </section>

          <!-- Test: Conditional showing selected item details with nested components -->
          <section "${when(this._selectedId() !== null)}" class="detail-section">
            <h2>Selected Item Details</h2>
            ${(() => {
              const selected = this._items().find((i) => i.id === this._selectedId());
              if (!selected) return '';
              return html`
                <div class="selected-detail">
                  ${CardComponent({
                    title: 'Selected: ' + selected.title,
                    description: 'Full details for the selected item',
                    status: selected.status,
                  })}
                  <div class="detail-badges"> <strong>Status:</strong> ${BadgeComponent({ text: selected.status, variant: selected.status })} </div>
                  <div class="detail-tags">
                    <strong>Tags:</strong>
                    ${repeat(selected.tags, (tag) => html`${BadgeComponent({ text: tag, variant: 'info' })}`)}
                  </div>
                  <div class="detail-counter"> ${CounterDisplayComponent({ value: String(selected.count), label: 'Item Count' })} </div>
                </div>
              `;
            })()}
          </section>

          <!-- Test: Empty state with components -->
          <section "${when(filteredItems.length === 0)}" class="empty-section">
            ${CardComponent({
              title: 'No Items Found',
              description: 'Try changing the filter or adding new items.',
              status: 'warning',
            })}
          </section>

          <!-- Test: Many instances of same component -->
          <section class="badges-stress">
            <h2>Badge Stress Test (50 instances)</h2>
            <div class="badges-grid">
              ${repeat(
                Array.from({ length: 50 }, (_, i) => ({ idx: i, text: `Badge ${i + 1}` })),
                (item) => html`
                  ${BadgeComponent({
                    text: item.text,
                    variant: ['success', 'warning', 'danger', 'info', 'default'][item.idx % 5],
                  })}
                `,
              )}
            </div>
          </section>
        </div>
      `;
    };

    private _addItem() {
      const items = [...this._items()];
      const id = Math.max(0, ...items.map((i) => i.id)) + 1;
      const statuses: DataItem['status'][] = ['success', 'warning', 'danger', 'info', 'default'];
      items.push({
        id,
        title: `Task ${id}`,
        description: `Dynamically added task #${id}`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        tags: ['new'],
        count: Math.floor(Math.random() * 100),
      });
      this._items(items);
    }

    private _removeItem(id: number) {
      this._items(this._items().filter((i) => i.id !== id));
      if (this._selectedId() === id) {
        this._selectedId(null);
      }
    }

    private _incrementCount(id: number) {
      const items = this._items().map((i) => (i.id === id ? { ...i, count: i.count + 1 } : i));
      this._items(items);
    }

    private _addTag(id: number) {
      const items = this._items().map((i) => {
        if (i.id === id) {
          const newTag = `tag${i.tags.length + 1}`;
          return { ...i, tags: [...i.tags, newTag] };
        }
        return i;
      });
      this._items(items);
    }

    private _shuffleItems() {
      const items = [...this._items()];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      this._items(items);
    }

    private _incrementAllCounts() {
      this._items(this._items().map((i) => ({ ...i, count: i.count + 1 })));
    }

    static styles = css`
      :host {
        display: block;
        font-family: system-ui, sans-serif;
      }
      .composition-test {
        padding: 20px;
      }
      .header {
        margin-bottom: 20px;
      }
      .header h1 {
        margin: 0 0 12px 0;
      }
      .header-counters {
        display: flex;
        gap: 12px;
      }
      .controls {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
        padding: 16px;
        background: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 20px;
        align-items: center;
      }
      .toggles {
        display: flex;
        gap: 16px;
      }
      .toggles label {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .filter {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .filter select {
        padding: 6px 12px;
      }
      .actions {
        display: flex;
        gap: 8px;
      }

      .cards-section {
        margin-bottom: 24px;
      }
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
      }
      .card-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border: 2px solid transparent;
        border-radius: 10px;
        cursor: pointer;
        transition: border-color 0.2s;
      }
      .card-wrapper:hover {
        border-color: #ddd;
      }
      .card-wrapper.selected {
        border-color: #667eea;
        background: #f0f4ff;
      }
      .badges-row {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .item-actions {
        display: flex;
        gap: 4px;
      }

      .detail-section {
        margin-bottom: 24px;
        padding: 20px;
        background: #f0f4ff;
        border-radius: 8px;
      }
      .selected-detail {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .detail-badges,
      .detail-tags {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .empty-section {
        margin-bottom: 24px;
      }

      .badges-stress {
        margin-bottom: 24px;
      }
      .badges-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
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

      h2 {
        margin: 0 0 16px 0;
      }
    `;
  },
);
