/**
 * EXTREME NESTING TEST COMPONENT
 *
 * This component is designed to stress-test the compiler and runtime with:
 * - 10+ levels of HTML element nesting
 * - Nested repeat blocks (3 levels deep)
 * - Nested conditional blocks with complex expressions
 * - Signal bindings at every level
 * - Event handlers at multiple nesting levels
 * - whenElse inside repeat inside when blocks
 *
 * If the compiler can handle this correctly, it can handle anything.
 */
import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

interface ExtremeNestingProps {
  depth?: string;
}

interface Category {
  name: string;
  items: Item[];
}

interface Item {
  label: string;
  tags: string[];
  active: boolean;
}

export const ExtremeNestingComponent = registerComponent<ExtremeNestingProps>(
  { selector: 'extreme-nesting-test', type: 'component' },
  class extends Component {
    // Primary signals
    private _loading = signal(false);
    private _error = signal(false);
    private _expanded = signal(true);
    private _selectedIndex = signal(0);
    private _theme = signal<'light' | 'dark'>('light');
    private _counter = signal(0);

    // Complex nested data
    private _categories = signal<Category[]>([
      {
        name: 'Category A',
        items: [
          { label: 'Item A1', tags: ['tag1', 'tag2'], active: true },
          { label: 'Item A2', tags: ['tag3'], active: false },
          { label: 'Item A3', tags: ['tag1', 'tag4', 'tag5'], active: true },
        ],
      },
      {
        name: 'Category B',
        items: [
          { label: 'Item B1', tags: ['tag2', 'tag3'], active: true },
          { label: 'Item B2', tags: [], active: false },
        ],
      },
      {
        name: 'Category C',
        items: [
          { label: 'Item C1', tags: ['tag1'], active: true },
          { label: 'Item C2', tags: ['tag2', 'tag4'], active: true },
          { label: 'Item C3', tags: ['tag3', 'tag5'], active: false },
          { label: 'Item C4', tags: ['tag1', 'tag2', 'tag3'], active: true },
        ],
      },
    ]);

    // Computed-like signals that update based on others
    private _totalItems = signal(0);
    private _activeCount = signal(0);
    private _statusText = signal('Ready');
    private _containerClass = signal('container');

    render = () => {
      // Update derived values
      this._updateDerivedValues();

      // Test: Schedule rapid updates to stress-test batching
      setTimeout(() => this._stressTestUpdates(), 100);

      return html`
        <div class="extreme-test ${this._containerClass()}" data-theme="${this._theme()}">
          <!-- Level 1: Main container with conditional loading state -->
          ${whenElse(
            this._loading(),
            html`
              <div class="loading-overlay">
                <div class="spinner">
                  <span class="spinner-text">Loading... (${this._statusText()})</span>
                </div>
              </div>
            `,
            html`
              <!-- Level 2: Error or content -->
              ${whenElse(
                this._error(),
                html`
                  <div class="error-state">
                    <h2>Error Occurred</h2>
                    <p>${this._statusText()}</p>
                    <button @click=${this._handleRetry}>Retry</button>
                  </div>
                `,
                html`
                  <!-- Level 3: Main content area -->
                  <header class="header" style="background-color: ${this._theme() === 'dark' ? '#333' : '#fff'}">
                    <h1>Extreme Nesting Test</h1>
                    <div class="header-stats">
                      <span>Total: ${this._totalItems()}</span>
                      <span>Active: ${this._activeCount()}</span>
                      <span>Counter: ${this._counter()}</span>
                    </div>
                    <div class="header-controls">
                      <button @click=${this._toggleTheme}>Toggle Theme</button>
                      <button @click=${this._toggleExpanded}>Toggle Expanded</button>
                      <button @click.stop=${this._incrementCounter}>+1</button>
                    </div>
                  </header>

                  <!-- Level 4: Expandable section -->
                  <main "${when(this._expanded())}">
                    <section class="categories-section">
                      <!-- Level 5: Triple-nested repeat (categories → items → tags) -->
                      ${repeat(
                        this._categories(),
                        (category, categoryIndex) => html`
                          <article class="category" data-index="${categoryIndex}">
                            <!-- Level 6: Category header -->
                            <div class="category-header">
                              <h2 class="${this._selectedIndex() === categoryIndex ? 'selected' : ''}">${category.name}</h2>
                              <span class="item-count">(${category.items.length} items)</span>
                              <button @click=${(e: Event) => this._selectCategory(categoryIndex, e)}>Select</button>
                            </div>

                            <!-- Level 7: Items list -->
                            <ul class="items-list">
                              ${repeat(
                                category.items,
                                (item, itemIndex) => html`
                                  <li class="item ${item.active ? 'active' : 'inactive'}" data-item="${itemIndex}">
                                    <!-- Level 8: Item content -->
                                    <div class="item-content">
                                      <span class="item-label">${item.label}</span>
                                      
                                      <!-- Level 9: Conditional based on active state -->
                                      ${whenElse(item.active, html`<span class="status active-badge">✓ Active</span>`, html`<span class="status inactive-badge">✗ Inactive</span>`)}

                                      <!-- Level 9: Tags container -->
                                      <div class="tags-container" "${when(item.tags.length > 0)}">
                                        <!-- Level 10: Tags repeat (3rd level nesting!) -->
                                        ${repeat(item.tags, (tag) => html` <span class="tag" style="background-color: ${this._getTagColor(tag)}">${tag}</span> `)}
                                      </div>

                                      <!-- Level 9: Item actions -->
                                      <div class="item-actions">
                                        <button @click=${(e: Event) => this._toggleItemActive(categoryIndex, itemIndex, e)}>
                                          Toggle
                                        </button>
                                        <button @click.prevent=${(e: Event) => this._removeItem(categoryIndex, itemIndex, e)}>
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                `,
                              )}
                            </ul>

                            <!-- Level 7: Add item form (conditional) -->
                            <div "${when(this._selectedIndex() === categoryIndex)}" class="add-item-form">
                              <input type="text" placeholder="New item name" id="new-item-${categoryIndex}">
                              <button @click=${(e: Event) => this._addItem(categoryIndex, e)}>Add Item</button>
                            </div>
                          </article>
                        `,
                      )}
                    </section>

                    <!-- Level 5: Summary section with complex conditionals -->
                    <section class="summary-section">
                      <div "${when(this._totalItems() > 0)}">
                        <h3>Summary</h3>
                        ${whenElse(
                          this._activeCount() > this._totalItems() / 2,
                          html`<p class="summary-good">Most items are active! (${this._activeCount()}/${this._totalItems()})</p>`,
                          html`<p class="summary-warning">Many items inactive. (${this._activeCount()}/${this._totalItems()})</p>`,
                        )}
                      </div>
                      <div "${when(this._totalItems() === 0)}" class="empty-state">
                        <p>No items yet. Add some categories!</p>
                      </div>
                    </section>
                  </main>

                  <!-- Level 4: Footer always visible -->
                  <footer class="footer">
                    <p>Status: ${this._statusText()}</p>
                    <p>Theme: ${this._theme()}</p>
                  </footer>
                `,
              )}
            `,
          )}
        </div>
      `;
    };

    private _updateDerivedValues() {
      const categories = this._categories();
      let total = 0;
      let active = 0;

      for (const cat of categories) {
        total += cat.items.length;
        active += cat.items.filter((i) => i.active).length;
      }

      this._totalItems(total);
      this._activeCount(active);
    }

    private _stressTestUpdates() {
      // Rapid updates to test batching
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          this._counter(this._counter() + 1);
          this._statusText(`Update ${i + 1}`);
        }, i * 50);
      }
    }

    private _toggleTheme() {
      this._theme(this._theme() === 'light' ? 'dark' : 'light');
      this._containerClass(this._theme() === 'dark' ? 'container dark-mode' : 'container');
    }

    private _toggleExpanded() {
      this._expanded(!this._expanded());
    }

    private _incrementCounter() {
      this._counter(this._counter() + 1);
    }

    private _handleRetry() {
      this._error(false);
      this._loading(true);
      this._statusText('Retrying...');
      setTimeout(() => {
        this._loading(false);
        this._statusText('Ready');
      }, 1000);
    }

    private _selectCategory(index: number, _e: Event) {
      this._selectedIndex(index);
    }

    private _toggleItemActive(catIndex: number, itemIndex: number, _e: Event) {
      const categories = [...this._categories()];
      const items = [...categories[catIndex].items];
      items[itemIndex] = { ...items[itemIndex], active: !items[itemIndex].active };
      categories[catIndex] = { ...categories[catIndex], items };
      this._categories(categories);
      this._updateDerivedValues();
    }

    private _removeItem(catIndex: number, itemIndex: number, _e: Event) {
      const categories = [...this._categories()];
      const items = [...categories[catIndex].items];
      items.splice(itemIndex, 1);
      categories[catIndex] = { ...categories[catIndex], items };
      this._categories(categories);
      this._updateDerivedValues();
    }

    private _addItem(catIndex: number, _e: Event) {
      const input = this.shadowRoot?.getElementById(`new-item-${catIndex}`) as HTMLInputElement;
      if (!input || !input.value.trim()) return;

      const categories = [...this._categories()];
      const items = [...categories[catIndex].items];
      items.push({
        label: input.value.trim(),
        tags: ['new'],
        active: true,
      });
      categories[catIndex] = { ...categories[catIndex], items };
      this._categories(categories);
      this._updateDerivedValues();
      input.value = '';
    }

    private _getTagColor(tag: string): string {
      const colors: Record<string, string> = {
        tag1: '#e74c3c',
        tag2: '#3498db',
        tag3: '#2ecc71',
        tag4: '#f39c12',
        tag5: '#9b59b6',
        new: '#1abc9c',
      };
      return colors[tag] || '#95a5a6';
    }

    static styles = css`
      :host {
        display: block;
        font-family: system-ui, sans-serif;
      }
      .container {
        padding: 20px;
      }
      .container.dark-mode {
        background: #1a1a1a;
        color: #fff;
      }
      .loading-overlay {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 200px;
      }
      .spinner {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .error-state {
        padding: 20px;
        background: #fee;
        border: 1px solid #f00;
      }
      .header {
        padding: 16px;
        border-bottom: 1px solid #ddd;
      }
      .header-stats {
        display: flex;
        gap: 16px;
        margin: 8px 0;
      }
      .header-controls {
        display: flex;
        gap: 8px;
      }
      .categories-section {
        padding: 16px;
      }
      .category {
        margin-bottom: 24px;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 16px;
      }
      .category-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .category-header h2 {
        margin: 0;
      }
      .category-header h2.selected {
        color: #3498db;
      }
      .items-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .item {
        padding: 12px;
        margin: 8px 0;
        border-radius: 4px;
        background: #f9f9f9;
      }
      .item.active {
        border-left: 4px solid #2ecc71;
      }
      .item.inactive {
        border-left: 4px solid #e74c3c;
        opacity: 0.7;
      }
      .item-content {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .item-label {
        font-weight: 500;
      }
      .status {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 4px;
      }
      .active-badge {
        background: #d4edda;
        color: #155724;
      }
      .inactive-badge {
        background: #f8d7da;
        color: #721c24;
      }
      .tags-container {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .tag {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        color: #fff;
      }
      .item-actions {
        margin-left: auto;
        display: flex;
        gap: 4px;
      }
      .add-item-form {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed #ddd;
        display: flex;
        gap: 8px;
      }
      .add-item-form input {
        flex: 1;
        padding: 8px;
      }
      .summary-section {
        padding: 16px;
        background: #f5f5f5;
        margin-top: 16px;
      }
      .summary-good {
        color: #155724;
      }
      .summary-warning {
        color: #856404;
      }
      .empty-state {
        text-align: center;
        color: #666;
      }
      .footer {
        padding: 12px 16px;
        background: #eee;
        display: flex;
        justify-content: space-between;
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
