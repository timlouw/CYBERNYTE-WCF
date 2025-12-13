/**
 * Component HTML Generator
 *
 * This module contains the pure HTML generation logic that is shared between:
 * 1. Runtime (browser) - used by registerComponent when called dynamically
 * 2. Compile-time (Node.js) - used by the component-precompiler plugin for CTFE
 *
 * This is the key to true CTFE: the SAME function runs at compile-time and runtime.
 */

interface ComponentHTMLConfig {
  selector: string;
  props: Record<string, any>;
}

/**
 * Generates the HTML string for a component with the given selector and props.
 * This function is designed to be pure and side-effect free, making it safe
 * for compile-time evaluation.
 */
export const generateComponentHTML = (config: ComponentHTMLConfig): string => {
  const { selector, props } = config;

  const propsString = Object.entries(props)
    .map(([key, value]) => {
      const val = typeof value === 'string' ? value : JSON.stringify(value) || '';
      return `${key}="${val.replace(/"/g, '&quot;')}"`;
    })
    .join(' ');

  return `
      <${selector}
        ${propsString}>
      </${selector}>`;
};

/**
 * Creates a component HTML selector function.
 * This is what registerComponent returns for 'component' type.
 */
export const createComponentHTMLSelector = <T extends Record<string, any>>(selector: string): ((props: T) => string) => {
  return (props: T) => generateComponentHTML({ selector, props });
};
