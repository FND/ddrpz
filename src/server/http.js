import { load, save } from "./store.js";

let ENV = Deno.env;

export let BUCKET_PREFIX = "DDRPZ_";
export let CORS_PREFIX = BUCKET_PREFIX + "CORS_";

let SUPPORTED_METHODS = "OPTIONS, HEAD, GET, PUT";

/**
 * @param {Request} req
 * @returns {Response | Promise<Response>}
 */
export default function (req) {
	// CORS preflight support
	let app = new URL(req.url).pathname.slice(1);
	let { method, headers } = req;
	let permitted = ENV.get(CORS_PREFIX + app);
	permitted &&= new URL(permitted).origin;
	if (
		method === "OPTIONS" && headers.get("Access-Control-Request-Method") &&
		permitted && headers.get("Origin") === permitted
	) {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": permitted,
				"Access-Control-Allow-Methods": SUPPORTED_METHODS,
				"Access-Control-Allow-Headers": "Authorization, If-Match, If-None-Match",
			},
		});
	}

	// check auth early to minimize unnecessary computation
	let auth = headers.get("Authorization");
	if (!auth) {
		return new Response("", { status: 404 }); // don't advertise availability here
	}
	if (!auth.startsWith("Bearer ")) {
		return new Response("invalid authentication scheme", { status: 403 });
	}

	let bucket = ENV.get(BUCKET_PREFIX + app);
	if (!bucket) {
		return new Response("no such bucket", { status: 404 });
	}
	if (auth.slice(7) !== bucket) { // NB: strips auth scheme
		return new Response("", { status: 403 });
	}

	switch (method) {
		case "OPTIONS":
			return new Response(null, {
				status: 204,
				headers: {
					Allow: SUPPORTED_METHODS,
				},
			});
		case "HEAD":
			return retrieve(req, bucket, permitted, true);
		case "GET":
			return retrieve(req, bucket, permitted);
		case "PUT":
			return store(req, bucket);
		default:
			return new Response("", { status: 405 });
	}
}

/**
 * @param {Request} req
 * @param {string} bucket
 * @param {string} [corsOrigin]
 * @param {boolean} [omitBody]
 * @returns {Promise<Response>}
 */
async function retrieve(req, bucket, corsOrigin, omitBody) {
	/** @type {Record<string, string>} */
	let headers = {};
	if (corsOrigin) {
		headers["Access-Control-Allow-Origin"] = corsOrigin;
	}

	let res = await load(bucket);
	if (!res) {
		return new Response(null, { status: 204, headers });
	}

	let etag = `"${res.hash}"`;
	if (req.headers.get("If-None-Match") === etag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(omitBody ? null : res.data, {
		status: 200,
		headers: {
			...headers,
			ETag: etag,
			"Access-Control-Expose-Headers": "ETag",
		},
	});
}

/**
 * @param {Request} req
 * @param {string} bucket
 * @returns {Promise<Response>}
 */
async function store(req, bucket) {
	// FIXME: potential race condition, as concurrent requests might change
	//        state in between `await` (i.e. load, save, save); locking required?
	let res = await load(bucket);
	let ifMatch = req.headers.get("If-Match");
	let ifNoneMatch = req.headers.get("If-None-Match");
	if (ifMatch) { // update existing data
		if (ifNoneMatch) {
			return invalidConditions();
		}
		if (!res || ifMatch !== `"${res.hash}"`) { // empty
			return new Response(null, { status: 412 });
		}
		// ... otherwise continue below
	} else if (ifNoneMatch === "*") { // populate data (create only)
		if (res) { // not empty
			return new Response(null, { status: 412 });
		}
		// ... otherwise continue below
	} else if (ifNoneMatch) {
		return new Response("invalid `If-None-Match` condition", {
			status: 400,
		});
	} else {
		return new Response("write operations must use conditional requests", {
			status: 428,
		});
	}

	let body = new Uint8Array(await req.arrayBuffer());
	let hash = await save(bucket, body);
	return new Response(null, {
		status: 204,
		headers: {
			ETag: `"${hash}"`,
			"Access-Control-Expose-Headers": "ETag",
		},
	});
}

function invalidConditions() {
	return new Response("must not combine `If-None-Match` and `If-Match` conditions", {
		status: 400,
	});
}
