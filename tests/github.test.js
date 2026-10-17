import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GitHubAPI,
  GitHubStore,
  repositoryName,
  revisionHeads,
} from "../src/github.js";
// Node has Blob but no FileReader. Keep the production browser conversion exercised.
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload();
      },
      () => this.onerror(),
    );
  }
};
const folder = "folder_0123456789";
const targets = new Set(["region-25030"]);
const photo = "data:image/jpeg;base64,aGVsbG8=";
const record = (title = "처음") => ({
  id: "visit-1",
  target: "region-25030",
  date: "2026-10-17",
  title,
  memo: "함께한 여행",
  photos: [photo],
});
function fakeAPI() {
  const files = new Map();
  let count = 0;
  return {
    files,
    failPhoto: false,
    failEvent: false,
    async upload(meta, blob) {
      if (
        (blob.type.startsWith("image/") && this.failPhoto) ||
        (blob.type === "application/json" && this.failEvent)
      )
        throw Error("network down");
      const id =
        blob.type === "application/json"
          ? `records/${crypto.randomUUID()}.json`
          : `photos/${String(++count).padStart(64, "0")}.jpg`;
      files.set(id, { meta, blob });
      return { id };
    },
    async list() {
      return [...files]
        .filter(([id]) => id.startsWith("records/"))
        .map(([id]) => ({ id }));
    },
    async read(id) {
      if (!files.has(id)) throw Error("missing");
      return files.get(id).blob;
    },
  };
}
test("GitHub immutable revisions upload actual image files, preserve simultaneous edits and isolate deletion branches", async () => {
  const api = fakeAPI();
  const a = new GitHubStore(api, folder, targets);
  await a.append("visit-1", record());
  assert.equal(api.files.size, 2);
  assert.equal([...api.files.values()][0].blob.type, "image/jpeg");
  const b = new GitHubStore(api, folder, targets);
  await b.load();
  await a.load();
  await a.append("visit-1", record("서울 여행"));
  await b.append("visit-1", record("제주 여행"));
  const viewer = new GitHubStore(api, folder, targets);
  const both = await viewer.load();
  assert.equal(both.length, 2);
  assert.ok(both.some((r) => r.title.includes("서울 여행")));
  assert.ok(both.some((r) => r.title.includes("제주 여행")));
  assert.equal(
    both.filter((r) => r.title.startsWith("[동시 수정본]")).length,
    1,
  );
  assert.ok(both.every((r) => r.photos[0] === photo));
  assert.equal(
    [...api.files.values()].filter((f) => f.blob.type === "image/jpeg").length,
    1,
    "unchanged photo reused",
  );
  await viewer.append(both[1].id, null);
  assert.equal(
    (await viewer.load()).length,
    1,
    "delete one branch retains the other",
  );
  assert.equal(api.files.size, 5, "old revisions and photo remain recoverable");
  const clean = new GitHubStore(api, folder, targets);
  assert.deepEqual(await clean.load(), viewer.records);
});
test("photo upload and metadata failures never publish incomplete records or mutate the draft", async () => {
  const api = fakeAPI();
  const store = new GitHubStore(api, folder, targets);
  const draft = record();
  api.failPhoto = true;
  await assert.rejects(store.append(draft.id, draft), /network/);
  assert.equal(api.files.size, 0);
  api.failPhoto = false;
  api.failEvent = true;
  await assert.rejects(store.append(draft.id, draft), /network/);
  assert.equal(api.files.size, 1);
  assert.equal((await store.load()).length, 0);
  assert.deepEqual(draft, record());
  api.failEvent = false;
  await store.append(draft.id, draft);
  assert.equal((await store.load()).length, 1);
  assert.equal(api.files.size, 2, "retry reuses uploaded photo");
});
test("remote photos require a matching SHA-256; invalid records fail closed", async () => {
  const api = fakeAPI();
  const store = new GitHubStore(api, folder, targets);
  await store.append("visit-1", record());
  const image = [...api.files.values()].find((f) =>
    f.blob.type.startsWith("image/"),
  );
  image.blob = new Blob(["changed"], { type: "image/jpeg" });
  await assert.rejects(new GitHubStore(api, folder, targets).load(), /무결성/);
});
test("revision graph preserves edits concurrent with a deletion, without relying on client clocks", () => {
  const events = [
    { fileId: "root", recordId: "one", parent: null },
    { fileId: "deleted", recordId: "one", parent: "root", deleted: true },
    { fileId: "edit", recordId: "one", parent: "root" },
  ];
  assert.deepEqual(
    revisionHeads(events).map((e) => e.fileId),
    ["edit"],
  );
});
test("GitHub API reads only travel-data revision paths, keeps auth out of URLs and rejects denied sessions", async () => {
  assert.equal(
    repositoryName("https://github.com/funny2517-hash/kksjih"),
    "funny2517-hash/kksjih",
  );
  assert.throws(() => repositoryName("../bad/repo"));
  assert.throws(() => repositoryName("bad name/repo"));
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push([url, options]);
      return new Response(
        JSON.stringify(
          calls.length === 1
            ? { tree: [{ type: "tree", path: "travel-data", sha: "data-sha" }] }
            : {
                tree: [
                  {
                    type: "blob",
                    path: "records/12345678-1234-1234-1234-123456789abc.json",
                  },
                  { type: "blob", path: "photos/other.jpg" },
                  { type: "blob", path: "unrelated.json" },
                ],
              },
        ),
      );
    };
    const api = new GitHubAPI("private-token", "owner/repo");
    assert.equal((await api.list()).length, 1);
    assert.ok(calls[1][0].includes("data-sha?recursive=1"));
    assert.equal(calls[0][1].headers.Authorization, "Bearer private-token");
    assert.ok(!calls[0][0].includes("private-token"));
    globalThis.fetch = async () => new Response("", { status: 401 });
    await assert.rejects(api.list(), /만료/);
    assert.equal(api.token, "");
    await assert.rejects(api.list(), /만료/);
    globalThis.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(
      new GitHubAPI("x", "owner/repo").list(),
      /권한 또는 API/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("GitHub write recovers a lost response by checking the immutable Git blob SHA", async () => {
  const original = globalThis.fetch;
  const { createHash } = await import("node:crypto");
  let putCount = 0;
  let expected;
  try {
    globalThis.fetch = async (url, options) => {
      if (options.method === "PUT") {
        putCount++;
        const body = JSON.parse(options.body);
        const bytes = Buffer.from(body.content, "base64");
        expected = createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex");
        return new Response("", { status: 503 });
      }
      return new Response(JSON.stringify({ sha: expected }));
    };
    const api = new GitHubAPI("token", "owner/repo");
    const result = await api.upload(
      {},
      new Blob(["actual image"], { type: "image/jpeg" }),
    );
    assert.match(result.id, /^photos\/[a-f0-9]{64}\.jpg$/);
    assert.equal(putCount, 1);
  } finally {
    globalThis.fetch = original;
  }
});
