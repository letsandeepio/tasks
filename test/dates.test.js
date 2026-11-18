import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDue, toApiDue, fromApiDue } from "../src/dates.js";

// Wednesday, 18 Nov 2026, late evening local time.
const now = new Date(2026, 10, 18, 23, 30);

test("relative words and offsets resolve against the local date", () => {
  assert.equal(parseDue("today", now), "2026-11-18");
  assert.equal(parseDue("Tomorrow", now), "2026-11-19");
  assert.equal(parseDue("+14", now), "2026-12-02");
});

test("a weekday means the next one, never today", () => {
  assert.equal(parseDue("fri", now), "2026-11-20");
  assert.equal(parseDue("wednesday", now), "2026-11-25");
});

test("ISO dates pass through and impossible ones are rejected", () => {
  assert.equal(parseDue("2027-02-28", now), "2027-02-28");
  assert.throws(() => parseDue("2027-02-30", now));
  assert.throws(() => parseDue("someday", now));
});

test("API due values round-trip through midnight UTC", () => {
  assert.equal(toApiDue("today", now), "2026-11-18T00:00:00.000Z");
  assert.equal(fromApiDue("2026-11-18T00:00:00.000Z"), "2026-11-18");
});
