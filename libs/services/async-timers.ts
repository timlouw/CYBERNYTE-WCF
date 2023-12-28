const globalSetIntervals: { [key: string]: number } = {};
const globalSetTimeouts: { [key: string]: number } = {};

export const setGlobalInterval = (callback: () => void, duration: number, name: string) => {
  const newInterval: any = setInterval(callback, duration);
  globalSetIntervals[name] = newInterval;
  return newInterval;
};

export const setGlobalTimeout = (callback: () => void, duration: number, name: string) => {
  const newTimeout: any = setTimeout(callback, duration);
  globalSetTimeouts[name] = newTimeout;
  return newTimeout;
};

export const clearGlobalInterval = (name: string) => {
  if (globalSetIntervals[name]) clearInterval(globalSetIntervals[name]);
};

export const clearGlobalTimeout = (name: string) => {
  if (globalSetTimeouts[name]) clearTimeout(globalSetTimeouts[name]);
};

export const clearAllGlobalTimers = () => {
  Object.keys(globalSetIntervals).forEach((key) => {
    clearGlobalInterval(key);
  });

  Object.keys(globalSetTimeouts).forEach((key) => {
    clearGlobalTimeout(key);
  });
};
