import { Signal } from '../signal/index.js';

/** Core binding function - finds element by ID and subscribes to signal */
const __bind = (root: ShadowRoot, signal: Signal<any>, id: string, update: (el: HTMLElement, v: any) => void): void => {
  const el = root.getElementById(id);
  if (el) signal.subscribe((v) => update(el, v));
};

/** Bind signal to element style property */
export const __bindStyle = (root: ShadowRoot, signal: Signal<any>, id: string, prop: string): void => {
  __bind(root, signal, id, (el, v) => {
    (el.style as any)[prop] = v;
  });
};

/** Bind signal to element attribute */
export const __bindAttr = (root: ShadowRoot, signal: Signal<any>, id: string, attr: string): void => {
  __bind(root, signal, id, (el, v) => {
    el.setAttribute(attr, v);
  });
};

/**
 * Bind signal to element's first text node.
 * Updates only the text node, not the element, for minimal DOM mutation.
 */
export const __bindText = (root: ShadowRoot, signal: Signal<any>, id: string): void => {
  const el = root.getElementById(id);
  if (!el) return;

  // Find the first text node, or create one if element is empty
  let textNode = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
  if (!textNode) {
    textNode = document.createTextNode('');
    el.appendChild(textNode);
  }

  // Subscribe to signal and update only the text node
  signal.subscribe((v) => {
    textNode.data = String(v);
  });
};

// Reusable template element for parsing HTML
const tempEl = document.createElement('template');

/**
 * Bind conditional rendering using real DOM insertion/removal.
 * Uses template placeholder when hidden, swaps in real content when shown.
 * Lazily initializes nested bindings only when condition first becomes true.
 *
 * @param root - Shadow root to search in
 * @param signal - Signal controlling visibility
 * @param id - Element/placeholder ID
 * @param template - HTML string to insert when condition is true
 * @param initNested - Function that initializes nested bindings, returns cleanup functions
 * @returns Cleanup function to remove this binding
 */
export const __bindIf = (root: ShadowRoot, signal: Signal<any>, id: string, template: string, initNested: () => (() => void)[]): (() => void) => {
  let cleanups: (() => void)[] = [];
  let bindingsInitialized = false;

  // Get placeholder template element
  const placeholder = root.getElementById(id) as HTMLTemplateElement | null;

  // Parse the template content once
  tempEl.innerHTML = template;
  const contentFragment = tempEl.content.cloneNode(true) as DocumentFragment;
  const contentEl = contentFragment.firstElementChild as HTMLElement;

  // Track current state: either placeholder is in DOM, or contentEl is
  let currentlyShowing = false;

  const show = () => {
    if (currentlyShowing) return;
    currentlyShowing = true;

    const current = root.getElementById(id);
    if (current && contentEl) {
      current.replaceWith(contentEl);

      // Lazily initialize bindings on first show
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
    if (current && placeholder) {
      // Create a new placeholder template to swap back in
      const newPlaceholder = document.createElement('template');
      newPlaceholder.id = id;
      current.replaceWith(newPlaceholder);
    }
  };

  // Subscribe to signal
  const unsubscribe = signal.subscribe((value) => {
    if (Boolean(value)) {
      show();
    } else {
      hide();
    }
  }, false);

  return () => {
    unsubscribe();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};

/**
 * Bind conditional rendering with a complex expression using real DOM insertion/removal.
 * Uses template placeholder when hidden, swaps in real content when shown.
 * Lazily initializes nested bindings only when condition first becomes true.
 */
export const __bindIfExpr = (root: ShadowRoot, signals: Signal<any>[], evalExpr: () => boolean, id: string, template: string, initNested: () => (() => void)[]): (() => void) => {
  let cleanups: (() => void)[] = [];
  let bindingsInitialized = false;

  // Get placeholder template element
  const placeholder = root.getElementById(id) as HTMLTemplateElement | null;

  // Parse the template content once
  tempEl.innerHTML = template;
  const contentFragment = tempEl.content.cloneNode(true) as DocumentFragment;
  const contentEl = contentFragment.firstElementChild as HTMLElement;

  // Track current state
  let currentlyShowing = false;

  const show = () => {
    if (currentlyShowing) return;
    currentlyShowing = true;

    const current = root.getElementById(id);
    if (current && contentEl) {
      current.replaceWith(contentEl);

      // Lazily initialize bindings on first show
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
    if (current && placeholder) {
      // Create a new placeholder template to swap back in
      const newPlaceholder = document.createElement('template');
      newPlaceholder.id = id;
      current.replaceWith(newPlaceholder);
    }
  };

  const update = () => {
    if (Boolean(evalExpr())) {
      show();
    } else {
      hide();
    }
  };

  // Subscribe to all signals
  const unsubscribes = new Array(signals.length);
  for (let i = 0; i < signals.length; i++) {
    unsubscribes[i] = signals[i].subscribe(update, false);
  }

  // Set initial state
  update();

  return () => {
    for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};
