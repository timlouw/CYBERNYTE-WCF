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
  let textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE) as Text | undefined;
  if (!textNode) {
    textNode = document.createTextNode('');
    el.appendChild(textNode);
  }
  
  // Subscribe to signal and update only the text node
  signal.subscribe((v) => {
    textNode.data = String(v);
  });
};

/**
 * Bind conditional rendering using <template> as placeholder.
 * When signal is truthy, content is shown. When falsy, replaced with <template>.
 * 
 * @param root - Shadow root to search in
 * @param signal - Signal controlling visibility
 * @param id - Element/placeholder ID
 * @param template - HTML string to insert when condition is true
 * @param initNested - Function that initializes nested bindings, returns unsubscribe functions
 * @returns Cleanup function to remove this binding
 */
export const __bindIf = (
  root: ShadowRoot,
  signal: Signal<any>,
  id: string,
  template: string,
  initNested: () => (() => void)[]
): (() => void) => {
  let cleanups: (() => void)[] = [];
  let isShown = root.getElementById(id)?.tagName !== 'TEMPLATE';

  // If already shown (initialValue was true), init nested bindings now
  if (isShown) {
    cleanups = initNested();
  }

  const unsubscribe = signal.subscribe((value) => {
    const shouldShow = Boolean(value);
    if (shouldShow === isShown) return;

    if (shouldShow) {
      // Show: Replace <template> placeholder with actual content
      const placeholder = root.getElementById(id) as HTMLTemplateElement;
      if (!placeholder || placeholder.tagName !== 'TEMPLATE') return;

      const temp = document.createElement('template');
      temp.innerHTML = template;
      placeholder.replaceWith(temp.content);

      // Initialize nested bindings (elements now exist in DOM, refs will be cached)
      cleanups = initNested();
    } else {
      // Hide: First cleanup subscriptions (releases element refs in closures)
      cleanups.forEach((fn) => fn());
      cleanups = [];

      // Then replace content with <template> placeholder
      const el = root.getElementById(id);
      if (!el) return;

      const placeholder = document.createElement('template');
      placeholder.id = id;
      el.replaceWith(placeholder);
    }

    isShown = shouldShow;
  });

  // Return cleanup for this binding itself (for parent conditional cleanup)
  return () => {
    unsubscribe();
    cleanups.forEach((fn) => fn());
    cleanups = [];
  };
};
