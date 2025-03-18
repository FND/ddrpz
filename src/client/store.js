import { RequestQueue } from "./request_queue.js";

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
		/** @type {RequestQueue<RequestParameters>} */
		this._queue = new RequestQueue(this._httpRequest.bind(this));
	}

	/** @returns {Promise<string | null>} */
	async load() {
		let config = await this._configValues;
		try { // deno-lint-ignore no-var no-inner-declarations
			var res = await this._queue.schedule({ method: "GET", body: null, config });
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
		await this._queue.schedule({ method: "PUT", body: data, config });
	}

	/** @returns {Promise<boolean>} indicates whether local state is still up to date */
	async probe() {
		let config = await this._configValues;
		let etag = this._etag;
		await this._queue.schedule({ method: "HEAD", body: null, config });
		return this._etag === etag;
	}

	/**
	 * @param {RequestParameters} params
	 * @returns {Promise<Response>}
	 */
	async _httpRequest({ method, body, config }) {
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

		let signal = AbortSignal.timeout(5000); // XXX: arbitrary
		let res = await fetch(config.url, { method, headers, body, signal });
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
	timeout = 1000; // XXX: arbitrary

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
 * @import { ConfigStore } from "./config_store.js"
 * @import { EncryptCommand, EncryptionResult, DecryptCommand, DecryptionResult } from "./store_worker.js"
 * @typedef {{ url: string, token: string, secret: string }} ConfigValues
 * @typedef {{
 *     method: "HEAD" | "GET" | "PUT",
 *     body: RequestInit["body"],
 *     config: ConfigValues
 * }} RequestParameters
 * @typedef {WindowPostMessageOptions} Transfer -- XXX: workaround
 */
