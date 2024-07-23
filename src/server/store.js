import { blob } from "$valtown/blob";

let CRYPTO = globalThis.crypto.subtle;

let HASH_SIZE = 32; // ≙ SHA-256

/**
 * @param {string} bucket
 * @param {Uint8Array} data
 * @returns {Promise<string>}
 */
export async function save(bucket, data) {
	let buf = new Uint8Array(HASH_SIZE + data.length);
	// prepend hash
	let hash = await CRYPTO.digest("SHA-256", data);
	buf.set(new Uint8Array(hash));
	buf.set(data, HASH_SIZE);
	await blob.set(bucket, buf);
	return hex(new Uint8Array(hash));
}

/**
 * @param {string} bucket
 * @returns {Promise<StoreData | null>}
 */
export async function load(bucket) {
	let res;
	try {
		res = await blob.get(bucket); // deno-lint-ignore no-empty
	} catch (_err) {}
	if (!res) {
		return null;
	}

	let buffer = await res.arrayBuffer();
	let data = new Uint8Array(buffer, HASH_SIZE);
	return {
		data,
		get hash() {
			let value = hex(new Uint8Array(buffer, 0, HASH_SIZE));
			Object.defineProperty(this, "hash", { // memoization
				value,
				writable: false,
			});
			return value;
		},
	};
}

/** @param {Uint8Array} data */
function hex(data) {
	let res = "";
	for (let value of data) {
		res += value.toString(16).padStart(2, "0");
	}
	return res;
}

/** @typedef {{ data: Uint8Array, hash: string }} StoreData */
