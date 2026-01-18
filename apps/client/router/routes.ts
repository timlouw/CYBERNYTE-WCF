export interface Route {
  componentModule: () => Promise<any>;
  title?: string;
  selector?: string;
}

export const ROUTE_NOT_FOUND: Route = {
  componentModule: () => import('../pages/404.js'),
  title: 'Not Found',
};

export const ROUTES = {
  '/': {
    componentModule: () => import('../pages/landing.js'),
    title: 'Home',
  },
  '/test': {
    componentModule: () => import('../pages/test-showcase.js'),
    title: 'Test Showcase',
  },
} as const;

export type RoutesKeys = keyof typeof ROUTES;
