import { Signal } from '../signal/index.js';

// ============================================================================
// Event Delegation System
// ============================================================================

/**
 * Event handler with optional modifiers.
 * Modifiers are encoded in the handler ID: "e0" or "e0:stop:prevent"
 */
type EventHandlerMap = Map<string, (event: Event) => void>;

/** Keyboard key codes for modifier support */
const KEY_CODES: Record<string, string[]> = {
  enter: ['Enter'],
  tab: ['Tab'],
  delete: ['Backspace', 'Delete'],
  esc: ['Escape'],
  escape: ['Escape'],
  space: [' '],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
};

/**
 * Set up event delegation for a component's shadow root.
 * Attaches a single listener per event type at the shadow root boundary,
 * then delegates to the appropriate handler based on data-evt-{id} attributes.
 *
 * Supports modifiers encoded in handler IDs:
 * - .stop - calls event.stopPropagation()
 * - .prevent - calls event.preventDefault()
 * - .self - only trigger if event.target is the element itself
 * - .once - remove handler after first invocation (handled at compile time)
 * - .{keyCode} - for keyboard events, only trigger on specific keys
 *
 * @param root - The shadow root to attach delegation listeners to
 * @param eventMap - Map of event types to handler maps (event type -> { handlerId -> handler })
 * @returns Cleanup function to remove all delegation listeners
 */
