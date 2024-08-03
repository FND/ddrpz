import requestHandler, { BUCKET_PREFIX, CORS_PREFIX } from "./http.js";
import { load, save } from "./store.js";
import { SAMPLE_DATA, SAMPLE_HASH } from "./test_util.js";
import { afterEach, beforeEach, describe, it } from "$deno/testing/bdd.ts";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
} from "$deno/assert/mod.ts";

let ENV = Deno.env;

let HOST = "https://example.org";
let ORIGIN = "https://myapp.example.com";

describe("HTTP data retrieval", () => {
	beforeEach(verifyEnvironment);
	afterEach(resetEnvironment);

	it("succeeds with valid credentials", async () => {
		for (let method of ["HEAD", "GET"]) {
			for (let cors of [false, true]) {
				let context = `HTTP ${method} (${cors ? "with" : "without"} CORS)`;
				let { app, bucket, headers } = establishBucket();
				let url = `${HOST}/${app}`;
				if (cors) {
					ENV.set(CORS_PREFIX + app, ORIGIN);
				} else {
					ENV.delete(CORS_PREFIX + app);
				}

				let req = new Request(url, { method, headers });
				let res = await requestHandler(req);

				assertSame(res.status, 204, context);
				assertSame(res.body, null, context);
				assertSame(res.headers.get("ETag"), null, context);
				assertSame(
					res.headers.get("Access-Control-Allow-Origin"),
					cors ? ORIGIN : null,
					context,
				);

				await save(bucket, SAMPLE_DATA);

				req = new Request(url, { method, headers });
				res = await requestHandler(req);
				let body = new Uint8Array(await res.arrayBuffer());

				assertSame(res.status, 200, context);
				if (method === "HEAD") {
					assertSame(body.length, 0);
				} else {
					assertSame(body.length, 25);
					assertDeep(body, SAMPLE_DATA);
				}
				assertSame(res.headers.get("ETag"), `"${SAMPLE_HASH}"`, context);
				assertSame(
					res.headers.get("Access-Control-Allow-Origin"),
					cors ? ORIGIN : null,
					context,
				);
				assertSame(res.headers.get("Access-Control-Expose-Headers"), "ETag");
			}
		}
	});

	it("supports caching", async () => {
		let { app, bucket, headers } = establishBucket();
		let url = `${HOST}/${app}`;
		await save(bucket, SAMPLE_DATA);

		let req = new Request(url, {
			method: "GET",
			headers,
		});
		let res = await requestHandler(req);
		let body = new Uint8Array(await res.arrayBuffer());

		assertSame(res.status, 200);
		assertSame(res.headers.get("ETag"), `"${SAMPLE_HASH}"`);
		assertSame(res.headers.get("Access-Control-Expose-Headers"), "ETag");
		assertSame(body.length, 25);
		assertDeep(body, SAMPLE_DATA);

		req = new Request(url, {
			method: "GET",
			headers: {
				...headers,
				"If-None-Match": `"${SAMPLE_HASH}"`,
			},
		});
		res = await requestHandler(req);

		assertSame(res.status, 304);
		assertSame(res.body, null);
	});
});

