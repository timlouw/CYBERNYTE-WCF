/**
 * Main Entry Point - Bootstraps the root component
 *
 * This file serves as the primary entry point for the application.
 * It imports and renders the root component (e.g., landing page, app shell).
 *
 * The compiler will:
 * 1. Evaluate the root component at build time (CTFE)
 * 2. Inject the resulting HTML into index.html body
 * 3. This script then hydrates the component (attaches signals, event listeners)
 *
 * To use a router instead, simply change the entry point in config.ts
 * or add the router as an additional entry point.
 */

// Import global styles (pre-bundled at compile time)
import globalStyles from './assets/global.css';

import { mount } from '../../framework/compiler/bootstrap.js';
import { AppComponent } from './pages/landing.js';

// Mount with global styles - styles are registered before component initializes
mount(AppComponent, {
  styles: [globalStyles],
});
