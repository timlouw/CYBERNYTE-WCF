export const DOM_CLICK_ATTRIBUTE_NAME = 'data-click';

const globalClickCallbacks: { [key: string]: (event: Event) => void } = {};
const observers: any[] = [];
const registeredListeners = new Map();
const config = { childList: true, subtree: true };

export const setClick = (key: string, callback: (event: Event) => void) => {
  globalClickCallbacks[key] = callback;
};

export const startShadowDomClickListeners = (shadowDom: HTMLElement | ShadowRoot) => {
  queryForCallbackBindingElements(shadowDom);
  startMutationObserver(shadowDom);
};

export const clearAllClickBindings = () => {
  Object.keys(globalClickCallbacks).forEach((key) => {
    delete globalClickCallbacks[key];
  });

  observers.forEach((observer) => {
    observer.disconnect();
  });

  observers.length = 0;

  registeredListeners.forEach((listener, element) => {
    element.removeEventListener('click', listener);
  });

  registeredListeners.clear();
};

const queryForCallbackBindingElements = (rootElement: HTMLElement | ShadowRoot) => {
  const listeners = rootElement.querySelectorAll(`[${DOM_CLICK_ATTRIBUTE_NAME}]`);
  listeners.forEach((element) => {
    const clickCallback = element.getAttribute(DOM_CLICK_ATTRIBUTE_NAME) ?? '';

    if (registeredListeners.has(element)) {
      element.removeEventListener('click', registeredListeners.get(element));
    }

    const newListener = (event: Event) => {
      globalClickCallbacks[clickCallback]?.(event);
    };

    element.addEventListener('click', newListener);

    registeredListeners.set(element, newListener);
  });
};

const startMutationObserver = (rootElement: HTMLElement | ShadowRoot) => {
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((newNode) => {
          if (newNode.nodeType === Node.ELEMENT_NODE) {
            const element = newNode as HTMLElement;
            if (element.querySelector(`[${DOM_CLICK_ATTRIBUTE_NAME}]`) || element.hasAttribute(DOM_CLICK_ATTRIBUTE_NAME)) {
              queryForCallbackBindingElements(element);
            }
          }
        });
      }
    }
  });

  observer.observe(rootElement, config);

  observers.push(observer);
};
