import { BaseElement, js2css, render } from "./util.js";

let FORM = `
<form method="dialog" class="ddrpz stack">
	<p>
		Your data is encrypted before being sent to the server, which requires
		choosing a password. You also need to configure which server to use for
		storing that data.
	</p>

	<fieldset class="stack">
		<legend>Encryption</legend>
		<label>
			<b>Password</b>
			<input type="password" name="secret" required>
		</label>
		<label>
			<input type="checkbox" name="persist-secret" value="1">
			<b>Remember password on this device</b>
			<p class="warning">This means anyone with access to the device
					might easily access your data here.</p>
		</label>
	</fieldset>

	<fieldset class="stack">
		<legend>Server</legend>
		<label>
			<b>Vault URL</b>
			<input type="text" name="url" placeholder="https://example.org/demo" required>
		</label>
		<label>
			<b>API Key</b>
			<input type="password" name="token" placeholder="abc123" required>
		</label>
	</fieldset>
	<button>Save Settings</button>
</form>
	`.trim();

export class ConfigDialog extends BaseElement {
	/** @override */
	static tag = "ddrpz-config";
	/** @override */
	static css = js2css(import.meta.url);

	/** @param {ConfigStore} store */
	constructor(store) {
		super();
		this._store = /** @type {IConfigStore} store */ (store);
		this.hide();
		this.addEventListener("submit", this);
	}

	connectedCallback() {
		// allow controllers to register event handlers before triggering validation
		let store = this._store;
		queueMicrotask(store.validate.bind(store));
	}

	hide() {
		this.hidden = true;
		this.replaceChildren();
	}

	async show() {
		if (this.hidden) {
			let elements = render(this, FORM);
			// populate fields
			let store = this._store;
			let ops = store.constructor.fields.map(async (field) => {
				let el = /** @type {HTMLInputElement} */ (elements[field]);
				let value = el && await store.get(field);
				el.value = value ?? "";
			});
			await Promise.all(ops);
		}
		this.hidden = false;
	}

	/** @param {Event} ev */
	async handleEvent(ev) {
		ev.stopPropagation();

		let data = new FormData(this._form);
		let store = this._store;
		await Promise.all(store.constructor.fields.map((field) => {
			let value = /** @type {string | null} */ (data.get(field));
			let persist = field === "secret"
				? !!data.get("persist-secret") // XXX: special-casing
				: true;
			return store.set(field, value, persist);
		}));
		await store.validate();
	}

	get _form() {
		return /** @type {HTMLFormElement} */ (this.querySelector("form"));
	}
}

/**
 * @import { ConfigStore } from "./config_store.js"
 * @typedef {ConfigStore & { constructor: typeof ConfigStore }} IConfigStore
 */
