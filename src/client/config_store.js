let PREFIX = "ddrpz";
let FIELDS = /** @type {const} */ (["url", "token", "secret"]);

const BLANK = Symbol("blank");

export class ConfigStore extends EventTarget {
	static fields = FIELDS;

	/** @param {string} context */
	constructor(context) {
		super();
		this._prefix = PREFIX + ":" + context;
		this._data = FIELDS.reduce((memo, field) => {
			memo.set(field, localStorage.getItem(this._key(field)) ?? BLANK);
			return memo;
		}, /** @type {Map<Field, Value>} */ (new Map()));

		// allow registering event handlers before triggering validation
		Promise.resolve(null)
			.then(this.validate.bind(this));
	}

	// NB: enforcing async storage to be future-proof

	/** @returns {Promise<void>} */
	validate() {
		/** @type {Field[]} */
		let errors = [];
		/** @type {"ready" | "incomplete"} */
		let status = "ready";
		for (let field of FIELDS) {
			let value = this._data.get(field);
			if (value === BLANK) {
				errors.push(field);
				status = "incomplete";
			}
		}
		this.dispatchEvent(new Event(status));
		return Promise.resolve();
	}

	/**
	 * @param {Field} field
	 * @returns {Promise<string | null>}
	 */
	get(field) {
		this._key(field);
		let res = this._data.get(field) ?? null;
		return Promise.resolve(res === BLANK ? null : res);
	}

	/**
	 * @param {Field} field
	 * @param {string | null} value
	 * @param {boolean} persist
	 * @returns {Promise<void>}
	 */
	set(field, value, persist = true) {
		let key = this._key(field);
		if (persist) {
			if (value === null) {
				localStorage.removeItem(key);
			} else {
				localStorage.setItem(key, value);
			}
		} else {
			localStorage.removeItem(key);
		}
		this._data.set(field, value ?? BLANK);
		this.validate();
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
