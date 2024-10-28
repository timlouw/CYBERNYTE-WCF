export class BehaviorSubject<T> {
  private currentValue: T | null;
  private observer: any;

  constructor(firstValue: T) {
    this.currentValue = firstValue;
  }

  subscribe(newObserver: (currentValue: any) => void) {
    this.observer = newObserver;
    newObserver(this.currentValue);
  }

  next(newValue: any) {
    if (this.currentValue === newValue) {
      return;
    }

    this.currentValue = newValue;
    this.observer(this.currentValue);
  }

  getValue(): T | null {
    return this.currentValue;
  }

  destroy() {
    this.observer = null;
    this.currentValue = null;
  }
}
