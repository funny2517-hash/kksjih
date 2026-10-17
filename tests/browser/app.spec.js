import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAAWUlEQVR4nO3PUQkAIBTAwNfVFGaxrCH8OITBAtxmn/V1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYB4/ym02xvB+kAAAAASUVORK5CYII=",
  "base64",
);
async function choose(page, name = "종로구") {
  await page.locator("[data-place]").first().waitFor();
  if (name === "종로구" || name === "서귀포시") {
    const province = name === "종로구" ? "11" : "39";
    if (await page.locator('[data-place="province-' + province + '"]').count())
      await page.locator('[data-place="province-' + province + '"]').click();
  }
  await page.locator("#search").fill(name);
  await page.locator("[data-place]").first().click();
}
async function add(page, title = "우리의 첫 여행", photo = true) {
  await page.getByRole("button", { name: "새로운 추억 남기기" }).click();
  await page.getByLabel("한 줄 제목").fill(title);
  await page
    .getByLabel("여행 메모")
    .fill("함께 걸었던 골목 <script>alert(1)</script>");
  if (photo) {
    await page
      .locator("#photos")
      .setInputFiles({ name: "trip.png", mimeType: "image/png", buffer: tiny });
    await expect(page.locator("#photo-previews img")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "추억 저장하기" }).click();
  await expect(page.locator(".memory").filter({ hasText: title })).toHaveCount(
    1,
  );
}
test("real map, photo puzzle, edit, multiple visits, durable persistence, zoom, rest stops, backup and restore", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".regions path")).toHaveCount(17);
  await choose(page);
  await add(page);
  await expect(page.locator("#region-count")).toHaveText("1");
  await expect(page.locator('[data-region="region-11010"]')).toHaveAttribute(
    "fill",
    "url(#photo-11010)",
  );
  await expect(page.locator(".memory .memo")).toHaveText(
    "함께 걸었던 골목 <script>alert(1)</script>",
  );
  await page.reload();
  await expect(page.locator("#memory-count")).toHaveText("1");
  await choose(page);
  await expect(page.locator(".memory img")).toHaveCount(1);
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("한 줄 제목").fill("수정한 추억");
  await page.getByRole("button", { name: "추억 저장하기" }).click();
  await expect(page.locator(".memory")).toContainText("수정한 추억");
  await add(page, "두 번째 방문", false);
  await expect(page.locator(".memory")).toHaveCount(2);
  await expect(page.locator("#region-count")).toHaveText("1");
  await page.getByRole("button", { name: "전국 지도 보기" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await page.waitForTimeout(400);
  await expect(page.locator("#zoom-level")).not.toHaveText("100%");
  await page.locator("#labels").uncheck();
  await expect(page.locator(".labels text")).toHaveCount(0);
  await page.locator("#labels").check();
  await page.getByRole("tab", { name: "휴게소", exact: true }).click();
  await expect(page.locator(".markers circle")).toHaveCount(210);
  await choose(page, "평창");
  await add(page, "휴게소에서 커피", true);
  await expect(page.locator("#rest-count")).toHaveText("1");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ 백업" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(backup.records).toHaveLength(3);
  expect(backup.records.filter((r) => r.photos.length)).toHaveLength(2);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.locator("#memory-count")).toHaveText("2");
  await page.locator("#restore-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "복원하기", exact: true }).click();
  await expect(page.locator("#memory-count")).toHaveText("3");
  await expect(page.locator(".memory img")).toHaveCount(1);
  await page.locator("#restore-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...backup,
        records: [{ ...backup.records[0], target: "invented" }],
      }),
    ),
  });
  await expect(page.locator("#notice")).toContainText("알 수 없는");
  await expect(page.locator("#memory-count")).toHaveText("3");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/kksjih-rest.png", fullPage: true });
});
test("two-level actual map: province to final city/county/district, never a third level", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".regions path")).toHaveCount(17);
  await expect(page.locator("#new-record")).toHaveCount(0);
  await page.locator('[data-region="province-36"]').dispatchEvent("click");
  await expect(page.locator("#map-breadcrumb")).toContainText("전라남도");
  await expect(page.locator("#new-record")).toHaveCount(0);
  await page.locator("#search").fill("무안군");
  await page.locator("[data-place]").click();
  await expect(page.locator(".detail-heading h2")).toContainText("무안군");
  await expect(page.locator("#new-record")).toBeVisible();
  await expect(page.locator("#map-breadcrumb button")).toHaveCount(2);
  await add(page, "무안의 추억", true);
  await page.locator("#national-level").click();
  await expect(page.locator(".regions path")).toHaveCount(17);
  await expect(page.locator("#new-record")).toHaveCount(0);
  await expect(
    page.locator('[data-place="province-36"] .count-pill'),
  ).toHaveText("1");
  await page.locator('[data-place="province-11"]').click();
  await expect(page.locator(".regions path")).toHaveCount(25);
  await page.locator("#search").fill("광진구");
  await page.locator("[data-place]").click();
  await expect(page.locator(".detail-heading h2")).toContainText("광진구");
  await expect(page.locator("#new-record")).toBeVisible();
  await page.locator("#national-level").click();
  await page.locator('[data-place="province-31"]').click();
  await page.locator("#search").fill("평택시");
  await page.locator("[data-place]").click();
  await expect(page.locator(".detail-heading h2")).toContainText("평택시");
  await expect(page.locator("#new-record")).toBeVisible();
  await page.locator("#search").fill("수원");
  await expect(page.locator("[data-place]")).toHaveCount(1);
  await page.locator("[data-place]").click();
  await expect(page.locator(".detail-heading h2")).toContainText("수원시");
  await expect(page.locator("#map-breadcrumb button")).toHaveCount(2);
  await page.getByRole("tab", { name: "휴게소", exact: true }).click();
  await page.locator("#route").selectOption("50");
  const count = await page.locator("[data-place]").count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(210);
  await expect(page.locator(".markers circle")).toHaveCount(count);
});
test("records survive a complete browser close and reopen", async ({
  playwright,
}, testInfo) => {
  const os = await import("node:os");
  const path = await import("node:path");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "couple-map-"));
  const options = {
    ...testInfo.project.use.launchOptions,
    viewport: { width: 1440, height: 1000 },
  };
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(
      profile,
      options,
    );
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5173");
    await choose(page, "서귀포시");
    await add(page, "제주에서 함께", true);
    await context.close();
    context = await playwright.chromium.launchPersistentContext(
      profile,
      options,
    );
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5173");
    await expect(page.locator("#memory-count")).toHaveText("1");
    await choose(page, "서귀포시");
    await expect(page.locator(".memory")).toContainText("제주에서 함께");
    await expect(page.locator(".memory img")).toHaveJSProperty(
      "naturalWidth",
      64,
    );
    await page.getByRole("button", { name: "전국 지도 보기" }).click();
    await page.waitForTimeout(500);
    const shot = await page
      .locator('[data-region="region-39020"]')
      .screenshot();
    const painted = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = "data:image/png;base64," + data;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          Math.abs(pixels[i] - 121) < 8 &&
          Math.abs(pixels[i + 1] - 155) < 8 &&
          Math.abs(pixels[i + 2] - 99) < 8
        )
          count++;
      return count;
    }, shot.toString("base64"));
    expect(painted).toBeGreaterThan(10);
    await page.screenshot({ path: "/tmp/kksjih-puzzle.png", fullPage: true });
  } finally {
    if (context) await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});

