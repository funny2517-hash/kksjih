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
async function add(
  page,
  title = "우리의 첫 여행",
  photo = true,
  photoBuffer = tiny,
) {
  await page.getByRole("button", { name: "새로운 추억 남기기" }).click();
  await page.getByLabel("한 줄 제목").fill(title);
  await page
    .getByLabel("여행 메모")
    .fill("함께 걸었던 골목 <script>alert(1)</script>");
  if (photo) {
    await page.locator("#photos").setInputFiles({
      name: "trip.png",
      mimeType: "image/png",
      buffer: photoBuffer,
    });
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
  await expect(page.locator(".markers .rest-marker")).toHaveCount(128);
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
  expect(count).toBeLessThan(128);
  await expect(page.locator(".markers .rest-marker")).toHaveCount(count);
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
  await page.locator("#photos").setInputFiles({
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

test("square rest stop opens separate up/down photo journals and preserves original record directions", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-place]").first().waitFor();
  const records = ["rest-4", "rest-5"].map((target, i) => ({
    id: "legacy-rest-" + i,
    target,
    date: "2026-10-17",
    title: i ? "하행 추억" : "상행 추억",
    memo: "기존 기록",
    photos: [],
  }));
  await page.locator("#restore-file").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "our-korea-map", version: 1, records }),
    ),
  });
  await page.locator("#confirm-restore").click();
  await expect(page.locator("#rest-count")).toHaveText("1");
  await page.getByRole("tab", { name: "휴게소", exact: true }).click();
  await expect(page.locator(".rest-marker")).toHaveCount(128);
  await expect(page.locator('.rest-marker[data-shape="square"]')).toHaveCount(
    82,
  );
  await expect(page.locator('.rest-marker[data-shape="circle"]')).toHaveCount(
    46,
  );
  await page.locator("#search").fill("함안");
  const marker = page.locator('[data-rest="rest-4"]');
  await expect(marker).toHaveAttribute("data-shape", "square");
  await marker.click();
  await expect(page.getByRole("tab", { name: /상행.*부산/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".memory")).toHaveCount(1);
  await expect(page.locator(".memory")).toContainText("상행 추억");
  await expect(page.locator(".memory")).not.toContainText("하행 추억");
  await page.getByRole("tab", { name: /하행.*순천/ }).click();
  await expect(page.locator(".memory")).toHaveCount(1);
  await expect(page.locator(".memory")).toContainText("하행 추억");
  const blue = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 40;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, 64, 40);
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await add(page, "하행 사진", true, blue);
  await expect(page.locator(".memory")).toHaveCount(2);
  await page.getByRole("tab", { name: /상행.*부산/ }).click();
  await add(page, "상행 사진");
  await expect(page.locator(".memory")).toHaveCount(2);
  await expect(page.locator("#record-list")).not.toContainText("하행 사진");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backup").click();
  const download = await downloadPromise;
  const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  const up = backup.records.find((r) => r.title === "상행 사진"),
    down = backup.records.find((r) => r.title === "하행 사진");
  expect(up.target).toBe("rest-4");
  expect(down.target).toBe("rest-5");
  expect(up.photos[0]).not.toBe(down.photos[0]);
  await page
    .locator(".memory")
    .filter({ hasText: "상행 추억" })
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "방문 방향", exact: true })
    .selectOption("rest-5");
  await page.locator("#save-record").click();
  await expect(page.getByRole("tab", { name: /하행.*순천/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".memory")).toHaveCount(3);
  await page.locator("#new-record").click();
  await page.getByLabel("여행 메모").fill("저장하지 않은 메모");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("tab", { name: /상행.*부산/ }).click();
  await expect(page.getByRole("tab", { name: /하행.*순천/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("여행 메모")).toHaveValue("저장하지 않은 메모");
  page.once("dialog", (d) => d.accept());
  await page.locator("#cancel-editor").click();
  await page.reload();
  await page.getByRole("tab", { name: "휴게소", exact: true }).click();
  await page.locator("#search").fill("함안");
  await page.locator("[data-place]").click();
  await expect(page.locator(".memory")).toHaveCount(1);
  await expect(page.locator(".memory")).toContainText("상행 사진");
  await page.getByRole("tab", { name: /하행.*순천/ }).click();
  await expect(page.locator(".memory")).toHaveCount(3);
  await expect(page.locator(".memory img")).toHaveCount(1);
  await expect(page.locator("#rest-count")).toHaveText("1");
  await page.screenshot({
    path: "/tmp/kksjih-direction-tabs.png",
    fullPage: true,
  });
});

test("district labels remain legible at fixed screen size without collisions when zoomed or resized", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-place="province-11"]').click();
  async function inspect() {
    return page.locator(".labels text").evaluateAll((labels) =>
      labels.map((el) => {
        const box = el.getBoundingClientRect();
        const matrix = el.getScreenCTM();
        return {
          name: el.textContent,
          size:
            parseFloat(getComputedStyle(el).fontSize) *
            Math.hypot(matrix.a, matrix.b),
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
        };
      }),
    );
  }
  function check(labels) {
    expect(labels.length).toBeGreaterThan(6);
    for (const label of labels) {
      expect(label.size).toBeCloseTo(12, 1);
      expect(label.name).toMatch(/구$/);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i],
          b = labels[j];
        expect(
          a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y,
        ).toBe(false);
      }
  }
  check(await inspect());
  await page.locator("#zoom-in").click();
  await page.waitForTimeout(400);
  check(await inspect());
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(200);
  check(await inspect());
  await page.screenshot({ path: "/tmp/kksjih-labels.png", fullPage: true });
});

