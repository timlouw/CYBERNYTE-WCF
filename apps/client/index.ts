import '../../libs/styles/global.css';

export * from '@services';
export * from '@components';
export * from '@models';

window.html = (strings: TemplateStringsArray, ...values: any[]) => String.raw({ raw: strings }, ...values);

new EventSource('/esbuild').addEventListener('change', () => location.reload());
