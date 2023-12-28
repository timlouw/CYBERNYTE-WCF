import { RoutesKeys } from "apps/client/router/routes";

declare global {
  function html(strings: TemplateStringsArray, ...values: any[]): any;
  function navigate(path: RoutesKeys): void;
  function navigateBack(): void;
  function getRouteParam(paramName: string): string;
}

export {};
