import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const out = resolve(import.meta.dirname, "..", "qa");
await mkdir(`${out}/screenshots`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  browser: browser.version(),
  checks: [],
  layouts: [],
  pageWeights: [],
};
const errors = [],
  requests = [];
async function check(name, fn) {
  await fn();
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function open(
  site,
  viewport = { width: 1440, height: 1000 },
  options = {},
) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    ...options,
  });
  page.on("pageerror", (e) => errors.push(`${site}: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method() }),
  );
  await page.goto(`http://127.0.0.1:4173/${site}/`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
try {
  for (const site of ["gpt-nagi", "gpt-umi"]) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const page = await open(site, {
        width,
        height: width < 760 ? 844 : 1000,
      });
      await check(`${site} ${width}px layout/assets/anchors`, async () => {
        const result = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          fonts: [...document.fonts].map((f) => ({
            family: f.family,
            status: f.status,
          })),
          images: [...document.images].map((i) => ({
            loaded: i.complete && i.naturalWidth > 0,
            source: i.currentSrc.split("/").pop(),
          })),
          badAnchors: [...document.querySelectorAll('a[href^="#"]')]
            .filter((a) => a.hash && !document.getElementById(a.hash.slice(1)))
            .map((a) => a.hash),
        }));
        assert.equal(result.width, result.scrollWidth);
        assert.ok(result.images.every((i) => i.loaded));
        assert.ok(result.fonts.every((f) => f.status === "loaded"));
        assert.deepEqual(result.badAnchors, []);
        report.layouts.push({ site, ...result });
      });
      if (width === 390 || width === 1440) {
        const name = width === 390 ? "mobile" : "desktop";
        await page.screenshot({
          path: `${out}/screenshots/${site}-${name}.png`,
          fullPage: true,
          animations: "disabled",
        });
        await page.screenshot({
          path: `${out}/screenshots/${site}-${name}-hero.png`,
          animations: "disabled",
        });
        report.pageWeights.push({
          site,
          width,
          ...(await page.evaluate(() => {
            const entries = performance.getEntriesByType("resource");
            const documentBytes =
              performance.getEntriesByType("navigation")[0].decodedBodySize;
            const resourceBytes = entries.reduce(
              (a, r) => a + r.decodedBodySize,
              0,
            );
            return {
              documentBytes,
              resourceBytes,
              totalBytes: documentBytes + resourceBytes,
              deviceScaleFactor: devicePixelRatio,
              external: entries
                .filter((r) => new URL(r.name).origin !== location.origin)
                .map((r) => r.name),
              resources: entries.map((r) => ({
                file: r.name.split("/").pop(),
                bytes: r.decodedBodySize,
              })),
            };
          })),
        });
      }
      if (width === 390) {
        await check(`${site} mobile menu and anchor navigation`, async () => {
          const m = page.locator(".menu-toggle");
          await m.click();
          assert.equal(await m.getAttribute("aria-expanded"), "true");
          await page.locator("#mobile-nav a").first().click();
          assert.equal(await m.getAttribute("aria-expanded"), "false");
          assert.ok(await page.locator("#mobile-nav").isHidden());
        });
      }
      await page.close();
    }
  }
  for (const site of ["gpt-nagi", "gpt-umi"])
    for (const width of [390, 1440]) {
      const page = await open(
        site,
        { width, height: 1000 },
        { deviceScaleFactor: 2 },
      );
      await check(`${site} ${width}px retina WebP selection`, async () => {
        const image = await page
          .locator(".hero img")
          .first()
          .evaluate((i) => ({
            source: i.currentSrc,
            loaded: i.complete && i.naturalWidth > 0,
          }));
        assert.ok(image.loaded);
        assert.ok(
          image.source.endsWith(width === 390 ? "768.webp" : "hero.webp"),
        );
        report.layouts.push({ site, width, deviceScaleFactor: 2, image });
      });
      await page.close();
    }
  const nagi = await open("gpt-nagi");
  await check(
    "NAGI color selection updates accessible state and image",
    async () => {
      await nagi
        .getByRole("button", { name: "チャコール", exact: true })
        .click();
      assert.equal(await nagi.locator("#color-name").textContent(), "Charcoal");
      assert.equal(
        await nagi.locator(".product-visual").getAttribute("data-color"),
        "charcoal",
      );
      assert.equal(
        await nagi
          .getByRole("button", { name: "チャコール", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await nagi
        .getByRole("button", { name: "クレイベージュ", exact: true })
        .click();
      assert.equal(
        await nagi.locator("#color-name").textContent(),
        "Clay Beige",
      );
    },
  );
  await check("NAGI WebAudio play, scene, volume, pause", async () => {
    await nagi
      .getByRole("button", { name: "環境音を再生", exact: true })
      .click();
    await nagi.waitForFunction(
      () =>
        document.querySelector(".play-button").getAttribute("aria-pressed") ===
        "true",
    );
    assert.equal(await nagi.evaluate(() => audio.state), "running");
    await nagi.locator("[data-scene=rain]").click();
    assert.equal(
      await nagi.locator("#track-name").textContent(),
      "雨の日の読書",
    );
    await nagi.locator("input[type=range]").fill("20");
    assert.equal(await nagi.locator("input[type=range]").inputValue(), "20");
    await nagi
      .getByRole("button", { name: "環境音を一時停止", exact: true })
      .click();
    assert.equal(
      await nagi.locator(".play-button").getAttribute("aria-pressed"),
      "false",
    );
  });
  await check("NAGI native FAQ keyboard expansion", async () => {
    const summary = nagi.locator(".faq summary").first();
    await summary.focus();
    await nagi.keyboard.press("Enter");
    assert.ok(
      (await nagi.locator(".faq details").first().getAttribute("open")) !==
        null,
    );
  });
  await check(
    "NAGI dialog focus trap, validation, demo completion and Escape",
    async () => {
      const opener = nagi.locator(".header [data-reserve]");
      await opener.click();
      const d = nagi.locator(".reserve-dialog");
      assert.ok(await d.isVisible());
      for (let i = 0; i < 12; i++) {
        await nagi.keyboard.press("Tab");
        assert.ok(
          await nagi.evaluate(() =>
            document
              .querySelector(".reserve-dialog")
              .contains(document.activeElement),
          ),
        );
      }
      await nagi.locator(".reserve-dialog form button").click();
      assert.ok(await nagi.locator(".form-success").isHidden());
      await nagi.locator("#reserve-email").fill("demo@example.com");
      await nagi.locator(".reserve-dialog form button").click();
      assert.ok(await nagi.locator(".form-success").isVisible());
      await nagi.screenshot({
        path: `${out}/screenshots/nagi-reservation-demo.png`,
      });
      await nagi.keyboard.press("Escape");
      assert.ok(await d.isHidden());
      assert.ok(await opener.evaluate((el) => el === document.activeElement));
    },
  );
  await nagi.close();
  const umi = await open("gpt-umi");
  await check("UMI motion pause and resume", async () => {
    const b = umi.locator(".motion-toggle");
    await b.click();
    assert.equal(await b.getAttribute("aria-pressed"), "true");
    assert.equal(
      await umi
        .locator(".ticker>div")
        .evaluate((e) => getComputedStyle(e).animationPlayState),
      "paused",
    );
    await b.click();
    assert.equal(await b.getAttribute("aria-pressed"), "false");
  });
  await check("UMI all project filters and reset", async () => {
    for (const filter of ["material", "community", "regeneration"]) {
      await umi.locator(`[data-filter=${filter}]`).click();
      assert.equal(await umi.locator(".project-card:visible").count(), 1);
      assert.equal(
        await umi
          .locator(".project-card:visible")
          .getAttribute("data-category"),
        filter,
      );
    }
    await umi.locator("[data-filter=all]").click();
    assert.equal(await umi.locator(".project-card:visible").count(), 3);
  });
  await check(
    "UMI project detail, journal and keyboard return focus",
    async () => {
      const opener = umi.locator("[data-project=forest]");
      await opener.click();
      assert.ok(await umi.locator(".detail-dialog").isVisible());
      assert.equal(
        await umi.locator("#detail-title").textContent(),
        "海の森を、もう一度。",
      );
      await umi.screenshot({
        path: `${out}/screenshots/umi-project-detail.png`,
      });
      await umi.keyboard.press("Escape");
      assert.ok(await opener.evaluate((e) => e === document.activeElement));
      await umi.locator('[data-journal="1"]').click();
      assert.equal(
        await umi.locator("#detail-title").textContent(),
        "素材のはじまりを、海に探して。",
      );
      await umi.keyboard.press("Escape");
      const step = umi.locator(".approach-steps details").nth(1);
      await step.locator("summary").focus();
      await umi.keyboard.press("Enter");
      assert.notEqual(await step.getAttribute("open"), null);
    },
  );
  await check(
    "UMI contact form validation, focus trap, demo completion",
    async () => {
      await umi.locator(".header-contact").click();
      const d = umi.locator(".contact-dialog");
      assert.ok(await d.isVisible());
      for (let i = 0; i < 16; i++) {
        await umi.keyboard.press("Tab");
        assert.ok(
          await umi.evaluate(() =>
            document
              .querySelector(".contact-dialog")
              .contains(document.activeElement),
          ),
        );
      }
      await umi.locator("form .form-submit").click();
      assert.ok(await umi.locator(".contact-success").isHidden());
      await umi.locator("[name=name]").fill("デモ 太郎");
      await umi.locator("[name=email]").fill("demo@example.com");
      await umi
        .locator("[name=message]")
        .fill("海藻素材の共同研究について相談したいです。");
      await umi.locator("form .form-submit").click();
      assert.ok(await umi.locator(".contact-success").isVisible());
      await umi.screenshot({ path: `${out}/screenshots/umi-contact-demo.png` });
      await umi.locator(".contact-success button").click();
      assert.ok(await d.isHidden());
    },
  );
  await umi.close();
  for (const site of ["gpt-nagi", "gpt-umi"]) {
    const page = await open(
      site,
      { width: 390, height: 844 },
      { reducedMotion: "reduce" },
    );
    await check(`${site} reduced motion and focus indicator`, async () => {
      const names = await page
        .locator(
          site === "gpt-nagi" ? ".waveform span" : ".radar-line,.ticker>div",
        )
        .evaluateAll((es) => es.map((e) => getComputedStyle(e).animationName));
      assert.ok(names.every((n) => n === "none"));
      await page.locator(".skip-link").focus();
      assert.equal(
        await page
          .locator(".skip-link")
          .evaluate((e) => getComputedStyle(e).outlineStyle),
        "solid",
      );
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    });
    await page.close();
  }
  for (const site of ["grok-lp", "grok-corporate"]) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const page = await open(site, {
        width,
        height: width < 760 ? 844 : 1000,
      });
      await check(`${site} ${width}px layout/assets/anchors`, async () => {
        const result = await page.evaluate(async () => {
          for (const img of document.images) {
            if (img.complete && img.naturalWidth > 0) continue;
            img.scrollIntoView({ block: "center" });
            const start = performance.now();
            while (
              (!img.complete || img.naturalWidth === 0) &&
              performance.now() - start < 4000
            ) {
              await new Promise((resolve) => setTimeout(resolve, 40));
            }
          }
          const images = [...document.images].map((img) => ({
            loaded: img.complete && img.naturalWidth > 0,
            naturalWidth: img.naturalWidth,
            source: (img.currentSrc || img.src).split("/").pop(),
          }));
          window.scrollTo(0, 0);
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            images,
            badAnchors: [...document.querySelectorAll('a[href^="#"]')]
              .filter((a) => a.hash && !document.getElementById(a.hash.slice(1)))
              .map((a) => a.hash),
          };
        });
        assert.equal(result.width, result.scrollWidth);
        assert.ok(result.images.every((img) => img.loaded));
        assert.deepEqual(result.badAnchors, []);
        report.layouts.push({ site, ...result });
      });
      await page.close();
    }
    const motion = await open(
      site,
      { width: 1440, height: 900 },
      { reducedMotion: "reduce" },
    );
    await check(`${site} reduced motion`, async () => {
      const names = await motion.evaluate(() => {
        const nodes = [
          ...document.querySelectorAll(".smoke, [data-rise]"),
        ];
        return nodes.map((node) => getComputedStyle(node).animationName);
      });
      assert.ok(names.every((name) => name === "none"));
    });
    await motion.close();
  }
  const corpNav = await open("grok-corporate", { width: 375, height: 812 });
  await check("grok-corporate mobile nav closes over the heading", async () => {
    const button = corpNav.locator(".nav-js");
    for (const href of ["#work", "#charts", "#company", "#news", "#jobs", "#contact"]) {
      await button.click();
      assert.equal(await button.getAttribute("aria-expanded"), "true");
      await corpNav.locator(`#site-nav a[href="${href}"]`).click();
      assert.equal(await button.getAttribute("aria-expanded"), "false");
      assert.equal(await corpNav.locator("#nav-toggle").isChecked(), false);
      const place = await corpNav.evaluate((id) => {
        const header = document.querySelector(".site-header").getBoundingClientRect();
        const heading = document.querySelector(`${id} h2`).getBoundingClientRect();
        return { headerBottom: header.bottom, headingTop: heading.top };
      }, href);
      assert.ok(
        place.headingTop >= place.headerBottom - 1,
        `${href} heading ${place.headingTop} is above header ${place.headerBottom}`,
      );
    }
  });
  await corpNav.close();
  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto("http://127.0.0.1:4173/grok-corporate/", {
    waitUntil: "networkidle",
  });
  await check("grok-corporate menu works without JavaScript", async () => {
    await noJsPage.locator("label[for=nav-toggle]").click();
    assert.equal(await noJsPage.locator("#nav-toggle").isChecked(), true);
    assert.ok(await noJsPage.locator("#site-nav a[href='#jobs']").isVisible());
  });
  await noJs.close();
  await check(
    "No runtime errors, failed responses, external or submitted requests",
    async () => {
      assert.deepEqual(errors, []);
      assert.ok(
        requests.every(
          (r) => r.method === "GET" && new URL(r.url).hostname === "127.0.0.1",
        ),
      );
      assert.ok(report.pageWeights.every((p) => p.external.length === 0));
    },
  );
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(`Verified ${report.checks.length} checks. Report: qa/report.json`);
