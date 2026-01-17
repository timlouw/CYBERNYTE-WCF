// ============================================================================
// Compiler Constants - Magic strings used across plugins
// ============================================================================

/**
 * Function names used in AST matching
 */
export const FN = {
  REGISTER_COMPONENT: 'registerComponent',
  SIGNAL: 'signal',
  HTML: 'html',
  CSS: 'css',
} as const;

/**
 * Class names used in AST matching
 */
export const CLASS = {
  COMPONENT: 'Component',
} as const;

/**
 * Component types used in registerComponent config
 */
export const COMPONENT_TYPE = {
  COMPONENT: 'component',
  PAGE: 'page',
} as const;

/**
 * Config property names
 */
export const PROP = {
  SELECTOR: 'selector',
  TYPE: 'type',
  COMPONENT_MODULE: 'componentModule',
} as const;

/**
 * Plugin names for logging
 */
export const PLUGIN_NAME = {
  TYPE_CHECK: 'type-check',
  ROUTES: 'routes-ctfe',
  COMPONENT: 'component-ctfe',
  REACTIVE: 'reactive-binding',
  STRIPPER: 'stripper',
  POST_BUILD: 'post-build',
} as const;

/**
 * Reactive binding function names (injected into component classes)
 */
export const BIND_FN = {
  TEXT: '__bindText',
  STYLE: '__bindStyle',
  ATTR: '__bindAttr',
  IF: '__bindIf',
  IF_EXPR: '__bindIfExpr',
  REPEAT: '__bindRepeat',
  EVENTS: '__setupEventDelegation',
} as const;

/**
 * Generate HTML selector tag for a component
 * @example generateSelectorHTML('ui-button') => '<ui-button></ui-button>'
 */
export const generateSelectorHTML = (selector: string): string => `<${selector}></${selector}>`;
