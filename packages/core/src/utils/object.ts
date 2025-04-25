/**
 * Checks if value is a dictionary like object
 * @param value unknown object
 * @returns typeguard, value is dicitonary
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

/**
 * Utility to deeply compare 2 objects
 * @param a unknown object
 * @param b unknown object
 * @returns true if both objects have the same keys and values
 */
export function deepCompare<T>(a: T, b: T): boolean {
    // Shallow compare first, just in case
    if (a === b) {
        return true;
    }

    // If not objects then compare values directly
    if (!isObject(a) || !isObject(b)) {
        return a === b;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const key of keysA) {
        if (!keysB.includes(key) || !deepCompare(a[key], b[key])) {
            return false;
        }
    }

    return true;
}
