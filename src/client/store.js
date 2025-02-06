let WORKER = new URL("./store_worker.js", import.meta.url);
let FIELDS = /** @type {const} */ (["url", "token", "secret"]);

let CRYPTO = globalThis.crypto;

export class Store {
	timeout = 1000;
	/** @type {string | null} */
	_etag = null;
	/** @type {Worker | null} */
	__worker = null;

	/** @param {ConfigStore} config */
	constructor(config) {
		this._config = config;
	}

	/** @returns {Promise<string>} */
	async load() {
		let config = await this._configValues;
		let res = await this._httpRequest("GET", null, config);
		return this._invoke("decrypt", await res.arrayBuffer(), config.secret);
	}

	/**
	 * @param {string} txt
	 * @returns {Promise<void>}
	 */
	async save(txt) {
		let config = await this._configValues;
		let data = await this._invoke("encrypt", txt, config.secret);
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
	 * @param {Uint8Array | null} body
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
		if (!res.ok) {
			throw new Error(`unexpected HTTP ${res.status} response at ${config.url}`);
		}

		etag = res.headers.get("ETag");
		if (etag) {
			this._etag = etag;
		}
		return res;
	}

	/**
	 * @overload
	 * @param {"encrypt"} cmd
	 * @param {string} payload
	 * @param {string} secret
	 * @returns {Promise<Uint8Array>}
	 */
	/**
	 * @overload
	 * @param {"decrypt"} cmd
	 * @param {ArrayBuffer} payload
	 * @param {string} secret
	 * @returns {Promise<string>}
	 */
	/**
	 * @param {"encrypt" | "decrypt"} cmd
	 * @param {string | ArrayBuffer} payload
	 * @param {string} secret
	 * @returns {Promise<Uint8Array | string>}
	 */
	_invoke(cmd, payload, secret) {
		let worker = this._worker;
		let { promise, resolve, reject } = Promise.withResolvers();
		let id = CRYPTO.randomUUID();
		worker.addEventListener(id, (ev) => {
			resolve(/** @type {any} */ (ev).detail);
			clearTimeout(timer);
		}, { once: true });

		let msg = [cmd, id, secret, payload];
		if (cmd === "decrypt") {
			worker.postMessage(msg, [payload]);
		} else {
			worker.postMessage(msg);
		}

		let timer = setTimeout(() => {
			reject(new Error("timeout"));
			worker.terminate();
			this.__worker = null;
		}, this.timeout);
		return promise;
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

	get _worker() {
		let worker = this.__worker;
		if (!worker) {
			worker = this.__worker = new Worker(WORKER, {
				type: "module",
				name: "ddrpz-crpyto",
			});
			worker.addEventListener("message", onMessage);
		}
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
 * @typedef {{ url: string, token: string, secret: string }} ConfigValues
 */
