export type Signal<T> = {
  (newValue?: T): T;
  subscribe: (callback: (val: T) => void) => () => void;
};

export const signal = <T>(initialValue: T): Signal<T> => {
  let value = initialValue;
  const subscribers = new Set<(val: T) => void>();

  function reactiveFunction(newValue?: T) {
    if (arguments.length === 0) {
      return value;
    }
    if (value !== newValue) {
      value = newValue!;
      for (const callback of subscribers) {
        callback(value);
      }
    }
    return value;
  }

  (reactiveFunction as any).subscribe = (callback: (val: T) => void) => {
    subscribers.add(callback);
    callback(value);
    return () => {
      subscribers.delete(callback);
    };
  };

  return reactiveFunction as Signal<T>;
};
