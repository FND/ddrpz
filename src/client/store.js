let WORKER = new URL("./store_worker.js", import.meta.url);
let FIELDS = /** @type {const} */ (["url", "token", "secret"]);

let CRYPTO = globalThis.crypto;

export class Store {
	/** @type {string | null} */
	_etag = null;
	_worker = new RPCWorker(WORKER);

	/** @param {ConfigStore} config */
	constructor(config) {
		this._config = config;
	}

	/** @returns {Promise<string | null>} */
	async load() {
		let config = await this._configValues;
		try { // deno-lint-ignore no-var no-inner-declarations
			var res = await this._httpRequest("GET", null, config);
		} catch (err) {
			console.error(err);
			return null;
		}

		let buf = await res.arrayBuffer();
		if (res.status === 204 || buf.byteLength === 0) {
			return null;
		}

		return this._worker.invoke(["decrypt", buf, config.secret], [buf])
			.catch((_err) => {
				console.error("ERROR: failed to decrypt content");
				return null; // FIXME: swallows error
			});
	}

	/**
	 * @param {string} txt
	 * @returns {Promise<void>}
	 */
	async save(txt) {
		let config = await this._configValues;
		let data = await this._worker.invoke(["encrypt", txt, config.secret]);
		await this._httpRequest("PUT", data, config);
	}

	/** @returns {Promise<boolean>} indicates whether local state is still up to date */
	async probe() {
		let config = await this._configValues;
		let etag = this._etag;
		await this._httpRequest("HEAD", null, config);
		return this._etag === etag;
	}

	/**
	 * @param {"HEAD" | "GET" | "PUT"} method
	 * @param {RequestInit["body"]} body
	 * @param {ConfigValues} config
	 * @returns {Promise<Response>}
	 */
	async _httpRequest(method, body, config) {
		/** @type {Record<string, string>} */
		let headers = {
			Authorization: "Bearer " + config.token,
		};
		let etag = this._etag;
		if (method === "PUT") {
			if (etag) {
				headers["If-Match"] = etag;
			} else {
				headers["If-None-Match"] = "*";
			}
		} else if (etag) {
			headers["If-None-Match"] = etag;
		}

		let res = await fetch(config.url, { method, headers, body });
		if (!res.ok && res.status !== 304) {
			throw new Error(`unexpected HTTP ${res.status} response at ${config.url}`);
		}

		etag = res.headers.get("ETag");
		if (etag) {
			this._etag = etag;
		}
		return res;
	}

	/** @returns {Promise<ConfigValues>} */
	get _configValues() {
		let res = /** @type {ConfigValues} */ ({});
		let cfg = this._config;
		let ops = FIELDS.map(async (field) => {
			let value = await cfg.get(field);
			if (value === null) {
				throw new Error(`invalid configuration: missing \`${field}\` value`);
			}
			res[field] = value;
		});
		return Promise.all(ops)
			.then(() => res);
	}
}

class RPCWorker {
	timeout = 1000;

	/** @param {URL} url */
	constructor(url) {
		this.url = url;
	}

	/**
	 * @overload
	 * @param {EncryptCommand} message
	 * @returns {Promise<EncryptionResult>}
	 */
	/**
	 * @overload
	 * @param {DecryptCommand} message
	 * @param {Transferable[]} transfer
	 * @returns {Promise<DecryptionResult>}
	 */
	/**
	 * @param {EncryptCommand | DecryptCommand} message
	 * @param {Transferable[]} [transfer]
	 * @returns {Promise<EncryptionResult | DecryptionResult>}
	 */
	invoke(message, transfer) {
		let worker = this._worker;
		let { promise, resolve, reject } = Promise.withResolvers();
		// request-response correlation (cf. `onMessage` conversion)
		let id = CRYPTO.randomUUID();
		worker.addEventListener(id, (ev) => {
			resolve(/** @type {CustomEvent} */ (ev).detail);
			clearTimeout(timer);
		}, { once: true });

		worker.postMessage([id, ...message], /** @type {Transfer} */ (transfer));

		let timer = setTimeout(() => { // NB: races against event listener above
			reject(new Error("timeout while processing worker command"));
			this.terminate();
		}, this.timeout);
		return promise;
	}

	terminate() {
		this._worker.terminate();
		delete /** @type {any} */ (this)._worker; // resets memoization
	}

	/** @returns {Worker} */
	get _worker() {
		let { url } = this;
		let worker = new Worker(url, {
			type: "module",
			name: url.href,
		});
		worker.addEventListener("message", onMessage);

		// memoization via instance property, taking precedence over prototype
		Object.defineProperty(this, "_worker", {
			value: worker,
			configurable: true, // enables reset
		});
		return worker;
	}
}

/**
 * @this {Worker}
 * @param {MessageEvent} ev
 */
function onMessage(ev) {
	let [id, detail] = ev.data;
	this.dispatchEvent(new CustomEvent(id, { detail }));
}

/**
 * @import { EncryptCommand, EncryptionResult, DecryptCommand, DecryptionResult } from "./store_worker.js"
 * @typedef {{ url: string, token: string, secret: string }} ConfigValues
 * @typedef {{ get: (field: Field) => Promise<string>}} ConfigStore
 * @typedef {FIELDS[number]} Field
 * @typedef {WindowPostMessageOptions} Transfer -- XXX: workaround
 */
