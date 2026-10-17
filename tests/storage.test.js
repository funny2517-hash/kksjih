import { test } from "node:test";
import assert from "node:assert/strict";
import { writeRecords } from "../src/storage.js";
test("a stalled storage request times out and aborts instead of locking the editor forever", async () => {
  let aborted = false;
  const db = {
    transaction() {
      return {
        done: new Promise(() => {}),
        store: {
          put() {
            return new Promise(() => {});
          },
        },
        abort() {
          aborted = true;
        },
      };
    },
  };
  await assert.rejects(
    writeRecords(db, [{ id: "pending" }], 25),
    /저장이 지연되어 취소/,
  );
  assert.equal(aborted, true);
});
test("quota failures abort the transaction and preserve the original error for the form", async () => {
  let aborted = false,
    rejectDone;
  const failure = new DOMException("quota exceeded", "QuotaExceededError");
  const db = {
    transaction() {
      return {
        done: new Promise((_, reject) => (rejectDone = reject)),
        store: {
          put() {
            throw failure;
          },
        },
        abort() {
          aborted = true;
          rejectDone(new Error("aborted"));
        },
      };
    },
  };
  await assert.rejects(
    writeRecords(db, [{ id: "photo" }], 100),
    (error) => error === failure,
  );
  assert.equal(aborted, true);
});
