import { Signal, signal as createSignal } from '../signal/index.js';

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
 * Shared element finder for nested bindings.
 * Searches within an array of elements for an element by ID or data-bind-id attribute.
 * This function is exported so components can reuse it instead of generating inline.
 *
 * @param elements - Array of elements to search within
 * @param id - The ID or data-bind-id to find
 * @returns The found element or null
 */
export const __findEl = (elements: Element[], id: string): Element | null => {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.id === id || el.getAttribute?.('data-bind-id') === id) return el;
    const found = el.querySelector?.(`#${id}, [data-bind-id="${id}"]`);
    if (found) return found;
  }
  return null;
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

// ============================================================================
// Fine-Grained Repeat Binding (Signal-per-Item)
// ============================================================================

/**
 * Managed item state for fine-grained repeat
 */
interface ManagedItem<T> {
  id: number;
  itemSignal: Signal<T>;
  nodes: ChildNode[];
  cleanups: (() => void)[];
}

/**
 * Fine-grained repeat binding that wraps each item in its own signal.
 *
 * ## How it works:
 * - Each array item gets wrapped in an individual signal
 * - Template bindings subscribe to the item signal, not the array signal
 * - When item data changes, only that item's signal fires → O(1) DOM update
 * - No diffing algorithm needed for content changes
 *
 * ## Performance characteristics:
 * - Create 1000 rows: Slightly slower (creates 1000 signals)
 * - Partial update: O(1) per item (just signal updates)
 * - Swap rows: O(1) DOM moves + signal reassignment
 * - Remove row: O(1)
 * - Append row: O(1)
 *
 * @param root - Shadow root to render into
 * @param arraySignal - Signal containing the array
 * @param anchorId - ID of the template anchor element
 * @param templateFn - Function that generates HTML for each item (receives item signal)
 * @param initItemBindings - Function that sets up bindings for each item (receives item signal)
 * @param emptyTemplate - Optional template to show when array is empty
 * @param itemEventHandlers - Optional event handlers map for events inside repeat items
 */
export const __bindRepeat = <T>(
  root: ShadowRoot,
  arraySignal: Signal<T[]>,
  anchorId: string,
  templateFn: (itemSignal: Signal<T>, index: number) => string,
  initItemBindings: (elements: Element[], itemSignal: Signal<T>, index: number) => (() => void)[],
  emptyTemplate?: string,
  itemEventHandlers?: Record<string, Record<string, (itemSignal: Signal<T>, index: number, e: Event) => void>>,
): (() => void) => {
  // Managed items by stable ID
  const managedItems: ManagedItem<T>[] = [];
  let nextId = 0;

  // Get anchor and container
  const anchor = root.getElementById(anchorId);
  if (!anchor) return () => {};

  const container = anchor.parentNode as ParentNode;
  if (!container) return () => {};

  // Empty state
  let emptyElement: Element | null = null;
  let emptyShowing = false;

  const showEmpty = () => {
    if (emptyShowing || !emptyTemplate) return;
    emptyShowing = true;
    tempEl.innerHTML = emptyTemplate;
    emptyElement = (tempEl.content.cloneNode(true) as DocumentFragment).firstElementChild;
    if (emptyElement) container.insertBefore(emptyElement, anchor);
  };

  const hideEmpty = () => {
    if (!emptyShowing || !emptyElement) return;
    emptyShowing = false;
    emptyElement.remove();
    emptyElement = null;
  };

  /**
   * Create a new managed item with its own signal
   */
  const createItem = (item: T, index: number, refNode: Node): ManagedItem<T> => {
    const id = nextId++;
    const itemSignal = createSignal(item);

    // Generate HTML with initial value
    const html = templateFn(itemSignal, index);
    tempEl.innerHTML = html;
    const fragment = tempEl.content.cloneNode(true) as DocumentFragment;
    const nodes: ChildNode[] = Array.from(fragment.childNodes);

    // Insert into DOM
    for (const node of nodes) {
      container.insertBefore(node, refNode);
    }

    // Initialize bindings (these subscribe to itemSignal)
    const elements = nodes.filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
    const cleanups = initItemBindings(elements, itemSignal, index);

    // Set up event handlers for this item (if any)
    if (itemEventHandlers) {
      for (const eventType in itemEventHandlers) {
        const handlers = itemEventHandlers[eventType];
        for (const el of elements) {
          // Find all elements with data-evt-{eventType} attribute
          const nested = el.querySelectorAll(`[data-evt-${eventType}]`);
          const targets: Element[] = [];
          if (el.hasAttribute(`data-evt-${eventType}`)) targets.push(el);
          for (let i = 0; i < nested.length; i++) targets.push(nested[i]);

          for (const target of targets) {
            const handlerId = target.getAttribute(`data-evt-${eventType}`)?.split(':')[0];
            if (handlerId && handlers[handlerId]) {
              const handler = handlers[handlerId];
              const listener = (e: Event) => handler(itemSignal, index, e);
              target.addEventListener(eventType, listener);
              cleanups.push(() => target.removeEventListener(eventType, listener));
            }
          }
        }
      }
    }

    return { id, itemSignal, nodes, cleanups };
  };

  /**
   * Remove a managed item and cleanup
   */
  const removeItem = (managed: ManagedItem<T>) => {
    for (const cleanup of managed.cleanups) cleanup();
    for (const node of managed.nodes) node.remove();
  };

  /**
   * Reconcile array changes - simple position-based approach
   */
  const reconcile = (newItems: T[]) => {
    const newLength = newItems?.length ?? 0;
    const oldLength = managedItems.length;

    // Handle empty state
    if (newLength === 0) {
      for (const managed of managedItems) removeItem(managed);
      managedItems.length = 0;
      showEmpty();
      return;
    }
    hideEmpty();

    // Update existing items (just update their signals - DOM auto-updates)
    const minLength = Math.min(oldLength, newLength);
    for (let i = 0; i < minLength; i++) {
      const managed = managedItems[i];
      // Only update signal if value actually changed
      if (managed.itemSignal() !== newItems[i]) {
        managed.itemSignal(newItems[i]);
      }
    }

    // Remove excess items from the end
    if (newLength < oldLength) {
      for (let i = newLength; i < oldLength; i++) {
        removeItem(managedItems[i]);
      }
      managedItems.length = newLength;
    }

    // Add new items at the end
    if (newLength > oldLength) {
      for (let i = oldLength; i < newLength; i++) {
        const managed = createItem(newItems[i], i, anchor);
        managedItems.push(managed);
      }
    }
  };

  // Initial render
  reconcile(arraySignal());

  // Subscribe to array changes
  const unsubscribe = arraySignal.subscribe((items) => {
    reconcile(items);
  }, true);

  // Cleanup
  return () => {
    unsubscribe();
    hideEmpty();
    for (const managed of managedItems) removeItem(managed);
    managedItems.length = 0;
  };
};

