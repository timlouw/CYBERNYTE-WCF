import { clearAllClickBindings } from './data-bindings/data-click-binding';
import { clearAllIfBindings } from './data-bindings/data-if-binding';
import { clearAllDataInputBindings, clearAllDataOutputBindings } from './data-bindings/data-input-binding';
import { clearAllDataValidationBindings } from './data-bindings/data-validation-binding';

export const clearAllBindings = () => {
  clearAllIfBindings();
  clearAllClickBindings();
  clearAllDataValidationBindings();
  clearAllDataInputBindings();
  clearAllDataOutputBindings();
};


export const getRandomNumber = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
