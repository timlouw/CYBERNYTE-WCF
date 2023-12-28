export class BehaviorSubject<T> {
  private currentValue: T | null;
  private observers: any[];

  constructor(firstValue: any) {
    this.currentValue = firstValue;
    this.observers = [];
  }

  subscribe(observer: (currentValue: any) => void) {
    this.observers.push(observer);
    observer(this.currentValue);
  }

  unsubscribeAll() {
    this.observers.length = 0;
  }

  next(newValue: any) {
    if (this.currentValue === newValue) {
      return;
    }

    this.currentValue = newValue;
    this.observers?.forEach((observer) => observer(this.currentValue));
  }

  getValue(): T | null {
    return this.currentValue;
  }

  destroy() {
    this.observers.length = 0;
    this.currentValue = null;
  }
}
