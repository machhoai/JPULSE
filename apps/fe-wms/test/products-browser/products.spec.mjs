import { test, expect } from "@playwright/test";

test.describe("touch interaction", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
  test("drag an image to the front using touch", async ({ page, context }) => {
    await edit(page);
    const before = await page
      .getByAltText("Ảnh sản phẩm 3", { exact: true })
      .getAttribute("src");
    const handle = page.getByRole("button", {
      name: "Di chuyển ảnh 3",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await page
      .getByRole("button", { name: "Di chuyển ảnh 1", exact: true })
      .boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x + 15, y: from.y + 15 }],
    });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + 15 + ((to.x - from.x) * step) / 12,
            y: from.y + 15 + ((to.y - from.y) * step) / 12,
          },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
    ).toHaveAttribute("src", before);
    const saved = await save(page);
    expect(saved.product_image_url[0]).toBe(before);
  });
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`detail gallery and metrics fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let oneImageWidth;
    for (const count of [1, 2, 8]) {
      await page.goto(`/?images=${count}`);
      const total = page.getByText("Tổng tồn", { exact: true });
      await expect(total).toBeVisible();
      const metric = total.locator("..");
      const bounds = await metric.boundingBox();
      expect(bounds.width).toBeGreaterThan(50);
      if (count === 1) oneImageWidth = bounds.width;
      else expect(Math.abs(bounds.width - oneImageWidth)).toBeLessThan(1);
      expect(
        await metric.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
      const images = page.getByAltText(/^Sản phẩm thử nghiệm/);
      await expect(images).toHaveCount(count === 1 ? 1 : count + 1);
      for (const el of await images.all()) {
        const box = await el.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await expect(
        page.getByRole("button", { name: "Sửa", exact: true }),
      ).toBeVisible();
      if (count === 8)
        await page.screenshot({
          path: `../../.tmp/product-detail-${width}.png`,
        });
    }
  });
}

test("detail edit action honors write permission", async ({ page }) => {
  await page.goto("/?readonly");
  await expect(page.getByText("Tổng tồn", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sửa", exact: true }),
  ).toHaveCount(0);
});

async function edit(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  await expect(
    page.getByText("Chỉnh sửa Sản phẩm", { exact: true }),
  ).toBeVisible();
}
async function save(page) {
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page.getByTestId("saved")).not.toBeEmpty();
  return JSON.parse(await page.getByTestId("saved").textContent());
}

test("drag existing image first, save, and reopen with the new primary", async ({
  page,
}) => {
  await edit(page);
  const before = await page
    .getByAltText("Ảnh sản phẩm 3", { exact: true })
    .getAttribute("src");
  const handle = page.getByRole("button", {
    name: "Di chuyển ảnh 3",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await page
    .getByRole("button", { name: "Di chuyển ảnh 1", exact: true })
    .boundingBox();
  await page.mouse.move(from.x + 15, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(to.x + 15, to.y + 15, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toHaveAttribute("src", before);
  const saved = await save(page);
  expect(saved.product_image_url[0]).toBe(before);
  await page.getByRole("button", { name: "Mở chi tiết", exact: true }).click();
  await expect(
    page.getByAltText("Sản phẩm thử nghiệm", { exact: true }),
  ).toHaveAttribute("src", before);
});

test("new and existing images share order on mobile and delete promotes the next image", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await edit(page);
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "new.png",
      mimeType: "image/png",
      buffer: Buffer.from("new-image"),
    },
    {
      name: "other.png",
      mimeType: "image/png",
      buffer: Buffer.from("other-image"),
    },
  ]);
  const handle = page.getByRole("button", {
    name: "Di chuyển ảnh 4",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("ArrowLeft");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("ArrowUp");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("Space");
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  const saved = await save(page);
  expect(saved.product_image_url[0]).toBe("/uploaded/new.png.webp");
  expect(saved.product_image_url.at(-1)).toBe("/uploaded/other.png.webp");
  await page.getByRole("button", { name: "Mở chi tiết", exact: true }).click();
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  const next = await page
    .getByAltText("Ảnh sản phẩm 2", { exact: true })
    .getAttribute("src");
  await page.getByRole("button", { name: "Xóa ảnh 1", exact: true }).click();
  await expect(
    page.getByAltText("Ảnh sản phẩm 1", { exact: true }),
  ).toHaveAttribute("src", next);
  const updated = await save(page);
  expect(updated.product_image_url[0]).toBe(next);
  expect(updated.product_image_url).toHaveLength(4);
});
