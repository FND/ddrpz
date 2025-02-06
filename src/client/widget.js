import { ConfigDialog } from "./config_dialog.js";
import { ConfigStore } from "./config_store.js";
import { BaseElement, js2css, render } from "./util.js";

let FORM = `
<form method="dialog" class="ddrpz stack">
	<textarea name="notes"></textarea>
	<button>Save</button>
</form>
`.trim();

export class Widget extends BaseElement {
	/** @override */
	static tag = "sample-widget";
	/** @override */
	static attributes = /** @type {const} */ ({
		store: {
			required: true,
			blank: false,
			set: false,
		},
	});
	/** @override */
	static css = js2css(import.meta.url);

	constructor() {
		super();
		this.addEventListener("submit", this);
	}

	async connectedCallback() {
		let self = this._self;
		if (!self._configStore) { // initialize
			this._notes = render(this, FORM).notes;

			let store = self._configStore = new ConfigStore(self.store);
			await ConfigDialog.whenDefined();
			let cfg = self._configDialog = new ConfigDialog(store);
			this.appendChild(cfg);

			store.addEventListener("incomplete", this);
			store.addEventListener("ready", this);
		}
	}

	/** @override */
	teardown() {
		let store = this._self._configStore;
		store.removeEventListener("incomplete", this);
		store.removeEventListener("ready", this);
		delete /** @type {any} */ (this)._configStore;
		delete /** @type {any} */ (this)._configDialog;
	}

	/** @param {Event} ev */
	handleEvent(ev) {
		let self = this._self;
		switch (ev.type) {
			case "submit":
				console.log(this._self._notes.value); // TODO
				break;
			case "incomplete":
				self._configDialog.show();
				break;
			case "ready":
				self._configDialog.hide();
				break;
		}
	}

	/**
	 * XXX: crutch to appease TypeScript
	 * @returns {IWidget}
	 */
	get _self() {
		return /** @type {any} */ (this);
	}
}

/**
 * @typedef {{ _notes: HTMLTextAreaElement, _configDialog: ConfigDialog, _configStore: ConfigStore } & Attribs} IWidget
 * @typedef {Record<keyof Widget.attributes, string>} Attribs
 */
