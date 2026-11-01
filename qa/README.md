# Verification evidence

Verified locally on 2026-11-01 using Node.js 24.22.1, Playwright 1.63.0 / Chromium 153.0.8010.12, and axe-core 4.11.0.

- `npm run build`: passed. Both independent static sites copied to `dist/`; HTML local references verified.
- `node --check gpt-nagi/app.js` and `node --check gpt-umi/app.js`: passed.
- `npm test`: **29 passed**; complete results in [report.json](report.json).
- `npm run test:a11y`: **zero axe violations in 8 audited states**; results in [accessibility.json](accessibility.json). This is a targeted automated audit, not a claim of complete WCAG conformance.
- `git diff --check`: passed before commit.
- Manual visual review: desktop 1440×1000 and mobile 390×844 screenshots, full pages and hero crops. Checked typography, image crop, section rhythm, mobile wrapping, and modal layouts. QA found and corrected a mobile orphan character, a 1px overflow at 320px, insufficient secondary-text contrast, and Tab cycling at modal boundaries.

Responsive checks cover 320, 390, 768, 1024, 1440, and 1920px. Retina checks at 390 and 1440px verify responsive WebP selection at DPR 2. Interaction checks cover audio start/stop, scene and volume changes, product colors, native disclosures, mobile navigation, project filters, project and journal dialogs, validation and local form completion, focus indicators and restoration, Tab loops, Escape, and reduced motion.

Network observation found no failed responses, external runtime requests, or submitted form requests. Local storage remained empty. Forms do not send or persist data.

## Page weight

Measured with an empty browser context, DPR 1, after full-page screenshot capture. Values include decoded HTML, CSS, JS, loaded WebP, and WOFF2 fonts. The local server does not apply gzip/Brotli; these are not Lighthouse scores or a guarantee for every device.

| Page | 390px | 1440px |
| --- | --- | --- |
| NAGI | 189.5 KiB | 189.5 KiB |
| UMI | 327.6 KiB | 327.6 KiB |

The browser selects 768px photographs at these DPR 1 sizes. DPR 2 desktop uses the 1536px version. File sizes: NAGI 192.0 / 53.9 KiB; UMI 319.6 / 91.4 KiB (1536 / 768px). Source PNGs are excluded. Both pages reuse the image resource without an additional download when the same responsive source is selected.

## Screenshots

QA screenshots are generated locally in `qa/screenshots/` as PNG, with optional quality-90 WebP copies. The entire screenshot directory is gitignored; screenshots are not included in the final tracked tree or embedded in the PR. The local captures cover full pages, desktop/mobile heroes, project detail, and local form completion. Actual website images remain separately tracked under each site's `assets/` directory.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run dev
# In a second terminal:
npm run build
npm test
npm run test:a11y
# Optional, with cwebp installed:
npm run screenshots:webp
```

Verification was performed in Chromium. Physical mobile devices, Safari, Firefox, screen readers, and production hosting have not been tested.
