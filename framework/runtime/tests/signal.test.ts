/**
 * SIGNAL UNIT TESTS
 *
 * Pure unit tests for the signal system - no DOM dependencies needed.
 * Run with: bun test framework/runtime/tests/signal.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { signal } from '../signal/signal.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for all microtasks to complete (signal batching)
 */
const flushMicrotasks = () => new Promise((resolve) => queueMicrotask(resolve));

// ============================================================================
// Signal Core Tests
// ============================================================================

describe('Signal Core', () => {
  test('signal returns initial value', () => {
    const s = signal(42);
    expect(s()).toBe(42);
  });

  test('signal updates value', () => {
    const s = signal(1);
    s(2);
    expect(s()).toBe(2);
  });

  test('signal with string value', () => {
    const s = signal('hello');
    expect(s()).toBe('hello');
    s('world');
    expect(s()).toBe('world');
  });

  test('signal with boolean value', () => {
    const s = signal(true);
    expect(s()).toBe(true);
    s(false);
    expect(s()).toBe(false);
  });

  test('signal with object value', () => {
    const s = signal({ name: 'test', count: 0 });
    expect(s().name).toBe('test');
    expect(s().count).toBe(0);

    s({ name: 'updated', count: 5 });
    expect(s().name).toBe('updated');
    expect(s().count).toBe(5);
  });

  test('signal with array value', () => {
    const s = signal([1, 2, 3]);
    expect(s()).toEqual([1, 2, 3]);

    s([4, 5, 6]);
    expect(s()).toEqual([4, 5, 6]);
  });

  test('signal with null value', () => {
    const s = signal<string | null>('initial');
    expect(s()).toBe('initial');

    s(null);
    expect(s()).toBe(null);
  });

  test('signal with undefined value', () => {
    const s = signal<number | undefined>(42);
    expect(s()).toBe(42);

    s(undefined);
    expect(s()).toBe(undefined);
  });
});

// ============================================================================
// Subscription Tests
// ============================================================================

describe('Signal Subscriptions', () => {
  test('subscribe receives initial value immediately', () => {
    const s = signal('initial');
    let received = '';

    s.subscribe((val) => {
      received = val;
    });

    expect(received).toBe('initial');
  });

  test('subscribe with skipInitial does not receive initial', () => {
    const s = signal('initial');
    let received: string | null = null;

    s.subscribe((val) => {
      received = val;
    }, true); // skipInitial = true

    expect(received).toBe(null);
  });

  test('subscribe receives updates after initial', async () => {
    const s = signal('initial');
    const received: string[] = [];

    s.subscribe((val) => {
      received.push(val);
    });

    expect(received).toEqual(['initial']);

    s('updated');
    await flushMicrotasks();

    expect(received).toEqual(['initial', 'updated']);
  });

  test('multiple subscribers all receive updates', async () => {
    const s = signal(0);
    let sub1Value = -1;
    let sub2Value = -1;
    let sub3Value = -1;

    s.subscribe((val) => {
      sub1Value = val;
    });
    s.subscribe((val) => {
      sub2Value = val;
    });
    s.subscribe((val) => {
      sub3Value = val;
    });

    expect(sub1Value).toBe(0);
    expect(sub2Value).toBe(0);
    expect(sub3Value).toBe(0);

    s(42);
    await flushMicrotasks();

    expect(sub1Value).toBe(42);
    expect(sub2Value).toBe(42);
    expect(sub3Value).toBe(42);
  });

  test('unsubscribe stops receiving updates', async () => {
    const s = signal(0);
    let value = -1;

    const unsub = s.subscribe((val) => {
      value = val;
    });

    expect(value).toBe(0);

    s(1);
    await flushMicrotasks();
    expect(value).toBe(1);

    unsub(); // Unsubscribe

    s(2);
    await flushMicrotasks();
    expect(value).toBe(1); // Should still be 1, not 2
  });

  test('multiple subscribe/unsubscribe cycles work correctly', async () => {
    const s = signal(0);

    for (let i = 0; i < 10; i++) {
      let received = false;
      const unsub = s.subscribe(() => {
        received = true;
      });
      expect(received).toBe(true);
      unsub();
    }

    // Signal should still work
    let finalValue = -1;
    s.subscribe((val) => {
      finalValue = val;
    });

    s(999);
    await flushMicrotasks();

    expect(finalValue).toBe(999);
  });
});

// ============================================================================
// Batching Tests
// ============================================================================