export const __setupEventDelegation = (root: ShadowRoot, eventMap: Record<string, Record<string, (event: Event) => void>>): (() => void) => {
  const cleanups: (() => void)[] = [];

  for (const [eventType, handlers] of Object.entries(eventMap)) {
    const handlerMap: EventHandlerMap = new Map(Object.entries(handlers));
    const attrName = `data-evt-${eventType}`;

    const delegatedHandler = (event: Event) => {
      // Walk up from target to find the element with our data attribute
      let target = event.target as Element | null;

      while (target && target !== (root as unknown as Element)) {
        if (target instanceof HTMLElement) {
          const handlerIdWithModifiers = target.getAttribute(attrName);
          if (handlerIdWithModifiers) {
            // Parse handler ID and modifiers: "e0" or "e0:stop:prevent"
            const parts = handlerIdWithModifiers.split(':');
            const handlerId = parts[0];
            const modifiers = new Set(parts.slice(1));

            const handler = handlerMap.get(handlerId);
            if (handler) {
              // Check .self modifier - only trigger if target matches
              if (modifiers.has('self') && event.target !== target) {
                target = target.parentElement;
                continue;
              }

              // Check keyboard modifiers for keyboard events
              if (event instanceof KeyboardEvent) {
                let keyMatched = true;
                for (const mod of modifiers) {
                  if (KEY_CODES[mod]) {
                    keyMatched = KEY_CODES[mod].includes(event.key);
                    if (!keyMatched) break;
                  }
                }
                if (!keyMatched) {
                  target = target.parentElement;
                  continue;
                }
              }

              // Apply modifiers
              if (modifiers.has('prevent')) event.preventDefault();
              if (modifiers.has('stop')) event.stopPropagation();

              // Call the handler
              handler.call(null, event);

              // Stop walking up - we found and executed a handler
              return;
            }
          }
        }
        target = target.parentElement;
      }
    };

    // Use capture phase to ensure we catch all events, even those that don't bubble
    root.addEventListener(eventType, delegatedHandler, true);

    cleanups.push(() => {
      root.removeEventListener(eventType, delegatedHandler, true);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
};

// Reusable template element for parsing HTML
const tempEl = document.createElement('template');

/**
 * Generate a unique key for an item based on its content.
 *
 * Key Generation Strategy (in priority order):
 * 1. Objects with `id`, `key`, or `_id` properties → use that value
 * 2. Primitives (string, number, boolean) → use the value itself
 * 3. Objects without identifiers → uses index as fallback (not stable for reordering)
 *
 * Note: Duplicate keys are handled by the caller by appending index suffixes.
 * For best performance with object arrays, ensure objects have an `id` or `key` property.
 */
const generateItemKey = (item: any, index: number): string => {
  if (item === null || item === undefined) {
    return `__null_${index}`;
  }

  // Primitives use their value as the key
  // Note: Duplicates like ['a', 'a'] are handled by the dedup logic in render()
  if (typeof item !== 'object') {
    return `__p_${String(item)}`;
  }

  // Objects: try common id patterns first (STABLE - recommended)
  if ('id' in item && item.id != null) return `__id_${item.id}`;
  if ('key' in item && item.key != null) return `__key_${item.key}`;
  if ('_id' in item && item._id != null) return `__id_${item._id}`;

  // Fallback: use index (NOT stable for reordering, but won't break on object mutation)
  return `__idx_${index}`;
};

/**
 * Compute the Longest Increasing Subsequence (LIS) of indices.
 * Returns the indices of elements that form the LIS.
 * Used to minimize DOM moves during list reconciliation.
 */
const computeLIS = (arr: number[]): number[] => {
  const n = arr.length;
  if (n === 0) return [];

  // dp[i] stores the smallest tail element for LIS of length i+1
  const dp: number[] = [];
  // parent[i] stores the index of previous element in LIS ending at i
  const parent: number[] = new Array(n).fill(-1);
  // indices[i] stores the index in arr of the tail element for LIS of length i+1
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const val = arr[i];

    // Binary search for the position to insert/replace
    let lo = 0;
    let hi = dp.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dp[mid] < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Update dp and indices
    if (lo === dp.length) {
      dp.push(val);
      indices.push(i);
    } else {
      dp[lo] = val;
      indices[lo] = i;
    }

    // Set parent
    parent[i] = lo > 0 ? indices[lo - 1] : -1;
  }

  // Reconstruct the LIS indices
  const lis: number[] = [];
  let k = indices[indices.length - 1];
  while (k >= 0) {
    lis.push(k);
    k = parent[k];
  }
  lis.reverse();
  return lis;
};

/**
 * Core conditional binding logic shared by __bindIf and __bindIfExpr
 */
const bindConditional = (
  root: ShadowRoot,
  id: string,
  template: string,
  initNested: () => (() => void)[],
  subscribe: (update: () => void) => (() => void)[],
  evalCondition: () => boolean,
): (() => void) => {
  let cleanups: (() => void)[] = [];
  let bindingsInitialized = false;

  // Check initial state - determine if we start with content shown or hidden
  const initialElement = root.getElementById(id);
  const initiallyShowing = initialElement?.tagName !== 'TEMPLATE';

  // Get or create the content element
  let contentEl: HTMLElement;
  if (initiallyShowing) {
    contentEl = initialElement as HTMLElement;
  } else {
    tempEl.innerHTML = template;
    contentEl = (tempEl.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement;
  }

  let currentlyShowing = initiallyShowing;

  // If initially showing, initialize bindings immediately
  if (initiallyShowing) {
    bindingsInitialized = true;
    cleanups = initNested();
  }

  const show = () => {
    if (currentlyShowing) return;
    currentlyShowing = true;
    const current = root.getElementById(id);
    if (current && contentEl) {
      current.replaceWith(contentEl);
      if (!bindingsInitialized) {
        bindingsInitialized = true;
        cleanups = initNested();
      }
    }
  };

  const hide = () => {
    if (!currentlyShowing) return;
    currentlyShowing = false;
    const current = root.getElementById(id);
    if (current) {
      const p = document.createElement('template');
      p.id = id;
      current.replaceWith(p);
    }
  };

  const update = () => {
    if (evalCondition()) {
      show();
    } else {
      hide();
    }
  };

  // Subscribe with skipInitial, then sync to current state
  const unsubscribes = subscribe(update);
  update();

  return () => {
    for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};

/**
 * Bind conditional rendering to a single signal.
 */
export const __bindIf = (root: ShadowRoot, signal: Signal<any>, id: string, template: string, initNested: () => (() => void)[]): (() => void) =>
  bindConditional(
    root,
    id,
    template,
    initNested,
    (update) => [signal.subscribe(update, true)],
    () => Boolean(signal()),
  );

/**
 * Bind conditional rendering to a complex expression with multiple signals.
 */
export const __bindIfExpr = (root: ShadowRoot, signals: Signal<any>[], evalExpr: () => boolean, id: string, template: string, initNested: () => (() => void)[]): (() => void) =>
  bindConditional(root, id, template, initNested, (update) => signals.map((s) => s.subscribe(update, true)), evalExpr);

/**
 * Internal state for a rendered list item (supports multiple nodes including text)
 */
interface RenderedItem<T> {
  key: string;
  nodes: ChildNode[]; // Support multiple nodes including text nodes
  cleanups: (() => void)[];
  item: T; // Store the item for potential updates
  index: number; // Track current index
}

/** Options for __bindRepeat */
export interface RepeatOptions<T> {
  /** Custom key extraction function */
  trackBy?: (item: T, index: number) => string | number;
}

/**
 * Bind a repeating list to a signal.
 * Uses automatic keying (or custom trackBy) for efficient diffing with LIS optimization.
 *
 * @param root - The shadow root to render into
 * @param signal - The signal containing the array of items
 * @param anchorId - The ID of the anchor element (template placeholder)
 * @param templateFn - Function that generates HTML for each item
 * @param initItemBindings - Function that initializes bindings for each item element
 * @param emptyTemplate - Optional template to show when the list is empty
 * @param options - Optional configuration (trackBy function)
 */
export const __bindRepeat = <T>(
  root: ShadowRoot,
  signal: Signal<T[]>,
  anchorId: string,
  templateFn: (item: T, index: number) => string,
  initItemBindings: (elements: Element[], item: T, index: number) => (() => void)[],
  emptyTemplate?: string,
  options?: RepeatOptions<T>,
): (() => void) => {
  // Map of key -> rendered item state
  const renderedItems = new Map<string, RenderedItem<T>>();
  // Ordered list of keys for position tracking
  let currentOrder: string[] = [];

  // Custom trackBy or default key generation
  const getKey = options?.trackBy ? (item: T, index: number) => `__tb_${options.trackBy!(item, index)}` : generateItemKey;

  // Get the anchor element - this is where we'll insert items before
  const anchor = root.getElementById(anchorId);
  if (!anchor) {
    console.warn(`[__bindRepeat] Anchor element with id "${anchorId}" not found`);
    return () => {};
  }

  // Get the parent container for insertions
  // Use parentNode instead of parentElement since the parent might be a ShadowRoot (DocumentFragment)
  const container = anchor.parentNode as ParentNode;
  if (!container) {
    console.warn(`[__bindRepeat] Anchor element has no parent`);
    return () => {};
  }

  // Empty state element (if emptyTemplate provided)
  let emptyElement: Element | null = null;
  let emptyShowing = false;

  const showEmpty = () => {
    if (emptyShowing || !emptyTemplate) return;
    emptyShowing = true;
    tempEl.innerHTML = emptyTemplate;
    const fragment = tempEl.content.cloneNode(true) as DocumentFragment;
    emptyElement = fragment.firstElementChild;
    if (emptyElement) {
      container.insertBefore(emptyElement, anchor);
    }
  };

  const hideEmpty = () => {
    if (!emptyShowing || !emptyElement) return;
    emptyShowing = false;
    emptyElement.remove();
    emptyElement = null;
  };

  /**
   * Create a new item and insert it into the DOM
   */
  const createItem = (item: T, index: number, key: string, refNode: Node): ChildNode | null => {
    const html = templateFn(item, index);
    console.log(`[repeat] Item ${index} HTML:`, html);
    tempEl.innerHTML = html;
    const fragment = tempEl.content.cloneNode(true) as DocumentFragment;
    // Use childNodes to include text nodes, not just elements
    const nodes: ChildNode[] = Array.from(fragment.childNodes);
    console.log(
      `[repeat] Item ${index} nodes:`,
      nodes.length,
      nodes.map((n) => (n.nodeType === 1 ? (n as Element).outerHTML : `TEXT:"${n.textContent}"`)),
    );

    if (nodes.length === 0) return null;

    // Insert all nodes before reference node (in forward order)
    // Each insertBefore adds the node immediately before refNode,
    // so inserting in forward order maintains correct sequence
    for (let j = 0; j < nodes.length; j++) {
      container.insertBefore(nodes[j], refNode);
    }

    // Initialize bindings for this item (pass only element nodes)
    const elements = nodes.filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
    const cleanups = initItemBindings(elements, item, index);

    renderedItems.set(key, {
      key,
      nodes,
      cleanups,
      item,
      index,
    });

    return nodes[0];
  };

  /**
   * Remove an item from the DOM and cleanup
   */
  const removeItem = (key: string) => {
    const rendered = renderedItems.get(key);
    if (!rendered) return;

    for (const cleanup of rendered.cleanups) {
      cleanup();
    }
    for (const node of rendered.nodes) {
      node.remove();
    }
    renderedItems.delete(key);
  };

  const render = (items: T[]) => {
    // Handle empty arrays - remove all items and show empty state
    if (!items || items.length === 0) {
      for (const key of currentOrder) {
        removeItem(key);
      }
      currentOrder = [];
      showEmpty();
      return;
    }

    // Hide empty state if showing
    hideEmpty();

    // Generate keys for all new items
    const newKeys: string[] = [];
    const newKeySet = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      let key = getKey(items[i], i);
      // Handle duplicate keys by appending index
      while (newKeySet.has(key)) {
        key = `${key}_dup${i}`;
      }
      newKeys.push(key);
      newKeySet.add(key);
    }

    // Build map from old key to old index for LIS calculation
    const oldKeyToIndex = new Map<string, number>();
    for (let i = 0; i < currentOrder.length; i++) {
      oldKeyToIndex.set(currentOrder[i], i);
    }

    // Remove items that are no longer present
    for (const key of currentOrder) {
      if (!newKeySet.has(key)) {
        removeItem(key);
      }
    }

    // Calculate which existing items are in the longest increasing subsequence
    // These items don't need to be moved - we only move items NOT in the LIS
    const existingIndices: number[] = [];
    const existingKeys: string[] = [];
    for (let i = 0; i < newKeys.length; i++) {
      const key = newKeys[i];
      if (oldKeyToIndex.has(key)) {
        existingIndices.push(oldKeyToIndex.get(key)!);
        existingKeys.push(key);
      }
    }

    // Get the indices in existingIndices that form the LIS
    const lisIndices = new Set(computeLIS(existingIndices));
    // Map the LIS indices back to keys that shouldn't move
    const stableKeys = new Set<string>();
    for (let i = 0; i < existingKeys.length; i++) {
      if (lisIndices.has(i)) {
        stableKeys.add(existingKeys[i]);
      }
    }

    // Process in reverse order for insertBefore
    let refNode: Node = anchor;

    for (let i = items.length - 1; i >= 0; i--) {
      const key = newKeys[i];
      const item = items[i];
      const existing = renderedItems.get(key);

      if (existing) {
        // Update stored index and item
        existing.index = i;
        existing.item = item;

        const firstNode = existing.nodes[0];

        // Only move if NOT in the stable set (LIS)
        if (!stableKeys.has(key)) {
          // Move all nodes (fragments) to correct position
          for (const node of existing.nodes) {
            container.insertBefore(node, refNode);
          }
        }

        refNode = firstNode || refNode;
      } else {
        // Create new item
        const firstEl = createItem(item, i, key, refNode);
        if (firstEl) {
          refNode = firstEl;
        }
      }
    }

    // Update current order
    currentOrder = newKeys;
  };

  // Initial render
  render(signal());

  // Subscribe to changes
  const unsubscribe = signal.subscribe((items) => {
    render(items);
  }, true); // Skip initial since we already rendered

  // Cleanup function
  return () => {
    unsubscribe();
    hideEmpty();
    for (const key of currentOrder) {
      removeItem(key);
    }
    currentOrder = [];
  };
};
