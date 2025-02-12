import { decrypt, encrypt } from "./crypto.js";
import { describe, it } from "@std/testing/bdd";
import { assert, assertRejects, assertStrictEquals as assertSame } from "@std/assert";

let SAMPLE = "lörεm ipsüm dølœr\nßit ämзt";
let PASSWORD = `s33kr1t ${globalThis.crypto.randomUUID()}`;

describe("encryption", () => {
	it("turns text into binary data", async () => {
		let data = await encrypt(SAMPLE, PASSWORD);
		assert(data instanceof Uint8Array);
		assertSame(data.length, 66); // XXX: brittle and meaningless?
		assertSame(await decrypt(data, PASSWORD), SAMPLE); // just to be sure
	});
});

describe("decryption", () => {
	it("turns binary data into text", async () => {
		let data = await encrypt(SAMPLE, PASSWORD);
		assertSame(await decrypt(data, PASSWORD), SAMPLE);
	});

	it("balks at erroneous password", async () => {
		let data = await encrypt(SAMPLE, PASSWORD);
		await assertRejects(
			() => decrypt(data, "…abc123…"),
			Error,
			"Decryption failed",
		);
	});

	it("balks at non-binary input data", async () => {
		await assertRejects(
			// @ts-expect-error TS2345
			() => decrypt(SAMPLE, PASSWORD),
			Error,
			"Tag length overflows ciphertext",
		);
	});
});