test("large photos save, visible progress, storage error keeps draft and retry works", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await choose(page);
  await page.getByRole("button", { name: "새로운 추억 남기기" }).click();
  await page.getByLabel("한 줄 제목").fill("큰 사진 여섯 장");
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1200;
    const ctx = c.getContext("2d");
    const image = ctx.createImageData(c.width, c.height);
    let seed = 42;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      image.data[i] = seed & 255;
      image.data[i + 1] = (seed >>> 8) & 255;
      image.data[i + 2] = (seed >>> 16) & 255;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return c.toDataURL("image/jpeg", 0.95).split(",")[1];
  });
  const buffer = Buffer.from(base64, "base64");
  expect(buffer.length).toBeGreaterThan(1000000);
  await page.locator("#photos").setInputFiles(
    Array.from({ length: 6 }, (_, i) => ({
      name: `trip-${i}.jpg`,
      mimeType: "image/jpeg",
      buffer,
    })),
  );
  await expect(page.locator("#photo-previews img")).toHaveCount(6, {
    timeout: 15000,
  });
  await expect(page.locator("#form-status")).toContainText(
    "사진 6장이 준비됐어요",
  );
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = put;
      throw new DOMException("Simulated full storage", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "추억 저장하기" }).click();
  await expect(page.locator("#form-status")).toContainText("저장 공간이 부족");
  await expect(page.getByLabel("한 줄 제목")).toHaveValue("큰 사진 여섯 장");
  await expect(page.locator("#photo-previews img")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "추억 저장하기" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "추억 저장하기" }).click();
  await expect(page.locator(".memory img")).toHaveCount(6, { timeout: 15000 });
  await page.reload();
  await choose(page);
  await expect(page.locator(".memory img")).toHaveCount(6);
});

