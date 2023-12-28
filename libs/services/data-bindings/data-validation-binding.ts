import { BehaviorSubject } from '../../models/BehaviorSubject';

const globalInputValidationSubjects: { [key: string]: BehaviorSubject<any> } = {};

export const setDataValidationBinding = (name: string, value: any) => {
  globalInputValidationSubjects[name] = new BehaviorSubject(value);
  return globalInputValidationSubjects[name];
};
export const getDataValidationBinding = (name: string) => {
  return globalInputValidationSubjects[name];
};
export const clearAllDataValidationBindings = () => {
  Object.keys(globalInputValidationSubjects).forEach((key) => {
    globalInputValidationSubjects[key].destroy();
    delete globalInputValidationSubjects[key];
  });
};
