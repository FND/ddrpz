import { SALT } from "./config.js";

/* adapted from <https://prepitaph.org/articles/web-crypto-secrets/> */
let CRYPTO = globalThis.crypto.subtle;
let ALGO = "AES-GCM";
let KEY = {
	name: "PBKDF2",
	salt: str2bytes(SALT).buffer,
	iterations: 100000,
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
	let res = await CRYPTO.encrypt(options, await deriveKey(password), str2bytes(txt));
	let data = new Uint8Array(res);
	// prepend IV
	let combo = new Uint8Array(IV_SIZE + data.length);
	combo.set(iv);
	combo.set(data, IV_SIZE);
	return combo;
}

/**
 * @param {Uint8Array} data
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
	let secret = await CRYPTO.importKey("raw", str2bytes(password), KEY.name, false, [
		"deriveBits",
		"deriveKey",
	]);
	return CRYPTO.deriveKey(KEY, secret, { name: ALGO, length: 256 }, true, [
		"encrypt",
		"decrypt",
	]);
}

/** @param {string} txt */
function str2bytes(txt) {
	return new TextEncoder().encode(txt);
}
