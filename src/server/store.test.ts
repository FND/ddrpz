import { load, save } from "./store.js";
import { describe, it } from "$deno/testing/bdd.ts";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
} from "$deno/assert/mod.ts";

// deno-fmt-ignore
let SAMPLE_DATA = [
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41,
	43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
];
let SAMPLE_HASH = "26189d3c21eee5c926852f0a5f2ffd64f4be0140eafc01772636ef16d69e6e43";

describe("store", () => {
	it("automatically hashes data", async () => {
		let bucket = "sample";
		let original = new Uint8Array(SAMPLE_DATA);
		await save(bucket, original);

		let res = await load(bucket);
		assertSame(res?.hash, SAMPLE_HASH);
		assertDeep(res?.data, original);

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

// NB: intentionally independent from source implementation
async function hash(buffer: ArrayBuffer) {
	let hash = await globalThis.crypto.subtle.digest("SHA-256", buffer);
	let hex = "";
	for (let value of new Uint8Array(hash)) {
		hex += value.toString(16).padStart(2, "0");
	}
	return hex;
}
