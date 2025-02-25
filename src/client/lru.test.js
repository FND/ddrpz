import { LRUCache } from "./lru.js";
import { describe, it } from "@std/testing/bdd";
import {
	assertEquals as assertDeep,
	assertStrictEquals as assertSame,
} from "@std/assert";

describe("LRU cache", () => {
	it("limits the number of entries, evicting least recently used ones", () => {
		let cache = new LRUCache();
		cache.limit = 3;
		assertSame(cache.size, 0);

		cache.set("1st", "uno");
		assertSame(cache.size, 1);

		cache.set("2nd", "dos");
		assertSame(cache.size, 2);

		cache.set("3rd", "tres");
		assertSame(cache.size, 3);
		assertDeep([...cache.keys()], ["1st", "2nd", "3rd"]);

		cache.set("4th", "cuatro");
		assertDeep([...cache.keys()], ["2nd", "3rd", "4th"]);

		cache.get("2nd");
		cache.set("5th", "cinco");
		assertDeep([...cache.keys()], ["2nd", "4th", "5th"]);

		cache.set("6th", "seis");
		assertDeep([...cache.keys()], ["2nd", "5th", "6th"]);

		cache.set("7th", "siete");
		assertDeep([...cache.keys()], ["5th", "6th", "7th"]);
	});

	it("guards against integer overflow", () => { // NB: inevitably breaks encapsulation
		let cache = new LRUCache();
		let max = Number.MAX_SAFE_INTEGER - 1;
		cache._next = max - 2;

		cache.set("1st", "uno");
		cache.set("2nd", "dos");
		assertSame(cache._next, max);
		assertDeep([...cache._access.values()], [max - 2, max - 1]);

		cache.set("3rd", "tres");
		assertDeep([...cache._access.values()], [0, 1, 2]);
		assertSame(cache._next, 3);

		cache.set("4th", "cuatro");
		assertDeep([...cache._access.values()], [0, 1, 2, 3]);
		assertSame(cache._next, 4);
		assertDeep([...cache.keys()], ["1st", "2nd", "3rd", "4th"]);
	});
});