test("Ulleung and Dokdo use distinct true positions and Dokdo remains in bounds through navigation and zoom", async ({
  page,
}) => {
  await page.goto("/");
  const u = page.locator('[data-island="ulleung"]'),
    d = page.locator('[data-island="dokdo"]');
  await expect(u).toBeVisible();
  await expect(d).toBeVisible();
  async function positions() {
    const [up, dp] = await Promise.all([
      u.evaluate((el) => ({
        x: +el.dataset.mapX,
        y: +el.dataset.mapY,
        lng: +el.dataset.longitude,
        lat: +el.dataset.latitude,
      })),
      d.evaluate((el) => ({
        x: +el.dataset.mapX,
        y: +el.dataset.mapY,
        lng: +el.dataset.longitude,
        lat: +el.dataset.latitude,
      })),
    ]);
    expect(dp.x).toBeGreaterThan(up.x);
    expect(dp.y).toBeGreaterThan(up.y);
    expect(dp.lng).toBeGreaterThan(131.86);
    expect(dp.lng).toBeLessThan(131.88);
    expect(dp.lat).toBeGreaterThan(37.23);
    expect(dp.lat).toBeLessThan(37.25);
  }
  await positions();
  await page.screenshot({
    path: "/tmp/kksjih-dokdo-national.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await d.click();
  await expect(page.locator("#map-breadcrumb")).toContainText("경상북도");
  await expect(page.locator(".detail-heading h2")).toContainText("독도");
  await expect(page.locator("#new-record")).toBeVisible();
  await expect(d).toBeVisible();
  await positions();
  await d.click();
  await expect(page.locator(".detail-heading h2")).toContainText("독도");
  await expect(page.locator(".detail-heading .eyebrow")).toContainText(
    "울릉군",
  );
  await expect(page.locator("#new-record")).toBeVisible();
  await page.locator("#reset-map").click();
  await page.waitForTimeout(500);
  await positions();
  await page.screenshot({
    path: "/tmp/kksjih-dokdo-gyeongbuk.png",
    fullPage: true,
  });
  await page.locator("#labels").uncheck();
  await expect(page.locator(".island-callouts g")).toHaveCount(0);
  await page.locator("#labels").check();
  await expect(d).toBeVisible();
});

test("single click on Dokdo label or native shortcuts immediately opens a record panel, including touch", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.locator('[data-island="dokdo"] text').click();
  await expect(page.locator(".detail-heading h2")).toContainText("독도");
  await expect(page.locator("#new-record")).toBeVisible();
  await expect(page.locator("#notice")).toContainText("독도를 선택");
  await page.locator('[data-island-open="ulleung"]').click();
  await expect(page.locator(".detail-heading h2")).toContainText("울릉도");
  await page.locator('[data-island-open="dokdo"]').click();
  await page.locator("#new-record").click();
  await expect(page.getByLabel("한 줄 제목")).toHaveValue("독도 여행");
  await page.getByLabel("여행 메모").fill("독도에서 본 바다");
  page.once("dialog", (d) => d.dismiss());
  await page.locator('[data-island-open="ulleung"]').click();
  await expect(page.locator(".detail-heading h2")).toContainText("독도");
  await expect(page.getByLabel("여행 메모")).toHaveValue("독도에서 본 바다");
  await page.locator("#save-record").click();
  await expect(page.locator(".memory")).toContainText("독도에서 본 바다");
  await expect(page.locator("#region-count")).toHaveText("1");
  await page.screenshot({
    path: "/tmp/kksjih-dokdo-click.png",
    fullPage: true,
  });
  const touch = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  try {
    const p = await touch.newPage();
    await p.goto("http://127.0.0.1:5173");
    await p.locator('[data-island="dokdo"] circle').tap();
    await expect(p.locator(".detail-heading h2")).toContainText("독도");
    await p.locator('[data-island-open="ulleung"]').tap();
    await expect(p.locator(".detail-heading h2")).toContainText("울릉도");
  } finally {
    await touch.close();
  }
});
