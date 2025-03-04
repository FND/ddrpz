import { decrypt, encrypt } from "./crypto.js";

self.addEventListener("message", onMessage);

/** @param {MessageEvent} message */
async function onMessage(message) {
	/** @type {[string, ...cmd: EncryptCommand | DecryptCommand]} */
	let [id, cmd, payload, secret] = message.data;
	let t0 = performance.now();
	let size = 0;
	switch (cmd) {
		case "encrypt": {
			let txt = /** @type {EncryptCommand[1]} */ (payload);
			let data = await encrypt(txt, secret);
			let buf = /** @type {EncryptionResult} */ (data.buffer);
			size = buf.byteLength;
			self.postMessage([id, buf], /** @type {Transfer} */ ([buf]));
			break;
		}
		case "decrypt": {
			let buffer = /** @type {DecryptCommand[1]} */ (payload);
			size = buffer.byteLength;
			/** @type {DecryptionResult} */
			let txt = await decrypt({ buffer }, secret);
			self.postMessage([id, txt]);
			break;
		}
		default:
			console.error(`ERROR: invalid worker command \`${cmd}\``);
			break;
	}
	console.log(`${cmd} command for ${size} bytes took ${performance.now() - t0} ms`);
}

/**
 * @typedef {["encrypt", string, string]} EncryptCommand
 * @typedef {ArrayBuffer} EncryptionResult
 * @typedef {["decrypt", ArrayBuffer, string]} DecryptCommand
 * @typedef {string} DecryptionResult
 * @typedef {WindowPostMessageOptions} Transfer -- XXX: workaround
 */
