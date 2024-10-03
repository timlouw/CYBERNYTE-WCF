import { clearAllIfBindings } from './data-bindings/data-if-binding';

export const clearAllBindings = () => {
  clearAllIfBindings();
};

export const getRandomNumber = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
