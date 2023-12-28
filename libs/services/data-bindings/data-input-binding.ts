import { BehaviorSubject } from '../../models/BehaviorSubject';

const globalInputDataSubjects: { [key: string]: BehaviorSubject<any> } = {};
export const DOM_DATA_INPUT_ATTRIBUTE_NAME = 'data-input';

export const setDataInputBinding = (name: string, value: any) => {
  globalInputDataSubjects[name] = new BehaviorSubject(value);
  return globalInputDataSubjects[name];
};
export const getDataInputBinding = (name: string) => {
  return globalInputDataSubjects[name];
};
export const clearAllDataInputBindings = () => {
  Object.keys(globalInputDataSubjects).forEach((key) => {
    globalInputDataSubjects[key].destroy();
    delete globalInputDataSubjects[key];
  });
};

const globalOutputDataSubjects: { [key: string]: BehaviorSubject<any> } = {};
export const DOM_DATA_OUTPUT_ATTRIBUTE_NAME = 'data-output';

export const setDataOutputBinding = (name: string, value: any) => {
  globalOutputDataSubjects[name] = new BehaviorSubject(value);
  return globalOutputDataSubjects[name];
};
export const getDataOutputBinding = (name: string) => {
  return globalOutputDataSubjects[name];
};
export const clearAllDataOutputBindings = () => {
  Object.keys(globalOutputDataSubjects).forEach((key) => {
    globalOutputDataSubjects[key].destroy();
    delete globalOutputDataSubjects[key];
  });
};