describe('Signal Batching', () => {
  test('same value does not trigger update', async () => {
    const s = signal('same');
    let callCount = 0;

    s.subscribe(() => callCount++);
    expect(callCount).toBe(1); // Initial call

    s('same'); // Same value
    await flushMicrotasks();

    expect(callCount).toBe(1); // No additional call
  });

  test('multiple rapid updates are batched', async () => {
    const s = signal(0);
    const receivedValues: number[] = [];

    s.subscribe((val) => {
      receivedValues.push(val);
    }, true); // Skip initial

    // Rapid updates
    s(1);
    s(2);
    s(3);
    s(4);
    s(5);

    await flushMicrotasks();

    // Due to batching, we should get fewer callbacks than updates
    // The exact behavior depends on implementation, but final value should be 5
    expect(s()).toBe(5);
    expect(receivedValues[receivedValues.length - 1]).toBe(5);
  });

  test('100 rapid updates complete correctly', async () => {
    const s = signal(0);
    let lastValue = -1;

    s.subscribe((val) => {
      lastValue = val;
    }, true);

    for (let i = 1; i <= 100; i++) {
      s(i);
    }

    await flushMicrotasks();

    // Final value should be 100
    expect(s()).toBe(100);
    expect(lastValue).toBe(100);
  });
});

// ============================================================================
// Array Operation Tests
// ============================================================================

