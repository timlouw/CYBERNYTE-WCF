export type Signal<T> = {
  (newValue?: T): T;
  subscribe: (callback: (val: T) => void, skipInitial?: boolean) => () => void;
};

// Batching infrastructure - stores [callback, value] pairs instead of closures
type PendingUpdate = [callback: (val: any) => void, value: any];
let pendingUpdates: PendingUpdate[] | null = null;
let rafScheduled = false;

const flushUpdates = () => {
  if (pendingUpdates) {
    const updates = pendingUpdates;
    pendingUpdates = null;
    rafScheduled = false;
    for (let i = 0; i < updates.length; i++) {
      updates[i][0](updates[i][1]);
    }
  }
};

const scheduleUpdate = (callback: (val: any) => void, value: any) => {
  if (!pendingUpdates) {
    pendingUpdates = [];
  }
  pendingUpdates.push([callback, value]);
  if (!rafScheduled) {
    rafScheduled = true;
    queueMicrotask(flushUpdates);
  }
};

export const signal = <T>(initialValue: T): Signal<T> => {
  let value = initialValue;
  // Lazy initialize subscribers - saves memory for signals that are never subscribed to
  let subscribers: Set<(val: T) => void> | null = null;

  function reactiveFunction(newValue?: T) {
    if (arguments.length === 0) {
      return value;
    }
    if (value !== newValue) {
      value = newValue!;
      // Batch DOM updates via microtask (only if we have subscribers)
      if (subscribers) {
        subscribers.forEach((callback) => {
          scheduleUpdate(callback, value);
        });
      }
    }
    return value;
  }

  // skipInitial: when true, don't call callback immediately (initial values set directly)
  (reactiveFunction as any).subscribe = (callback: (val: T) => void, skipInitial?: boolean) => {
    if (!subscribers) subscribers = new Set();
    subscribers.add(callback);
    if (!skipInitial) {
      callback(value); // Synchronous initial call - no batching needed
    }
    return () => {
      subscribers!.delete(callback);
    };
  };

  return reactiveFunction as Signal<T>;
};
