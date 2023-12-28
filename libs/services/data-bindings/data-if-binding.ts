import { BehaviorSubject } from '../../models/BehaviorSubject';

export const DOM_IF_ATTRIBUTE_NAME = 'data-if';
interface GlobalIfSubject {
  value: BehaviorSubject<boolean>;
  element: BehaviorSubject<HTMLElement>;
  subscribed: boolean;
}
const globalIfSubjects: {
  [key: string]: GlobalIfSubject;
} = {};

export const getIfBinding = (name: string) => {
  return globalIfSubjects[name]?.value;
};

export const setIfBinding = (name: string, value: boolean) => {
  globalIfSubjects[name] = {
    value: new BehaviorSubject(value),
    element: new BehaviorSubject(null),
    subscribed: false,
  };

  subscribeIfSubject(globalIfSubjects[name]);
  return globalIfSubjects[name].value;
};

export const clearAllIfBindings = () => {
  Object.keys(globalIfSubjects).forEach((key) => {
    globalIfSubjects[key].value.destroy();
    globalIfSubjects[key].element.destroy();
    delete globalIfSubjects[key];
  });
};

const subscribeIfSubject = (ifSubject: GlobalIfSubject) => {
  if (!ifSubject.subscribed) {
    ifSubject.value.subscribe((value) => {
      ifSubject.subscribed = true;
      if (ifSubject.element) {
        ifSubject.element.subscribe((element) => {
          if (element) {
            processIfElement(element, value);
          }
        });
      }
    });
  }
};

const processIfElement = (element: HTMLElement, condition: boolean) => {
  if (element?.parentNode?.nodeName === 'TEMPLATE' && condition) {
    showElementByRemovingTemplateWrapper(element.parentNode);
  } else if (element?.nodeName !== 'TEMPLATE' && !condition) {
    hideElementByWrappingInTemplate(element);
  }
};

const showElementByRemovingTemplateWrapper = (templateWrapper: ParentNode) => {
  const content = templateWrapper.firstChild as ChildNode;
  templateWrapper.parentNode?.insertBefore(content, templateWrapper);
  templateWrapper.parentNode?.removeChild(templateWrapper);
};

const hideElementByWrappingInTemplate = (element: HTMLElement) => {
  const templateWrapper = document.createElement('template');
  element.parentNode?.insertBefore(templateWrapper, element);
  templateWrapper.appendChild(element);
};

export const startShadowDomIfElementListeners = (shadowDom: HTMLElement | ShadowRoot) => {
  queryForIfElements(shadowDom);
};

const queryForIfElements = (rootElement: HTMLElement | ShadowRoot) => {
  const elements = rootElement.querySelectorAll(`[${DOM_IF_ATTRIBUTE_NAME}]`);
  elements.forEach((element) => {
    const dataIfName = element.getAttribute(DOM_IF_ATTRIBUTE_NAME);
    if (dataIfName && globalIfSubjects[dataIfName]) {
      globalIfSubjects[dataIfName].element.next(element);
    }
  });
};
