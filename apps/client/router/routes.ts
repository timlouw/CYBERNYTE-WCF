export interface Route {
  componentModule: () => Promise<any>;
  title?: string;
}

export const ROUTE_NOT_FOUND: Route = {
  componentModule: () => import('../pages/404.js'),
  title: 'Not Found'
};

export const ROUTES = {
  '/': {
    componentModule: () => import('../pages/landing.js'),
    title: 'Home',
  }
} as const;

export type RoutesKeys = keyof typeof ROUTES;
