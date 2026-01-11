import { Signal } from '../signal/index.js';

// Reusable template element for parsing HTML
const tempEl = document.createElement('template');

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