// ============================================================================
// Nested Repeat Binding (for repeats inside repeats)
// ============================================================================

/**
 * Nested repeat binding that works within a parent repeat's item elements.
 * Similar to __bindRepeat but searches for elements within a provided element array
 * and subscribes to a parent signal to trigger updates.
 *
 * @param elements - Array of elements to search within (from parent repeat item)
 * @param parentSignal - Signal to subscribe to for updates (typically the parent item signal)
 * @param getArray - Function that returns the array to iterate over
 * @param anchorId - ID of the template anchor element
 * @param templateFn - Function that generates HTML for each item
 * @param initItemBindings - Function that sets up bindings for each item
 * @param emptyTemplate - Optional template to show when array is empty
 */
export const __bindNestedRepeat = <P, T>(
  elements: Element[],
  parentSignal: Signal<P>,
  getArray: () => T[],
  anchorId: string,
  templateFn: (itemSignal: Signal<T>, index: number) => string,
  initItemBindings: (elements: Element[], itemSignal: Signal<T>, index: number) => (() => void)[],
  emptyTemplate?: string,
): (() => void) => {
  // Use the shared element finder
  const anchor = __findEl(elements, anchorId);
  if (!anchor) return () => {};

  const container = anchor.parentNode as ParentNode;
  if (!container) return () => {};

  // Managed items
  const managedItems: ManagedItem<T>[] = [];
  let nextId = 0;

  // Empty state
  let emptyElement: Element | null = null;
  let emptyShowing = false;

  const showEmpty = () => {
    if (emptyShowing || !emptyTemplate) return;
    emptyShowing = true;
    tempEl.innerHTML = emptyTemplate;
    emptyElement = (tempEl.content.cloneNode(true) as DocumentFragment).firstElementChild;
    if (emptyElement) container.insertBefore(emptyElement, anchor);
  };

  const hideEmpty = () => {
    if (!emptyShowing || !emptyElement) return;
    emptyShowing = false;
    emptyElement.remove();
    emptyElement = null;
  };

  const createItem = (item: T, index: number, refNode: Node): ManagedItem<T> => {
    const id = nextId++;
    const itemSignal = createSignal(item);

    const html = templateFn(itemSignal, index);
    tempEl.innerHTML = html;
    const fragment = tempEl.content.cloneNode(true) as DocumentFragment;
    const nodes: ChildNode[] = Array.from(fragment.childNodes);

    for (const node of nodes) {
      container.insertBefore(node, refNode);
    }

    const itemElements = nodes.filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
    const cleanups = initItemBindings(itemElements, itemSignal, index);

    return { id, itemSignal, nodes, cleanups };
  };

  const removeItem = (managed: ManagedItem<T>) => {
    for (const cleanup of managed.cleanups) cleanup();
    for (const node of managed.nodes) node.remove();
  };

  const reconcile = (newItems: T[]) => {
    const newLength = newItems?.length ?? 0;
    const oldLength = managedItems.length;

    if (newLength === 0) {
      for (const managed of managedItems) removeItem(managed);
      managedItems.length = 0;
      showEmpty();
      return;
    }
    hideEmpty();

    const minLength = Math.min(oldLength, newLength);
    for (let i = 0; i < minLength; i++) {
      const managed = managedItems[i];
      if (managed.itemSignal() !== newItems[i]) {
        managed.itemSignal(newItems[i]);
      }
    }

    if (newLength < oldLength) {
      for (let i = newLength; i < oldLength; i++) {
        removeItem(managedItems[i]);
      }
      managedItems.length = newLength;
    }

    if (newLength > oldLength) {
      for (let i = oldLength; i < newLength; i++) {
        const managed = createItem(newItems[i], i, anchor);
        managedItems.push(managed);
      }
    }
  };

  // Initial render
  reconcile(getArray());

  // Subscribe to parent signal changes - when parent changes, re-evaluate the array
  const unsubscribe = parentSignal.subscribe(() => {
    reconcile(getArray());
  }, true);

  return () => {
    unsubscribe();
    hideEmpty();
    for (const managed of managedItems) removeItem(managed);
    managedItems.length = 0;
  };
};
