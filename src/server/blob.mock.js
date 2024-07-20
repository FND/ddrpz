let STORE = new Map();

export let blob = {
	/**
	 * @param {string} key
	 * @returns {Promise<Response>}
	 */
	async get(key) {
		await wait(10);
		let value = STORE.get(key);
		if (!value) {
			throw new Error(`no such blob: \`${key}\``);
		}

		return new Response(value);
	},
	/**
	 * @param {string} key
	 * @param {BodyInit} value
	 * @returns {Promise<void>}
	 */
	async set(key, value) {
		await wait(10);
		STORE.set(key, value);
	},
};

/** @param {number} delay */
function wait(delay) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(null);
		}, delay);
	});
}
