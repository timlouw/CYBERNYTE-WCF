export const getState = (key: string): any => {
  let value = window.localStorage.getItem(key);

  if (!value) {
    return null;
  }

  if (value) {
    try {
      value = JSON.parse(value);
    } catch (e) {}
  }

  return value ?? null;
};

export const setState = (key: string, value: any) => {
  const originalValue = value;
  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }

  window.localStorage.setItem(key, value);

  return originalValue;
};

export const deleteState = (key: string) => {
  window.localStorage.removeItem(key);
};

export const clearAllState = (showToast = false) => {
  window.localStorage.clear();
  console.log('All properties in local storage have been cleared!');
};
