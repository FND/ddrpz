/** @template {Record<string, any>} RequestParameters */
export class RequestQueue {
	/** @type {RequestParameters[]} */
	_queue = [];
	_descriptors = new WeakMap(); // XXX: no need to be weak?
	_pending = false;

	/** @param {(params: RequestParameters) => Promise<any>} handler */
	constructor(handler) {
		this._handler = handler;
	}

	/** @param {RequestParameters} params */
	schedule(params) {
		let pwr = Promise.withResolvers();
		this._descriptors.set(params, pwr);

		this._queue.push(params);
		this._process();
		return pwr.promise;
	}

	async _process() {
		let queue = this._queue;
		if (this._pending || queue.length === 0) {
			return;
		}

		let params = /** @type {RequestParameters} */ (queue.shift()); // XXX: inefficient
		let desc = this._descriptors;
		let pwr = desc.get(params);
		desc.delete(params);

		this._pending = true;
		try {
			let res = await this._handler(params);
			pwr.resolve(res);
		} catch (err) {
			pwr.reject(err);
			let reason;
			for (let params of queue) {
				reason ??= new Error("aborted queued request due to failing predecessor");
				desc.get(params).reject(reason);
			}
			this._queue = [];
		}
		this._pending = false;

		this._process();
	}
}
