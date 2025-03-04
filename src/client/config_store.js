let PREFIX = "ddrpz";
let FIELDS = /** @type {const} */ (["url", "token", "secret"]);

const BLANK = Symbol("blank");

export class ConfigStore extends EventTarget {
	static fields = FIELDS;

	/** @param {string} prefix */
	constructor(prefix) {
		super();
		this._prefix = PREFIX + ":" + prefix;
		this._data = FIELDS.reduce((memo, field) => {
			memo[field] = localStorage.getItem(this._key(field)) ?? BLANK;
			return memo;
		}, /** @type {Record<Field, Value>} */ ({}));
		this.validate();
	}

	// NB: enforcing async storage to be future-proof

	/** @returns {Promise<void>} */
	validate() {
		/** @type {Field[]} */
		let errors = [];
		/** @type {"ready" | "incomplete"} */
		let status = "ready";
		for (let field of FIELDS) {
			let value = this._data[field];
			if (value === BLANK) {
				errors.push(field);
				status = "incomplete";
			}
		}
		this.dispatchEvent(new CustomEvent(status));
		return Promise.resolve();
	}

	/**
	 * @param {Field} field
	 * @returns {Promise<string | null>}
	 */
	get(field) {
		let res = this._data[field];
		return Promise.resolve(res === BLANK ? null : res);
	}

	/**
	 * @param {Field} field
	 * @param {string | null} value
	 * @param {boolean} persist
	 * @returns {Promise<void>}
	 */
	set(field, value, persist = true) {
		if (persist) {
			let key = this._key(field);
			if (value === null) {
				localStorage.removeItem(key);
			} else {
				localStorage.setItem(key, value);
			}
		}
		this._data[field] = value ?? BLANK;
		return Promise.resolve();
	}

	/**
	 * @param {Field} field
	 * @returns {string}
	 */
	_key(field) {
		if (!FIELDS.includes(field)) {
			throw new Error(`invalid configuration setting \`${field}\``);
		}
		return this._prefix + ":" + field;
	}
}

/**
 * @typedef {FIELDS[number]} Field
 * @typedef {string | BLANK} Value
 */
