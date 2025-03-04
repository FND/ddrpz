import { ConfigStore } from "./config_store.js";
import { wait } from "../server/test_util.js"; // XXX: hacky
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
	assertThrows,
} from "@std/assert";

describe("configuration store", () => {
	let original = globalThis.localStorage;
	/** @type {MockStorage} */
	let mock;
	beforeEach(() => {
		mock = new MockStorage();
		Object.defineProperty(globalThis, "localStorage", {
			value: mock,
			writable: true,
		});
	});
	afterEach(() => {
		globalThis.localStorage = original;
	});

	it("stores known configuration settings", async () => {
		let { fields } = ConfigStore;
		assertDeep(fields, ["url", "token", "secret"]);

		let cfg = new ConfigStore(globalThis.crypto.randomUUID());
		assertSame(mock.length, 0);
		assertThrows(
			// @ts-expect-error TS2345
			() => cfg.get("dummy"),
			Error,
			"invalid configuration setting `dummy`",
		);
		assertThrows(
			// @ts-expect-error TS2345
			() => cfg.set("dummy", "…"),
			Error,
			"invalid configuration setting `dummy`",
		);

		let i = 0;
		for (let field of fields) {
			let value = cfg.get(field);
			let ctx = `field \`${field}\``;
			assertSame(typeof value.then, "function", ctx);
			assertSame(await value, null, ctx);

			let newValue = globalThis.crypto.randomUUID();
			let res = cfg.set(field, newValue);
			assertSame(typeof res.then, "function", ctx);
			assertSame(await res, undefined, ctx);
			assertSame(mock.length, ++i);
			assertSame(await cfg.get(field), newValue, ctx);
		}
		assertSame(mock.length, fields.length);
	});

	it("allows circumventing persistence", async () => {
		let ctx = globalThis.crypto.randomUUID();
		let cfg = new ConfigStore(ctx);
		let log = [
			`GET ddrpz:${ctx}:url`,
			`GET ddrpz:${ctx}:token`,
			`GET ddrpz:${ctx}:secret`,
		];
		assertDeep(mock.log, log);
		assertSame(mock.length, 0);

		let value = "abc123";
		await cfg.set("token", value);
		log.push(`SET ddrpz:${ctx}:token → ${value}`);
		assertDeep(mock.log, log);
		assertSame(mock.length, 1);

		value = "def456";
		await cfg.set("token", value, false);
		log.push(`DEL ddrpz:${ctx}:token`);
		assertDeep(mock.log, log);
		assertSame(mock.length, 0);

		value = "ghi789";
		await cfg.set("token", value, false);
		log.push(`DEL ddrpz:${ctx}:token`);
		assertDeep(mock.log, log);
		assertSame(mock.length, 0);
	});

	it("emits notifications for state changes", async () => {
		let cfg = new ConfigStore(globalThis.crypto.randomUUID());
		/** @type {string[]} */
		let log = [];
		/** @type {(ev: Event) => void} */
		let handler = (ev) => {
			// @ts-expect-error TS2339
			let payload = ev.detail;
			let suffix = payload ? ` ${payload}` : "";
			log.push(`[${ev.type}]${suffix}`);
		};
		cfg.addEventListener("ready", handler);
		cfg.addEventListener("incomplete", handler);
		assertDeep(log, []);

		await wait(1);
		let incomplete = "[incomplete]";
		assertDeep(log, [incomplete]);

		await cfg.set("url", "https://example.org");
		assertDeep(log, [incomplete, incomplete]);

		await cfg.set("token", "abc123");
		assertDeep(log, [incomplete, incomplete, incomplete]);

		await cfg.set("secret", "s33kr1t");
		assertDeep(log, [incomplete, incomplete, incomplete, "[ready]"]);
	});

	it("avoids conflicts by prefixing storage fields with context", () => {
		let ctx = globalThis.crypto.randomUUID();
		new ConfigStore(ctx);
		assertDeep(mock.log, [
			`GET ddrpz:${ctx}:url`,
			`GET ddrpz:${ctx}:token`,
			`GET ddrpz:${ctx}:secret`,
		]);
	});
});

class MockStorage {
	_data = new Map();
	/** @type {string[]} */
	log = [];

	/**
	 * @param {string} key
	 * @returns {string}
	 */
	getItem(key) {
		this.log.push(`GET ${key}`);
		return this._data.get(key);
	}

	/**
	 * @param {string} key
	 * @param {string} value
	 */
	setItem(key, value) {
		this.log.push(`SET ${key} → ${value}`);
		this._data.set(key, value);
	}

	/** @param {string} key */
	removeItem(key) {
		this.log.push(`DEL ${key}`);
		this._data.delete(key);
	}

	get length() {
		return this._data.size;
	}
}
