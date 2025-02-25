let BLANK = Symbol("blank");
let THRESHOLD = Number.MAX_SAFE_INTEGER - 1;

/**
 * @template K
 * @template V
 */
export class LRUCache extends Map {
	limit = 5; // XXX: arbitrary
	/** @type {Map<K, number>} */
	_access = new Map();
	_next = 0;

	/**
	 * @override
	 * @param {K} key
	 */
	get(key) {
		if (this.has(key)) {
			this._inc(key);
		}
		return super.get(key);
	}

	/**
	 * @override
	 * @param {K} key
	 * @param {V} value
	 */
	set(key, value) {
		if (this.size === this.limit && !this.has(key)) {
			/** @type {BLANK | number} */
			let min = BLANK;
			let res;
			for (let [key, index] of this._access) {
				if (min === BLANK || index < /** @type {number} */ (min)) {
					min = index;
					res = key;
				}
			}
			this.delete(res);
			this._access.delete(/** @type {K} */ (res));
		}
		this._inc(key);
		return super.set(key, value);
	}

	/** @param {K} key */
	_inc(key) {
		let acc = this._access;
		let i = this._next++;
		acc.set(key, i);
		if (i === THRESHOLD) { // rewrite indexes
			let entries = [...acc].sort((a, b) => a[1] - b[1]);
			for (let i = 0; i < entries.length; i++) {
				let [key] = entries[i];
				acc.set(key, i);
			}
			this._next = acc.size;
		}
	}
}
