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

// Reusable template element for creating content
const tempEl = document.createElement('template');

/**
 * Bind conditional rendering using visibility toggling to prevent CLS.
 * Uses display:none instead of DOM removal to avoid layout shifts.
 *
 * @param root - Shadow root to search in
 * @param signal - Signal controlling visibility
 * @param id - Element/placeholder ID
 * @param template - HTML string to insert when condition is true
 * @param initNested - Function that initializes nested bindings, returns unsubscribe functions
 * @returns Cleanup function to remove this binding
 */
export const __bindIf = (root: ShadowRoot, signal: Signal<any>, id: string, template: string, initNested: () => (() => void)[]): (() => void) => {
  let cleanups: (() => void)[] = [];
  let el = root.getElementById(id);
  const isTemplate = el?.tagName === 'TEMPLATE';

  // If it's a template placeholder, we need to insert the actual content first (hidden)
  if (isTemplate && el) {
    tempEl.innerHTML = template;
    const content = tempEl.content.firstElementChild as HTMLElement;
    if (content) {
      content.style.display = 'none';
      el.replaceWith(content);
      el = root.getElementById(id);
    }
  }

  // Now el is the actual element - init bindings
  if (el) {
    cleanups = initNested();
  }

  // Subscribe and toggle visibility via display
  const unsubscribe = signal.subscribe((value) => {
    const shouldShow = Boolean(value);
    const currentEl = root.getElementById(id) as HTMLElement;
    if (currentEl) {
      currentEl.style.display = shouldShow ? '' : 'none';
    }
  }, false); // Don't skip initial - we want to set initial visibility

  return () => {
    unsubscribe();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};

/**
 * Bind conditional rendering with a complex expression using visibility toggling.
 * Uses display:none instead of DOM removal to avoid layout shifts.
 */
export const __bindIfExpr = (root: ShadowRoot, signals: Signal<any>[], evalExpr: () => boolean, id: string, template: string, initNested: () => (() => void)[]): (() => void) => {
  let cleanups: (() => void)[] = [];
  let el = root.getElementById(id);
  const isTemplate = el?.tagName === 'TEMPLATE';

  // If it's a template placeholder, insert actual content first (hidden)
  if (isTemplate && el) {
    tempEl.innerHTML = template;
    const content = tempEl.content.firstElementChild as HTMLElement;
    if (content) {
      content.style.display = 'none';
      el.replaceWith(content);
      el = root.getElementById(id);
    }
  }

  // Init bindings
  if (el) {
    cleanups = initNested();
  }

  const update = () => {
    const shouldShow = Boolean(evalExpr());
    const currentEl = root.getElementById(id) as HTMLElement;
    if (currentEl) {
      currentEl.style.display = shouldShow ? '' : 'none';
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
