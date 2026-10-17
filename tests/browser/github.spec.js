import { test, expect } from "@playwright/test";
const folder = "folder_0123456789";
const client = "123456789-unit-test.apps.googleusercontent.com";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAAWUlEQVR4nO3PUQkAIBTAwNfVFGaxrCH8OITBAtxmn/V1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYB4/ym02xvB+kAAAAASUVORK5CYII=",
  "base64",
);
function backend() {
  return { files: new Map(), failEvent: false, deny: false, public: false };
}
async function mockGitHub(page, db) {
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const reply = (status, body, contentType = "application/json") =>
      route.fulfill({
        status,
        body:
          typeof body === "string" || Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body),
        contentType,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    if (db.deny) return reply(401, {});
    if (path === "/repos/funny2517-hash/kksjih")
      return reply(200, {
        full_name: "funny2517-hash/kksjih",
        private: !db.public,
        permissions: { push: true },
      });
    if (path.includes("/branches/")) return reply(200, { name: "main" });
    if (path.endsWith("/git/trees/main"))
      return reply(200, {
        tree: db.files.size
          ? [{ type: "tree", path: "travel-data", sha: "data-sha" }]
          : [],
      });
    if (path.endsWith("/git/trees/data-sha"))
      return reply(200, {
        tree: [...db.files.keys()].map((path) => ({ type: "blob", path })),
      });
    const key = decodeURIComponent(
      path.split("/contents/travel-data/")[1] || "",
    );
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      if (db.failEvent && key.startsWith("records/")) return reply(503, {});
      if (db.files.has(key)) return reply(422, {});
      const bytes = Buffer.from(body.content, "base64");
      const { createHash } = await import("node:crypto");
      const sha = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      db.files.set(key, {
        bytes,
        sha,
        mime: key.startsWith("photos/") ? "image/jpeg" : "application/json",
      });
      return reply(201, { content: { sha } });
    }
    const file = db.files.get(key);
    if (!file) return reply(404, {});
    if (req.headers().accept.includes("raw"))
      return reply(200, file.bytes, file.mime);
    return reply(200, { sha: file.sha });
  });
}
async function connect(page) {
  await page.locator("#github-settings").click();
  await page.locator("#github-repository").fill("funny2517-hash/kksjih");
  await page.locator("#github-branch").fill("main");
  await page.locator("#github-token").fill("test-memory-only-token");
  await page.locator("#github-connect").click();
  await expect(page.locator(".local-badge")).toContainText("GitHub에 저장");
  await page.locator("#github-dialog [data-close]").click();
}
async function choose(page) {
  await page.locator("[data-place]").first().waitFor();
  if (await page.locator('[data-place="province-11"]').count())
    await page.locator('[data-place="province-11"]').click();
  await page.locator("#search").fill("종로구");
  await page.locator("[data-place]").first().click();
}
async function add(page, title, withPhoto = true) {
  await page.locator("#new-record").click();
  await page.getByLabel("한 줄 제목").fill(title);
  if (withPhoto) {
    await page
      .locator("#photos")
      .setInputFiles({ name: "trip.png", mimeType: "image/png", buffer: tiny });
    await expect(page.locator("#photo-previews img")).toHaveCount(1);
  }
  await page.locator("#save-record").click();
  await expect(page.locator("#record-form")).toHaveCount(0);
}
test("GitHub uploads photos, migrates local records, reconnects, backs up and leaves local storage independent", async ({
  page,
}) => {
  const db = backend();
  await mockGitHub(page, db);
  await page.goto("/");
  await choose(page);
  await add(page, "브라우저 원본");
  await connect(page);
  await expect(page.locator("#memory-count")).toHaveText("0");
  await page.locator("#github-settings").click();

  await page.locator("#github-migrate").click();
  await expect(page.locator("#memory-count")).toHaveText("1");
  await page.locator("#github-dialog [data-close]").click();
  await add(page, "GitHub 여행");
  await expect(page.locator("#memory-count")).toHaveText("2");
  expect(
    [...db.files.values()].filter((f) => f.mime.startsWith("image/")),
  ).toHaveLength(1);
  expect(
    [...db.files.keys()].filter((p) => p.startsWith("records/")),
  ).toHaveLength(2);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("test-memory-only-token");
  const download = page.waitForEvent("download");
  await page.locator("#backup").click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const part of stream) chunks.push(part);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.records).toHaveLength(2);
  expect(
    backup.records.every((r) => r.photos[0].startsWith("data:image/")),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator(".local-badge")).toContainText("재연결 필요");
  await expect(page.locator("#memory-count")).toHaveText("0");
  await page.locator("#backup").click();
  await expect(page.locator("#notice")).toContainText("토큰");
  await connect(page);
  await expect(page.locator("#memory-count")).toHaveText("2");
  await choose(page);
  await expect(page.locator("#record-list img")).toHaveCount(2);
  await page.locator("#github-settings").click();
  await page.locator("#github-disconnect").click();
  await expect(page.locator(".local-badge")).toContainText(
    "이 브라우저에 저장",
  );
  await expect(page.locator("#memory-count")).toHaveText("1");

  expect(db.files.size).toBe(3);
});
test("two GitHub sessions preserve concurrent edits; API errors keep the draft and never fall back to local", async ({
  page,
  browser,
}) => {
  const db = backend();
  await mockGitHub(page, db);
  await page.goto("/");
  await connect(page);
  await choose(page);
  await add(page, "공유 기록");
  const context = await browser.newContext();
  const partner = await context.newPage();
  try {
    await mockGitHub(partner, db);
    await partner.goto("http://127.0.0.1:5173");
    await connect(partner);
    await choose(partner);
    await page.locator("[data-edit]").click();
    await partner.locator("[data-edit]").click();
    await page.getByLabel("한 줄 제목").fill("첫 사람 수정");
    await partner.getByLabel("한 줄 제목").fill("두 번째 사람 수정");
    await page.locator("#save-record").click();
    await expect(page.locator("#record-form")).toHaveCount(0);
    await partner.locator("#save-record").click();
    await expect(partner.locator("#record-form")).toHaveCount(0);
    await page.locator("#github-refresh").click();
    await expect(page.locator("#record-list article")).toHaveCount(2);
    await expect(page.locator("#record-list")).toContainText("동시 수정본");
    await expect(page.locator("#record-list")).toContainText(
      "두 번째 사람 수정",
    );
    await page.locator("#new-record").click();
    await page.getByLabel("한 줄 제목").fill("실패해도 보존");
    db.failEvent = true;
    await page.locator("#save-record").click();
    await expect(page.locator("#form-status")).toContainText("503");
    await expect(page.getByLabel("한 줄 제목")).toHaveValue("실패해도 보존");
    await expect(page.locator("#save-record")).toBeEnabled();
    db.failEvent = false;
    await page.locator("#save-record").click();
    await expect(page.locator("#record-form")).toHaveCount(0);
    await page.locator("#new-record").click();
    await page.getByLabel("한 줄 제목").fill("만료된 연결");
    db.deny = true;
    await page.locator("#save-record").click();
    await expect(page.locator("#form-status")).toContainText("만료");
    await expect(page.getByLabel("한 줄 제목")).toHaveValue("만료된 연결");
    await expect(page.locator("#github-settings")).toContainText("GitHub 설정");
  } finally {
    await context.close();
  }
});

test("public repository needs explicit disclosure acceptance and unaccepted connections upload nothing", async ({
  page,
}) => {
  const db = backend();
  db.public = true;
  await mockGitHub(page, db);
  await page.goto("/");
  await page.locator("#github-settings").click();
  await page.locator("#github-token").fill("test-memory-only-token");
  await page.locator("#github-connect").click();
  await expect(page.locator("#github-status")).toContainText("공개 동의");
  expect(db.files.size).toBe(0);
  await expect(page.locator(".local-badge")).toContainText(
    "이 브라우저에 저장",
  );
  await page.locator("#github-public").check();
  await page.locator("#github-connect").click();
  await expect(page.locator(".local-badge")).toContainText("GitHub에 저장");
  await expect(page.locator("#github-summary")).toContainText(
    "사진과 메모 공개",
  );
  await expect(page.locator("#github-token")).toHaveValue("");
});
