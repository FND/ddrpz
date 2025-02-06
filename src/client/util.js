const PROCESSED = Symbol("processed");

/**
 * @param {Element} root
 * @param {string} html
 * @returns {ElementsByName}
 */
export function render(root, html) {
	let { document, elements } = html2dom(html);
	root.replaceChildren();
	root.append(...document.body.children); // NB: assumes `<head>` is irrelevant
	return elements;
}

/**
 * @param {string} html
 * @returns {{ document: Document, elements: ElementsByName }}
 */
export function html2dom(html) {
	let parser = new DOMParser();
	let doc = parser.parseFromString(html, "text/html");
	/** @type {ElementsByName} */
	let elements = {};
	let els = doc.querySelectorAll(":is(input, textarea, select, slot)[name]");
	for (let el of /** @type {NodeListOf<NameableElement>} */ (els)) {
		elements[el.name] = el;
	}
	return { document: doc, elements };
}

/** @param {string} url */
export function js2css(url) {
	return new URL(url.replace(/.js$/, ".css"));
}

export class BaseElement extends HTMLElement {
	static tag = "";
	/** @type {AttrDef & { [PROCESSED]?: true }} */
	static attributes = {};
	/** @type {URL | null} */
	static css = null;

	static register(tag = this.tag) {
		customElements.define(tag, this);
		let { css } = this;
		if (css) {
			let link = document.createElement("link");
			link.setAttribute("rel", "stylesheet");
			link.setAttribute("href", css.href);
			document.head.appendChild(link);
		}
	}

	static async whenDefined(tag = this.tag) {
		let ctor = await customElements.whenDefined(tag);
		if (ctor !== this) {
			abort("unexpected constructor for", tag, this);
		}
	}

	constructor() {
		super();
		// generate property accessors for select attributes
		let ctor = /** @type {typeof BaseElement} */ (this.constructor);
		let attribs = ctor.attributes;
		if (attribs && !attribs[PROCESSED]) {
			defineProps(ctor.prototype, attribs);
			attribs[PROCESSED] = true;
		}
	}

	async disconnectedCallback() {
		// cf. https://nolanlawson.com/2024/12/01/avoiding-unnecessary-cleanup-work-in-disconnectedcallback/
		await Promise.resolve();
		if (!this.isConnected) {
			this.teardown();
		}
	}

	teardown() {}
}

/**
 * @param {BaseElement} proto
 * @param {AttrDef} attribs
 */
function defineProps(proto, attribs) {
	for (let [name, { required, blank, get, set }] of Object.entries(attribs)) {
		/** @type {PropertyDescriptor & ThisType<HTMLElement>} */
		let props = {
			get() {
				let res = this.getAttribute(name);
				if (blank === false && res === "") {
					res = null;
				}
				if (required && res === null) {
					abort(`missing attribute \`${name}\` on`, this.localName, this);
				}
				return res;
			},
			set(value) {
				this.setAttribute(name, value);
			},
		};
		// XXX: `delete` seems crude
		if (get === false) {
			delete props.get;
		}
		if (set === false) {
			delete props.set; // XXX: results in silent failure
		}
		Object.defineProperty(proto, name, props);
	}
}

/**
 * @param {string} msg
 * @param {string} tag
 * @param {any} ctx
 */
function abort(msg, tag, ctx) {
	console.error("ERROR:", msg, ctx);
	throw new Error(`${msg} <${tag}>`);
}

/**
 * @typedef {Record<string, AttrDesc>} AttrDef
 * @typedef {Partial<Record<"required" | "blank" | "get" | "set", boolean>>} AttrDesc
 * @typedef {Record<string, NameableElement>} ElementsByName
 * @typedef {FieldElement | HTMLSlotElement} NameableElement
 * @typedef {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} FieldElement
 */
