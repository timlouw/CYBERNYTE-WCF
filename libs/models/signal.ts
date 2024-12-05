export const signal = (initialValue: any) => {
  const eventTarget = new EventTarget();
  let value = initialValue;

  const reactiveFunction = (newValue?: any) => {
    if (!newValue) {
      // Getter: Return the current value
      return value;
    } else {
      // Setter: Update the value and notify subscribers if it changed
      if (value !== newValue) {
        value = newValue;
        eventTarget.dispatchEvent(new CustomEvent('change', { detail: value }));
      }
      return value;
    }
  }

  // Add the subscribe method to the reactive function
  reactiveFunction.subscribe = (callback: any) => {
    const listener = (e: any) => callback(e.detail);
    eventTarget.addEventListener('change', listener);
    // Immediately call the callback with the current value
    callback(value);
    // Return an unsubscribe function
    return () => {
      eventTarget.removeEventListener('change', listener);
    };
  };

  return reactiveFunction;
}