describe('Signal Array Operations', () => {
  test('array push equivalent', () => {
    const s = signal(['a', 'b', 'c']);

    s([...s(), 'd']);

    expect(s()).toEqual(['a', 'b', 'c', 'd']);
  });

  test('array splice equivalent (remove)', () => {
    const s = signal(['a', 'b', 'c', 'd']);

    s(s().toSpliced(1, 1)); // Remove 'b'

    expect(s()).toEqual(['a', 'c', 'd']);
  });

  test('array splice equivalent (insert)', () => {
    const s = signal(['a', 'c']);

    s(s().toSpliced(1, 0, 'b')); // Insert 'b' at index 1

    expect(s()).toEqual(['a', 'b', 'c']);
  });

  test('array update at index', () => {
    const s = signal(['a', 'b', 'c']);

    const arr = [...s()];
    arr[1] = 'B';
    s(arr);

    expect(s()).toEqual(['a', 'B', 'c']);
  });

  test('array swap elements', () => {
    const s = signal(['first', 'second', 'third']);

    const arr = [...s()];
    [arr[0], arr[2]] = [arr[2], arr[0]];
    s(arr);

    expect(s()).toEqual(['third', 'second', 'first']);
  });

  test('array filter', () => {
    const s = signal([1, 2, 3, 4, 5, 6]);

    s(s().filter((x) => x % 2 === 0));

    expect(s()).toEqual([2, 4, 6]);
  });

  test('array map', () => {
    const s = signal([1, 2, 3]);

    s(s().map((x) => x * 2));

    expect(s()).toEqual([2, 4, 6]);
  });

  test('array reverse', () => {
    const s = signal([1, 2, 3]);

    s([...s()].reverse());

    expect(s()).toEqual([3, 2, 1]);
  });

  test('array sort', () => {
    const s = signal([3, 1, 4, 1, 5, 9, 2, 6]);

    s([...s()].sort((a, b) => a - b));

    expect(s()).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  test('array clear', () => {
    const s = signal([1, 2, 3, 4, 5]);

    s([]);

    expect(s()).toEqual([]);
    expect(s().length).toBe(0);
  });
});

// ============================================================================
// Object Operation Tests
// ============================================================================

describe('Signal Object Operations', () => {
  test('object property update', () => {
    const s = signal({ name: 'John', age: 30 });

    s({ ...s(), age: 31 });

    expect(s().name).toBe('John');
    expect(s().age).toBe(31);
  });

  test('object add property', () => {
    const s = signal<Record<string, any>>({ a: 1 });

    s({ ...s(), b: 2 });

    expect(s().a).toBe(1);
    expect(s().b).toBe(2);
  });

  test('object remove property', () => {
    const s = signal<Record<string, number>>({ a: 1, b: 2, c: 3 });

    const { b, ...rest } = s();
    s(rest);

    expect(s()).toEqual({ a: 1, c: 3 });
  });

  test('deeply nested object update', () => {
    const s = signal({
      level1: {
        level2: {
          level3: {
            value: 'original',
          },
        },
      },
    });

    s({
      level1: {
        level2: {
          level3: {
            value: 'updated',
          },
        },
      },
    });

    expect(s().level1.level2.level3.value).toBe('updated');
  });
});

// ============================================================================
// Chained Updates Tests
// ============================================================================

describe('Chained Signal Updates', () => {
  test('signal update triggers dependent subscription', async () => {
    const source = signal(10);
    const derived = signal(0);

    source.subscribe((val) => {
      derived(val * 2);
    });

    expect(derived()).toBe(20); // Initial: 10 * 2

    source(5);
    await flushMicrotasks();
    await flushMicrotasks(); // Extra flush for chained update

    expect(derived()).toBe(10); // 5 * 2
  });

  test('multiple dependent signals', async () => {
    const base = signal(1);
    const doubled = signal(0);
    const tripled = signal(0);
    const squared = signal(0);

    base.subscribe((val) => doubled(val * 2));
    base.subscribe((val) => tripled(val * 3));
    base.subscribe((val) => squared(val * val));

    expect(doubled()).toBe(2);
    expect(tripled()).toBe(3);
    expect(squared()).toBe(1);

    base(5);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(doubled()).toBe(10);
    expect(tripled()).toBe(15);
    expect(squared()).toBe(25);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Signal Edge Cases', () => {
  test('signal with empty string', () => {
    const s = signal('');
    expect(s()).toBe('');

    s('not empty');
    expect(s()).toBe('not empty');

    s('');
    expect(s()).toBe('');
  });

  test('signal with zero', () => {
    const s = signal(0);
    expect(s()).toBe(0);

    s(1);
    expect(s()).toBe(1);

    s(0);
    expect(s()).toBe(0);
  });

  test('signal with empty array', () => {
    const s = signal<string[]>([]);
    expect(s()).toEqual([]);
    expect(s().length).toBe(0);
  });

  test('signal with empty object', () => {
    const s = signal({});
    expect(s()).toEqual({});
  });

  test('signal toggles boolean correctly', async () => {
    const s = signal(false);
    const history: boolean[] = [];

    s.subscribe((val) => history.push(val));

    s(true);
    await flushMicrotasks();

    s(false);
    await flushMicrotasks();

    s(true);
    await flushMicrotasks();

    expect(history).toEqual([false, true, false, true]);
  });

  test('signal handles NaN', () => {
    const s = signal(NaN);
    expect(Number.isNaN(s())).toBe(true);
  });

  test('signal handles Infinity', () => {
    const s = signal(Infinity);
    expect(s()).toBe(Infinity);

    s(-Infinity);
    expect(s()).toBe(-Infinity);
  });

  test('signal handles Date object', () => {
    const now = new Date();
    const s = signal(now);

    expect(s()).toBe(now);

    const later = new Date(now.getTime() + 1000);
    s(later);

    expect(s()).toBe(later);
  });

  test('signal handles function value', () => {
    const fn1 = () => 'one';
    const fn2 = () => 'two';

    const s = signal(fn1);
    expect(s()()).toBe('one');

    s(fn2);
    expect(s()()).toBe('two');
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Signal Performance', () => {
  test('handles 1000 signal updates', async () => {
    const s = signal(0);
    let lastValue = 0;

    s.subscribe((val) => {
      lastValue = val;
    }, true);

    const start = performance.now();

    for (let i = 1; i <= 1000; i++) {
      s(i);
    }

    await flushMicrotasks();

    const duration = performance.now() - start;

    expect(s()).toBe(1000);
    expect(lastValue).toBe(1000);
    expect(duration).toBeLessThan(100); // Should complete in < 100ms
  });

  test('handles 100 concurrent signals', async () => {
    const signals = Array.from({ length: 100 }, (_, i) => signal(i));
    const values: number[] = new Array(100).fill(0);

    signals.forEach((s, i) => {
      s.subscribe((val) => {
        values[i] = val;
      });
    });

    const start = performance.now();

    signals.forEach((s, i) => s(i * 10));

    await flushMicrotasks();

    const duration = performance.now() - start;

    expect(values[0]).toBe(0);
    expect(values[50]).toBe(500);
    expect(values[99]).toBe(990);
    expect(duration).toBeLessThan(50);
  });

  test('handles large array in signal', async () => {
    const s = signal<number[]>([]);
    let updateCount = 0;

    s.subscribe(() => updateCount++);

    const start = performance.now();

    // Create large array
    s(Array.from({ length: 10000 }, (_, i) => i));
    await flushMicrotasks();

    // Map all elements
    s(s().map((x) => x * 2));
    await flushMicrotasks();

    // Filter
    s(s().filter((x) => x % 4 === 0));
    await flushMicrotasks();

    const duration = performance.now() - start;

    expect(s().length).toBe(5000);
    expect(duration).toBeLessThan(100);
  });

  test('rapid toggle does not cause issues', async () => {
    const s = signal(false);
    let toggleCount = 0;

    s.subscribe(() => toggleCount++);

    for (let i = 0; i < 1000; i++) {
      s(!s());
    }

    await flushMicrotasks();

    // Final state should be false (started false, toggled 1000 times = even = false)
    expect(s()).toBe(false);
  });
});

// ============================================================================
// Type Safety Tests (these test at runtime that types work correctly)
// ============================================================================

describe('Signal Type Safety', () => {
  test('generic signal preserves type', () => {
    interface User {
      id: number;
      name: string;
    }

    const user = signal<User>({ id: 1, name: 'Test' });

    expect(user().id).toBe(1);
    expect(user().name).toBe('Test');

    user({ id: 2, name: 'Updated' });

    expect(user().id).toBe(2);
    expect(user().name).toBe('Updated');
  });

  test('union type signal', () => {
    const s = signal<string | number>('initial');
    expect(s()).toBe('initial');

    s(42);
    expect(s()).toBe(42);

    s('back to string');
    expect(s()).toBe('back to string');
  });

  test('array of objects signal', () => {
    interface Item {
      id: number;
      label: string;
    }

    const items = signal<Item[]>([
      { id: 1, label: 'One' },
      { id: 2, label: 'Two' },
    ]);

    expect(items().length).toBe(2);
    expect(items()[0].label).toBe('One');

    items([...items(), { id: 3, label: 'Three' }]);

    expect(items().length).toBe(3);
    expect(items()[2].label).toBe('Three');
  });
});
