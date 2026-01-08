export type Signal<T> = {
  (newValue?: T): T;
  subscribe: (callback: (val: T) => void, skipInitial?: boolean) => () => void;
};

// Batching infrastructure for RAF-based updates
let pendingUpdates: Set<() => void> | null = null;
let rafScheduled = false;

const flushUpdates = () => {
  if (pendingUpdates) {
    const updates = pendingUpdates;
    pendingUpdates = null;
    rafScheduled = false;
    for (const update of updates) {
      update();
    }
  }
};

const scheduleUpdate = (callback: () => void) => {
  if (!pendingUpdates) {
    pendingUpdates = new Set();
  }
  pendingUpdates.add(callback);
  if (!rafScheduled) {
    rafScheduled = true;
    queueMicrotask(flushUpdates); // Use microtask for faster batching than RAF
  }
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
      // Batch DOM updates via microtask
      for (const callback of subscribers) {
        scheduleUpdate(() => callback(value));
      }
    }
    return value;
  }

  // skipInitial: when true, don't call callback immediately (initial values set directly)
  (reactiveFunction as any).subscribe = (callback: (val: T) => void, skipInitial?: boolean) => {
    subscribers.add(callback);
    if (!skipInitial) {
      callback(value); // Synchronous initial call - no batching needed
    }
    return () => {
      subscribers.delete(callback);
    };
  };

  return reactiveFunction as Signal<T>;
};
