/**
 * Checks if a value is a valid number
 *
 * @param value - The value to check
 * @returns True if the value is a finite number, false otherwise
 *
 * This function handles:
 * - Actual numbers (returns true)
 * - NaN (returns false)
 * - Infinity/-Infinity (returns false)
 * - null/undefined (returns false)
 * - Strings, objects, etc. (returns false)
 */
export const isNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};
