import { load, save } from "./store.js";
import { SAMPLE_DATA, SAMPLE_HASH } from "./test_util.js";
import { describe, it } from "@std/testing/bdd";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
} from "@std/assert";

describe("store", () => {
	it("automatically hashes data", async () => {
		let bucket = "sample";
		await save(bucket, SAMPLE_DATA);

		let res = await load(bucket);
		assertSame(res?.hash, SAMPLE_HASH);
		assertDeep(res?.data, SAMPLE_DATA);

		for (let size of [16, 256, 1024, 4096]) {
			let original = globalThis.crypto.getRandomValues(new Uint8Array(size));
			await save(bucket, original);

			let res = await load(bucket);
			assertSame(res?.hash, await hash(original.buffer));
			assertDeep(res?.data, original);
		}
	});

	it("reports empty store", async () => {
		let res = await load("EMPTY");
		assertSame(res, null);
	});
});

/** @param {ArrayBuffer} buffer */
// NB: intentionally independent from source implementation
async function hash(buffer) {
	let hash = await globalThis.crypto.subtle.digest("SHA-256", buffer);
	let hex = "";
	for (let value of new Uint8Array(hash)) {
		hex += value.toString(16).padStart(2, "0");
	}
	return hex;
}
