import { RequestQueue } from "./request_queue.js";
import { describe, it } from "@std/testing/bdd";
import { assertRejects, assertStrictEquals as assertSame } from "@std/assert";

describe("request queue", () => {
	it("supports sequential requests", async () => {
		let queue = new RequestQueue(async (params) => {
			await Promise.resolve(null);
			switch (params.uri) {
				case "example.org":
					return "yay";
				case "example.com":
					return "boo";
				default:
					return "shrug";
			}
		});

		let uri = "example.org";
		assertSame(await queue.schedule({ uri }), "yay");

		uri = "example.com";
		assertSame(await queue.schedule({ uri }), "boo");

		uri = "example.org";
		assertSame(await queue.schedule({ uri }), "yay");

		uri = "example.net";
		let r1 = queue.schedule({ uri });
		uri = "example.org";
		let r2 = queue.schedule({ uri });
		assertSame(await r2, "yay");
		assertSame(await r1, "shrug");
	});

	it("performs parallel requests in sequence", async () => {
		/** @type {Request[]} */
		let requests = [];
		let queue = new RequestQueue((params) => {
			let req = new Request(params.uri);
			requests.push(req);
			return req.promise;
		});

		let uris = ["example.org", "example.com", "example.org", "example.net"];
		let responses = [];
		for (let uri of uris) {
			let res = queue.schedule({ uri });
			responses.push(res);
		}
		assertSame(requests.length, 1);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "pending");

		requests[0].resolve("one");
		assertSame(await responses[0], "one");
		assertSame(requests.length, 2);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "pending");

		requests[1].resolve("two");
		assertSame(await responses[1], "two");
		assertSame(requests.length, 3);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "resolved");
		assertSame(requests[2].uri, uris[2]);
		assertSame(requests[2].state, "pending");

		requests[2].resolve("three");
		assertSame(await responses[2], "three");
		assertSame(requests.length, 4);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "resolved");
		assertSame(requests[2].uri, uris[2]);
		assertSame(requests[2].state, "resolved");
		assertSame(requests[3].uri, uris[3]);
		assertSame(requests[3].state, "pending");

		requests[3].resolve("four");
		assertSame(await responses[3], "four");
		assertSame(requests.length, 4);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "resolved");
		assertSame(requests[2].uri, uris[2]);
		assertSame(requests[2].state, "resolved");
		assertSame(requests[3].uri, uris[3]);
		assertSame(requests[3].state, "resolved");

		responses = [
			queue.schedule({
				uri: "example.lu",
			}),
			queue.schedule({
				uri: "example.ch",
			}),
		];
		assertSame(requests.length, 5);
		assertSame(requests[4].uri, "example.lu");
		assertSame(requests[4].state, "pending");

		requests[4].resolve("five");
		assertSame(await responses[0], "five");
		assertSame(requests.length, 6);
		assertSame(requests[4].uri, "example.lu");
		assertSame(requests[4].state, "resolved");
		assertSame(requests[5].uri, "example.ch");
		assertSame(requests[5].state, "pending");

		requests[5].resolve("six");
		assertSame(await responses[1], "six");
		assertSame(requests.length, 6);
		assertSame(requests[4].uri, "example.lu");
		assertSame(requests[4].state, "resolved");
		assertSame(requests[5].uri, "example.ch");
		assertSame(requests[5].state, "resolved");
	});

	it("aborts when a request fails", async () => {
		/** @type {Request[]} */
		let requests = [];
		let queue = new RequestQueue((params) => {
			let req = new Request(params.uri);
			requests.push(req);
			return req.promise;
		});

		let uris = ["example.org", "example.com", "example.net", "example.edu"];
		let responses = [];
		for (let uri of uris) {
			let res = queue.schedule({ uri });
			responses.push(res);
		}
		assertSame(requests.length, 1);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "pending");

		requests[0].resolve("one");
		assertSame(await responses[0], "one");
		assertSame(requests.length, 2);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "pending");

		requests[1].reject(new Error("dos"));
		await assertRejects(() => responses[1], Error, "dos");
		assertSame(requests.length, 2);
		assertSame(requests[0].uri, uris[0]);
		assertSame(requests[0].state, "resolved");
		assertSame(requests[1].uri, uris[1]);
		assertSame(requests[1].state, "rejected");
		await assertRejects(() => responses[2], Error, "aborted");
		await assertRejects(() => responses[3], Error, "aborted");
	});
});

class Request {
	/** @param {string} uri */
	constructor(uri) {
		this.uri = uri;
		this.state = "pending";

		let pwr = Promise.withResolvers();
		this.promise = pwr.promise;
		this._resolve = pwr.resolve;
		this._reject = pwr.reject;
	}

	/** @param {any} value */
	resolve(value) {
		this.state = "resolved";
		return this._resolve(value);
	}

	/** @param {Error} err */
	reject(err) {
		this.state = "rejected";
		return this._reject(err);
	}
}
