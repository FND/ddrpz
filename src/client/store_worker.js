import { decrypt, encrypt } from "./crypto.js";

self.addEventListener("message", onMessage);

/** @param {MessageEvent} message */
async function onMessage(message) {
	let [cmd, id, secret, payload] = message.data;
	switch (cmd) {
		case "encrypt": {
			let { buffer } = await encrypt(payload, secret);
			self.postMessage([id, buffer], /** @type {any} */ ([buffer]));
			break;
		}
		case "decrypt": {
			let txt = await decrypt({ buffer: payload }, secret);
			self.postMessage([id, txt]);
			break;
		}
		default:
			console.error(`ERROR: invalid worker command \`${cmd}\``);
			break;
	}
}