test("empty date shows an inline error instead of a silent native validation failure", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page);
  await page.locator("#new-record").click();
  await page.getByLabel("한 줄 제목").fill("날짜 확인");
  await page.getByLabel("방문 날짜").fill("");
  await page.locator("#save-record").click();
  await expect(page.locator("#form-status")).toContainText("방문 날짜");
  await expect(page.locator("#save-record")).toBeEnabled();
});

test("Pyeongtaek photo paints the actual puzzle interior, survives zoom/reload and clears on deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-place="province-31"]').click();
  await page.locator("#search").fill("평택시");
  const place = page.locator("[data-place]");
  const id = await place.getAttribute("data-place");
  await place.click();
  await page.locator("#new-record").click();
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 100;
    const x = c.getContext("2d");
    x.fillStyle = "rgb(220,40,60)";
    x.fillRect(0, 0, 100, 100);
    x.fillStyle = "rgb(40,100,220)";
    x.fillRect(100, 0, 100, 100);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator("#photos")
    .setInputFiles({
      name: "red-blue.png",
      mimeType: "image/png",
      buffer: Buffer.from(base64, "base64"),
    });
  await expect(page.locator("#photo-previews img")).toHaveCount(1);
  await page.locator("#save-record").click();
  await expect(page.locator(".memory img")).toHaveCount(1);
  const region = page.locator(`[data-region="${id}"]`);
  await expect
    .poll(() => region.evaluate((el) => getComputedStyle(el).fill))
    .toContain("photo-");
  await page.locator("#reset-map").click();
  await page.waitForTimeout(500);
  async function assertPaint() {
    const shot = await region.screenshot();
    const count = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const x = c.getContext("2d");
      x.drawImage(image, 0, 0);
      const rgba = x.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < rgba.length; i += 4)
        if (
          (Math.abs(rgba[i] - 220) < 12 &&
            Math.abs(rgba[i + 1] - 40) < 12 &&
            Math.abs(rgba[i + 2] - 60) < 12) ||
          (Math.abs(rgba[i] - 40) < 12 &&
            Math.abs(rgba[i + 1] - 100) < 12 &&
            Math.abs(rgba[i + 2] - 220) < 12)
        )
          count++;
      return count;
    }, shot.toString("base64"));
    expect(count).toBeGreaterThan(100);
  }
  await assertPaint();
  await page.locator("#zoom-in").click();
  await page.waitForTimeout(400);
  await assertPaint();
  await page.reload();
  await page.locator('[data-place="province-31"]').click();
  await assertPaint();
  await page.locator("#search").fill("평택시");
  await page.locator("[data-place]").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(region).toHaveAttribute("fill", "#fdfdf9");
  await expect(page.locator("#map defs pattern")).toHaveCount(0);
});
