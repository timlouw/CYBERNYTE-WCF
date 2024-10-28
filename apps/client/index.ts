import '../../libs/styles/global.css';

export * from '@services';
export * from '@components';
export * from '@models';

window.html = (strings: TemplateStringsArray, ...values: any[]) => {
  // console.log('html', strings, values);
  return String.raw({ raw: strings }, ...values);
}
