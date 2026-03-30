/**
 * Global Vitest setup — applied before every test file.
 *
 * Polyfills `Object.groupBy` (ECMAScript 2024 / Node.js 21+) so that
 * chevrotain@12 can run its grammar-validation step on older runtimes.
 */

if (typeof Object.groupBy === "undefined") {
  Object.groupBy = function groupBy<T>(
    iterable: Iterable<T>,
    keySelector: (item: T, index: number) => PropertyKey,
  ): Record<PropertyKey, T[]> {
    const result: Record<PropertyKey, T[]> = Object.create(null);
    let index = 0;
    for (const item of iterable) {
      const key = keySelector(item, index++);
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key].push(item);
      } else {
        result[key] = [item];
      }
    }
    return result;
  };
}
