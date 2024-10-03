// NB!!! NB!!! anything you want to export needs to be done with the window object
// specifically for this file because of the dynamic imports and how esbuild bundles them

import { ROUTES, ROUTE_NOT_FOUND, Route, RoutesKeys } from './routes';

const body = document.querySelector('body') as HTMLElement;
const setupRouterOutlet = () => {
  body.innerHTML = html` <div id="router-outlet"></div> `;
};
setupRouterOutlet();
const routerOutlet = body.querySelector('#router-outlet') as HTMLElement;

let currentPath: RoutesKeys;
let newRoute: Route;
let routeParams: { [key: string]: any } = {};

const handleLocation = async () => {
  matchNewRoute();
};

const matchNewRoute = () => {
  currentPath = window.location.pathname as RoutesKeys;

  if (ROUTES[currentPath]) {
    newRoute = ROUTES[currentPath];
  } else {
    newRoute = getMatchingRouteWithParams(currentPath);
  }

  injectNewRoute();
};

const injectNewRoute = () => {
  newRoute
    .componentModule()
    .then((module: any) => {
      const componentName = module.default;

      routerOutlet.innerHTML = html`
      <${componentName}></${componentName}>
    `;

      routerOutlet.scrollTo({ top: 0, behavior: 'smooth' });
    })
    .catch((error: any) => {
      console.error(error);
      window.location.reload();
    });
};

const getMatchingRouteWithParams = (path: string) => {
  routeParams = {};

  for (let routePath in ROUTES) {
    const routeParts = routePath.split('/');
    const newRouteParts = path.split('/');

    if (routeParts.length === newRouteParts.length) {
      const params: { [key: string]: any } = {};
      let matched = true;

      for (let i = 0; i < routeParts.length; i++) {
        const routePart = routeParts[i];
        const pathPart = newRouteParts[i];

        if (routePart.startsWith(':')) {
          const paramName: string = routePart.slice(1);
          params[paramName] = pathPart;
        } else if (routePart !== pathPart) {
          matched = false;
          break;
        }
      }

      if (matched) {
        newRoute = ROUTES[routePath as RoutesKeys];
        setRouteParams(params);
        return newRoute;
      }
    }
  }

  newRoute = ROUTE_NOT_FOUND;
  return newRoute;
};

const setRouteParams = (params: { [key: string]: any }) => {
  for (let paramName in params) {
    routeParams[paramName] = params[paramName];
  }
};

window.getRouteParam = (paramName: string) => {
  return routeParams[paramName];
};

window.navigate = (path: string) => {
  if (currentPath === path) return;

  window.history.pushState({}, '', path);
  handleLocation();
};

window.navigateBack = () => {
  window.history.back();
};

window.onpopstate = handleLocation;

window.onload = handleLocation;

// NB!!! NB!!! anything you want to export needs to be done with the window object
// specifically for this file because of the dynamic imports and how esbuild bundles them
