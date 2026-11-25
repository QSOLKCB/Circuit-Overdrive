// SPDX-License-Identifier: Apache-2.0
// Small data-only admission helpers shared by the garage registry and catalogue.
// Copy descriptor values, never execute a caller's getters, iterators or toJSON.
export function garageRecord(value, keys, label) {
  if (!value || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw TypeError(label + ' must be a plain record');
  }
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) {
    throw TypeError(label + ' has missing or unexpected fields');
  }
  const copy = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw TypeError(label + ' requires enumerable data fields');
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

export function garageArray(value, min, max, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw TypeError(label + ' must be an ordinary dense array');
  }
  const size = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (size < min || size > max || Reflect.ownKeys(value).length !== size + 1) {
    throw RangeError(label + ' has invalid size or extra fields');
  }
  const copy = [];
  for (let i = 0; i < size; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw TypeError(label + ' has a hole, accessor or hidden entry');
    }
    copy.push(descriptor.value);
  }
  return copy;
}

export function garageInteger(value, min, max, label) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) {
    throw RangeError(label + ' must be an integer from ' + min + ' to ' + max);
  }
  return value;
}
