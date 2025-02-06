import * as cfg from "../config.js";

/* adapted from <https://prepitaph.org/articles/web-crypto-secrets/> */
let CRYPTO = globalThis.crypto.subtle;
let ENC = new TextEncoder();
let ALGO = "AES-GCM";
let KEY = {
	name: "PBKDF2",
	salt: ENC.encode(cfg.SALT).buffer,
	iterations: cfg.ITER ?? 2 ** 20,
	hash: "SHA-256",
};
let IV_SIZE = 16;

/**
 * @param {string} txt
 * @param {string} password
 * @returns {Promise<Uint8Array>}
 */
export async function encrypt(txt, password) {
	let iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_SIZE));
	let options = { name: ALGO, iv };
	let res = await CRYPTO.encrypt(options, await deriveKey(password), ENC.encode(txt));
	let data = new Uint8Array(res);
	// prepend IV
	let combo = new Uint8Array(IV_SIZE + data.length);
	combo.set(iv);
	combo.set(data, IV_SIZE);
	return combo;
}

/**
 * @param {Uint8Array | { buffer: ArrayBuffer }} data
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function decrypt({ buffer }, password) {
	let data = new Uint8Array(buffer, IV_SIZE);
	let options = {
		name: ALGO,
		iv: new Uint8Array(buffer, 0, IV_SIZE),
	};
	let res = await CRYPTO.decrypt(options, await deriveKey(password), data);
	return new TextDecoder().decode(res);
}

/** @param {string} password */
async function deriveKey(password) {
	let secret = await CRYPTO.importKey("raw", ENC.encode(password), KEY.name, false, [
		"deriveBits",
		"deriveKey",
	]);
	return CRYPTO.deriveKey(KEY, secret, { name: ALGO, length: 256 }, true, [
		"encrypt",
		"decrypt",
	]);
}