describe("HTTP data submission", () => {
	beforeEach(verifyEnvironment);
	afterEach(resetEnvironment);

	it("stores incoming data", async () => {
		let { app, bucket, headers } = establishBucket();

		let req = new Request(`${HOST}/${app}`, {
			method: "PUT",
			headers: {
				...headers,
				"If-None-Match": "*",
			},
			body: SAMPLE_DATA,
		});
		let res = await requestHandler(req);
		let data = await load(bucket);

		assertSame(res.status, 204);
		assertSame(res.headers.get("ETag"), `"${SAMPLE_HASH}"`);
		assertSame(res.headers.get("Access-Control-Expose-Headers"), "ETag");
		assertSame(data?.hash, SAMPLE_HASH);
		assertDeep(data?.data, SAMPLE_DATA);
	});

	it("enforces clobbering protection", async () => {
		let method = "PUT";
		let { app, bucket, headers } = establishBucket();
		let url = `${HOST}/${app}`;

		// unconditional request to populate bucket
		let req = new Request(url, {
			method,
			headers,
			body: SAMPLE_DATA,
		});
		let res = await requestHandler(req);
		let data = await load(bucket);

		assertSame(res.status, 428);
		assertSame(data, null);

		// properly populate bucket (create only)
		req = new Request(url, {
			method,
			headers: {
				...headers,
				"If-None-Match": "*",
			},
			body: SAMPLE_DATA,
		});
		res = await requestHandler(req);
		data = await load(bucket);

		assertSame(res.status, 204);
		assertSame(res.headers.get("ETag"), `"${SAMPLE_HASH}"`);
		assertSame(res.headers.get("Access-Control-Expose-Headers"), "ETag");
		assertDeep(data?.data, SAMPLE_DATA);

		// unconditional request to update existing data
		let body = globalThis.crypto.getRandomValues(new Uint8Array(16));
		req = new Request(url, {
			method,
			headers,
			body,
		});
		res = await requestHandler(req);
		data = await load(bucket);

		assertSame(res.status, 428);
		assertDeep(data?.data, SAMPLE_DATA);

		// properly update existing data
		req = new Request(url, {
			method,
			headers: {
				...headers,
				"If-Match": `"${SAMPLE_HASH}"`,
			},
			body,
		});
		res = await requestHandler(req);
		data = await load(bucket);

		assertSame(res.status, 204);
		assertSame(res.headers.get("ETag"), `"${data?.hash}"`);
		assertSame(res.headers.get("Access-Control-Expose-Headers"), "ETag");
		assertDeep(data?.data, body);

		// request to update bucket with stale ETag
		req = new Request(url, {
			method,
			headers: {
				...headers,
				"If-Match": `"${SAMPLE_HASH}"`,
			},
			body: globalThis.crypto.getRandomValues(new Uint8Array(32)),
		});
		res = await requestHandler(req);
		data = await load(bucket);

		assertSame(res.status, 412);
		assertDeep(data?.data, body);

		// request to update bucket with nonsensical conditions
		req = new Request(url, {
			method,
			headers: {
				...headers,
				"If-Match": `"${SAMPLE_HASH}"`,
				"If-None-Match": "*",
			},
			body: globalThis.crypto.getRandomValues(new Uint8Array(64)),
		});
		res = await requestHandler(req);
		data = await load(bucket);

		assertSame(res.status, 400);
		assertDeep(data?.data, body);

		// request to populate bucket with nonsensical conditions
		let newApp = "yourapp";
		let { bucket: newBucket, headers: newHeaders } = establishBucket(newApp);
		let newURL = `${HOST}/${newApp}`;
		req = new Request(newURL, {
			method,
			headers: {
				...newHeaders,
				"If-Match": `"${SAMPLE_HASH}"`,
				"If-None-Match": "*",
			},
			body: globalThis.crypto.getRandomValues(new Uint8Array(64)),
		});
		res = await requestHandler(req);

		assertSame(res.status, 400);
		assertSame(await load(newBucket), null);

		// request to populate bucket with invalid condition
		req = new Request(newURL, {
			method,
			headers: {
				...newHeaders,
				"If-None-Match": `"${SAMPLE_HASH}"`,
			},
			body: globalThis.crypto.getRandomValues(new Uint8Array(64)),
		});
		res = await requestHandler(req);

		assertSame(res.status, 400);
		assertSame(await load(newBucket), null);
	});

	it("rejects incoming data without valid bucket credentials", async () => {
		let method = "PUT";
		let body = globalThis.crypto.getRandomValues(new Uint8Array(32));
		let url = `${HOST}/myapp`;

		let req = new Request(url, { method, body });
		let res = await requestHandler(req);

		assertSame(res.status, 404);

		let { bucket, headers } = establishBucket();
		req = new Request(url, {
			method,
			body,
			headers: {
				Authorization: headers.Authorization + "xxx",
			},
		});
		res = await requestHandler(req);

		assertSame(res.status, 403);
		assertSame(await load(bucket), null);
	});
});

