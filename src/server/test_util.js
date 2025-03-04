// deno-fmt-ignore
export let SAMPLE_DATA = new Uint8Array([
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41,
	43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
]);
// deno-fmt-ignore
export let SAMPLE_HASH = "26189d3c21eee5c926852f0a5f2ffd64f4be0140eafc01772636ef16d69e6e43";

/** @param {number} delay */
export function wait(delay) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(null);
		}, delay);
	});
}
