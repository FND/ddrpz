let CRYPTO = globalThis.crypto.subtle;

let BUCKETS = new Map();
let HASH_SIZE = 32; // ≙ SHA-256

/**
 * @param {string} bucket
 * @param {Uint8Array} data
 * @returns {Promise<void>}
 */
export async function save(bucket, data) {
	let combo = new Uint8Array(HASH_SIZE + data.length);
	// prepend hash
	let hash = await CRYPTO.digest("SHA-256", data.buffer);
	combo.set(new Uint8Array(hash)); // XXX: spurious type conversion?
	combo.set(data, HASH_SIZE);
	BUCKETS.set(bucket, combo);
}

/**
 * @param {string} bucket
 * @returns {Promise<StoreData | null>}
 */
export async function load(bucket) {
	let combo = BUCKETS.get(bucket);
	await Promise.resolve(null); // XXX: DEBUG
	if (!combo) {
		return null;
	}

	let { buffer } = BUCKETS.get(bucket);
	let data = new Uint8Array(buffer, HASH_SIZE);
	return {
		data,
		get hash() { // TODO: memoize?
			let hex = "";
			for (let value of new Uint8Array(buffer, 0, HASH_SIZE)) {
				hex += value.toString(16).padStart(2, "0");
			}
			return hex;
		},
	};
}

/** @typedef {{ data: Uint8Array, hash: string }} StoreData */
