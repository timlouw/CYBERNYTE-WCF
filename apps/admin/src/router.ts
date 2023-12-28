// NB!!! NB!!! anything you want to export needs to be done with the window object
// specifically for this file because of the dynamic imports and how esbuild bundles them

import { clearAllBindings, clearAllGlobalTimers, setState } from './index';

let currentPath = '';

interface Route {
  componentModule: () => Promise<any>;
  noPadding?: boolean;
}

interface Routes {
  [key: string]: Route;
}

const ROUTE_NOT_FOUND = {
  // componentModule: () => import('./pages/404'),
};

const ROUTES: Routes = {
//   '/': {
//     componentModule: () => import('./pages/landing'),
//   },
//   '/get-started': {
//     componentModule: () => import('./pages/get-started'),
//   },
//   '/get-location': {
//     componentModule: () => import('./pages/get-location'),
//   },
//   '/area-search': {
//     componentModule: () => import('./pages/area-search'),
//   },
//   '/full-address-search': {
//     componentModule: () => import('./pages/full-address-search'),
//   },
//   '/area-list': {
//     componentModule: () => import('./pages/area-list'),
//   },
//   '/area': {
//     componentModule: () => import('./pages/area'),
//   },
//   '/area/:id': {
//     componentModule: () => import('./pages/area'),
//   },
//   '/schedule': {
//     componentModule: () => import('./pages/schedule'),
//     noPadding: true,
//   },
//   '/help': {
//     componentModule: () => import('./pages/help'),
//   },
//   '/unauthorised': {
//     componentModule: () => import('./pages/unauthorised'),
//   },
//   '/rate-limit-reached': {
//     componentModule: () => import('./pages/rate-limit-reached'),
//   },
//   '/service-unavailable': {
//     componentModule: () => import('./pages/service-unavailable'),
//   },
};

let routeParams: { [key: string]: any } = {};

const handleLocation = () => {
  clearAllGlobalTimers();
  clearAllBindings();

  routeParams = {};

  currentPath = window.location.pathname;
  let newRoute: any = ROUTE_NOT_FOUND;

  if (ROUTES[currentPath]) {
    newRoute = ROUTES[currentPath];
  }
  // else {
  //     newRoute = await getMatchingRouteWithParams(currentPath, newRoute);
  // }

  newRoute
    .componentModule()
    .then((module: any) => {
      const componentName = module.default;
      const routerOutlet = document.getElementById('router-outlet');

      if (routerOutlet && newRoute) {
        routerOutlet.className = `router-content-container ${newRoute.noPadding ? 'router-content-container-no-padding' : ''}`;
        routerOutlet.innerHTML = html`
                <ui-toaster></ui-toaster>
                <${componentName}></${componentName}>
            `;
        routerOutlet.style.height = '100%';
        routerOutlet.scrollTo({ top: 0, behavior: 'smooth' });

        // startRouterClickListeners(routerOutlet);
        // startRouterIfElementListeners(document.querySelector('body') as HTMLElement);
      }
    })
    .catch((error: any) => {
      console.error(error);
      setState('tempStoredToken', (window as any).token);
      window.location.reload();
    });
};

// const getMatchingRouteWithParams = async (path: string, newRoute: Route) => {
//     return new Promise((resolve) => {
//         for (let routePath in ROUTES) {
//             const routeParts = routePath.split('/');
//             const newRouteParts = path.split('/');

//             if (routeParts.length === newRouteParts.length) {
//                 const params: { [key: string]: any } = {};
//                 let matched = true;

//                 for (let i = 0; i < routeParts.length; i++) {
//                     const routePart = routeParts[i];
//                     const pathPart = newRouteParts[i];

//                     if (routePart.startsWith(':')) {
//                         const paramName: string = routePart.slice(1);
//                         params[paramName] = pathPart;
//                     } else if (routePart !== pathPart) {
//                         matched = false;
//                         break;
//                     }
//                 }

//                 if (matched) {
//                     newRoute = ROUTES[routePath];
//                     setRouteParams(params);
//                     resolve(newRoute);
//                 }
//             }
//         };

//         resolve(newRoute);
//     });
// }

// const setRouteParams = (params: { [key: string]: any }) => {
//     for (let paramName in params) {
//         routeParams[paramName] = params[paramName];
//     }
// };

(window as any).getRouteParam = (paramName: string) => {
  return routeParams[paramName];
};

(window as any).navigate = (path: string) => {
  if (currentPath === path) return;

  window.history.pushState({}, '', path);
  handleLocation();
};

(window as any).navigateBack = () => {
  window.history.back();
};

window.onpopstate = handleLocation;

window.onload = handleLocation;

document.dispatchEvent(new Event('router-initialized'));

// NB!!! NB!!! anything you want to export needs to be done with the window object
// specifically for this file because of the dynamic imports and how esbuild bundles them