describe("HTTP basics", () => {
	beforeEach(verifyEnvironment);
	afterEach(resetEnvironment);

	let supportedMethods = ["OPTIONS", "HEAD", "GET", "PUT"];

	it("supports CORS preflight", async () => {
		let origin = "https://static.example.org";
		let options = {
			method: "OPTIONS",
			headers: {
				Origin: origin,
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "Authorization",
			},
		};
		let url = `${HOST}/myapp`;

		let req = new Request(url, options);
		let res = await requestHandler(req);

		assertSame(res.status, 404);
		assertSame(res.headers.get("Access-Control-Allow-Origin"), null);
		assertSame(res.headers.get("Access-Control-Allow-Methods"), null);
		assertSame(res.headers.get("Access-Control-Allow-Headers"), null);

		ENV.set(CORS_PREFIX + "myapp", origin);
		req = new Request(url, options);
		res = await requestHandler(req);

		assertSame(res.status, 204);
		assertSame(res.headers.get("Access-Control-Allow-Origin"), origin);
		// deno-fmt-ignore
		assertSame(res.headers.get("Access-Control-Allow-Methods"), supportedMethods.join(", "));
		// deno-fmt-ignore
		assertSame(res.headers.get("Access-Control-Allow-Headers"), "Authorization, If-Match, If-None-Match");

		req = new Request(url, {
			...options,
			headers: {
				...options.headers,
				Origin: "https://example.com",
			},
		});
		res = await requestHandler(req);

		assertSame(res.status, 404);
		assertSame(res.headers.get("Access-Control-Allow-Origin"), null);
		assertSame(res.headers.get("Access-Control-Allow-Methods"), null);
		assertSame(res.headers.get("Access-Control-Allow-Headers"), null);

		req = new Request(`${HOST}/yourapp`, options);
		res = await requestHandler(req);

		assertSame(res.status, 404);
		assertSame(res.headers.get("Access-Control-Allow-Origin"), null);
		assertSame(res.headers.get("Access-Control-Allow-Methods"), null);
		assertSame(res.headers.get("Access-Control-Allow-Headers"), null);
	});

	it("reports supported request methods only when authorized", async () => {
		let url = `${HOST}/myapp`;
		let req = new Request(url, { method: "OPTIONS" });
		let res = await requestHandler(req);

		assertSame(res.status, 404);
		assertSame(res.headers.get("Allow"), null);

		let { headers } = establishBucket();
		req = new Request(url, {
			method: "OPTIONS",
			headers,
		});
		res = await requestHandler(req);

		assertSame(res.status, 204);
		assertSame(res.headers.get("Allow"), supportedMethods.join(", "));
	});

	it("rejects requests without credentials", async () => {
		let url = `${HOST}/myapp`;
		for (let method of supportedMethods) {
			let req = new Request(url, { method });
			let res = await requestHandler(req);

			assertSame(res.status, 404, `HTTP ${method}`);
		}
	});

	it("rejects requests with invalid credentials", async () => {
		let url = `${HOST}/myapp`;
		for (let method of supportedMethods) {
			let context = `HTTP ${method}`;
			let req = new Request(url, {
				method,
				headers: {
					Authorization: "Basic abc123",
				},
			});
			let res = await requestHandler(req);

			assertSame(res.status, 403, context);

			let { headers } = establishBucket();
			req = new Request(url, {
				method,
				headers: {
					Authorization: headers.Authorization + "xxx",
				},
			});
			res = await requestHandler(req);

			assertSame(res.status, 403, context);
		}
	});

	it("rejects unsupported request methods", async () => {
		let { headers } = establishBucket();
		let url = `${HOST}/myapp`;
		for (let method of ["POST", "DELETE"]) {
			let req = new Request(url, {
				method,
				headers,
			});
			let res = await requestHandler(req);

			assertSame(res.status, 405, `HTTP ${method}`);
		}
	});
});

function establishBucket(app = "myapp", bucket = globalThis.crypto.randomUUID()) {
	ENV.set(BUCKET_PREFIX + app, bucket);
	/** @type {Record<string, string>} */
	let headers = {
		Authorization: `Bearer ${bucket}`,
	};
	return { app, bucket, headers };
}

function resetEnvironment() {
	for (let name of storeKeys()) { // resets environment
		ENV.delete(name);
	}
}

function verifyEnvironment() {
	for (let name of storeKeys()) {
		throw new Error(`detected unexpected store key: \`${name}\``);
	}
}

function* storeKeys() {
	for (let name of Object.keys(ENV.toObject())) {
		if (name.startsWith(BUCKET_PREFIX)) {
			yield name;
		}
	}
}
