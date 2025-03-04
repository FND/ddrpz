import { Store } from "./store.js";
import { encrypt } from "./crypto.js";
import { describe, it } from "@std/testing/bdd";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
} from "@std/assert";

let SAMPLE = "lörεm ipsüm dølœr\nßit ämзt";
let CONFIG = {
	url: `https://example.org/${globalThis.crypto.randomUUID()}`,
	token: `b00k1t ${globalThis.crypto.randomUUID()}`,
	secret: `s33kr1t ${globalThis.crypto.randomUUID()}`,
};

describe("store adaptor", () => {
	/** @type {MockStore} */
	let store;

	it("retrieves and decrypts remote data", async () => {
		store = new MockStore();
		let data = await encrypt(SAMPLE, CONFIG.secret);
		store.nextResponse = new Response(data, {
			headers: {
				ETag: "v1",
			},
		});

		let txt = await store.load();
		assertSame(txt, SAMPLE);
		assertDeep(store.requests, [{
			method: "GET",
			url: CONFIG.url,
			headers: {
				Authorization: "Bearer " + CONFIG.token,
			},
			body: null,
		}]);
		assertSame(store._etag, "v1");
	});

	it("handles blank responses upon retrieval", async () => {
		store.nextResponse = new Response(null, {
			status: 204,
			headers: {
				ETag: "v1.1",
			},
		});

		let txt = await store.load();
		assertSame(txt, null);
		assertSame(store._etag, "v1.1");
	});

	it("handles unexpected responses upon retrieval", async () => {
		store.nextResponse = new Response("unexpected error", {
			status: 500,
		});

		let txt = await store.load();
		assertSame(txt, null);
		assertSame(store._etag, "v1.1");
	});

	it("submits encrypted data", async () => {
		store.nextResponse = new Response(null, {
			headers: {
				ETag: "v2",
			},
		});

		let txt = "hello world";
		await store.save(txt);
		let { requests } = store;
		let req = /** @type {Request} */ (requests.at(-1));
		assertSame(requests.length, 4);
		assertDeep({
			...req,
			body: null, // NB: must not compare encrypted bytes
		}, {
			method: "PUT",
			url: CONFIG.url,
			headers: {
				Authorization: "Bearer " + CONFIG.token,
				"If-Match": "v1.1",
			},
			body: null,
		});
		assertSame(store._etag, "v2");
	});

	it("supports caching for subsequent requests", async () => {
		let sample = SAMPLE.split("").toReversed().join("");
		let data = await encrypt(sample, CONFIG.secret);
		store.nextResponse = new Response(data, {
			headers: {
				ETag: "v3",
			},
		});

		let txt = await store.load();
		let { requests } = store;
		let prev = requests[0];
		let { headers } = prev;
		assertSame(txt, sample);
		assertSame(requests.length, 5);
		assertDeep(requests.at(-1), {
			...prev,
			headers: {
				...headers,
				"If-None-Match": "v2",
			},
		});
		assertSame(store._etag, "v3");
	});

	it("supports clobbering protection", async () => {
		store.nextResponse = new Response(null, {
			headers: {
				ETag: "v4",
			},
		});
		store._etag = null;

		await store.save(SAMPLE);
		let { requests } = store;
		let req = requests.at(-1);
		assertSame(requests.length, 6);
		assertDeep({
			...req,
			body: null, // NB: must not compare encrypted bytes
		}, {
			method: "PUT",
			url: CONFIG.url,
			headers: {
				Authorization: "Bearer " + CONFIG.token,
				"If-None-Match": "*",
			},
			body: null,
		});
		assertSame(store._etag, "v4");
	});

	it("supports probing for remote updates", async () => {
		store.nextResponse = new Response(null, {
			headers: {
				ETag: "v4",
			},
		});

		let res = await store.probe();
		let { requests } = store;
		assertSame(res, true);
		assertSame(requests.length, 7);
		assertDeep(requests.at(-1), {
			method: "HEAD",
			url: CONFIG.url,
			headers: {
				Authorization: "Bearer " + CONFIG.token,
				"If-None-Match": "v4",
			},
			body: null,
		});
		assertSame(store._etag, "v4");

		store.nextResponse = new Response(null, {
			headers: {
				ETag: "v13",
			},
		});

		res = await store.probe();
		assertSame(res, false);
		assertSame(requests.length, 8);
		assertDeep(requests.at(-1), {
			method: "HEAD",
			url: CONFIG.url,
			headers: {
				Authorization: "Bearer " + CONFIG.token,
				"If-None-Match": "v4",
			},
			body: null,
		});
		assertSame(store._etag, "v13");
	});
});

class MockStore extends Store {
	/** @type {MockRequest[]} */
	requests = [];
	/** @type {Response | null} */
	nextResponse = null;

	constructor() {
		let cfg = /** @type {ConfigStore} */ ({
			/** @param {"url" | "token" | "secret"} field */
			get(field) {
				return Promise.resolve(CONFIG[field]);
			},
		});
		super(cfg);
	}

	/**
	 * @override
	 * @param {Parameters<Store["_httpRequest"]>} args
	 */
	_httpRequest(...args) {
		let { fetch } = globalThis;
		globalThis.fetch = (url, options) => {
			this.requests.push(/** @type {any} */ ({ ...options, url }));
			let res = this.nextResponse;
			this.nextResponse = null;
			return Promise.resolve(res ?? new Response(null, { status: 404 }));
		};
		let res = super._httpRequest(...args);
		globalThis.fetch = fetch;
		return Promise.resolve(res);
	}
}

/**
 * @import { ConfigStore } from "./store.js"
 * @typedef {Partial<_Request & { headers: _Headers }>} MockRequest
 * @typedef {Headers | Record<string, string>} _Headers
 * @typedef {Omit<Request, "headers">} _Request
 */
