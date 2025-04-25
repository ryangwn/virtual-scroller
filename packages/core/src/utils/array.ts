/**
 * Returns the first element of an array, or undefined if the array is empty or not an array
 * @template T The type of elements in the array
 * @param {T[] | null | undefined} arr - The array to get the first element from
 * @returns {T | undefined} The first element or undefined
 */
export const first = <T>(arr?: T[] | null): T | undefined => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
        return undefined;
    }
    return arr[0];
};

/**
 * Returns the last element of an array, or undefined if the array is empty or not an array
 * @template T The type of elements in the array
 * @param {T[] | null | undefined} arr - The array to get the last element from
 * @returns {T | undefined} The last element or undefined
 */
export const last = <T>(arr?: T[] | null): T | undefined => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
        return undefined;
    }
    return arr[arr.length - 1];
};

/**
 * Maps an array using the provided function and filters out undefined results
 * @template T The type of elements in the input array
 * @template U The type of elements in the output array
 * @param {T[] | null | undefined} arr - The array to map and filter
 * @param {(item: T, index: number) => U | undefined} fn - The mapping function
 * @returns {U[]} A new array with mapped and filtered values
 */
export const filterMap = <T, U>(arr: T[] | null | undefined, fn: (item: T, index: number) => U | undefined): U[] => {
    if (!arr || !Array.isArray(arr)) {
        return [];
    }

    const result: U[] = [];

    for (let i = 0; i < arr.length; i++) {
        const mapped = fn(arr[i], i);
        if (mapped !== undefined) {
            result.push(mapped);
        }
    }

    return result;
};
