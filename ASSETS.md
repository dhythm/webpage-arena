# Assets and provenance

## Generated photography

Both photographs were created for these fictional brands with the built-in `image_gen.imagegen` tool through the imagegen skill. No API credential was created or used. The original 1536×1024 PNGs remain outside the repository in the isolated task workspace; only optimized WebP is shipped.

### NAGI — final prompt

> Use case: product-mockup. Asset type: premium Japanese fictional audio brand website hero photography. Create a beautiful 1536x1024 landscape studio editorial photograph, no text. A single small sculptural portable speaker: rounded vertical capsule form of matte ivory ceramic, very fine perforated front grille, simple circular brushed aluminium dial on its right side, small terracotta fabric carrying loop on the top. Resting on a warm travertine plinth on the right half of the image, warm beige seamless background, late afternoon sunlight from top left casts a strong diagonal shadow, subtle analogue film grain, exceptionally realistic tactile industrial design, understated Japanese lifestyle magazine art direction. Camera three quarter front view. Product occupies central right two thirds and is fully visible with breathing space, warm chalk, oatmeal and pale sand palette. No logos, no letters, no watermarks, no UI.

Delivered: `gpt-nagi/assets/nagi-hero.webp` (1536×1024, quality 88) and `nagi-hero-768.webp` (768×512, quality 86).

### UMI — final prompt

> Use case: photorealistic-natural. Asset type: fictional Japanese marine regeneration research company website visual. Landscape 1536x1024 fine art editorial underwater photograph of a lush flowing kelp forest in clear deep blue ocean, tall ribbons of copper green kelp suspended in the water, sunlight descends diagonally from surface top right with bright shimmering refraction and silvery microbubbles, extreme cobalt and ultramarine blue water with bright chartreuse kelp edges. Shot from underwater looking slightly upward. Sculptural seaweed stems in foreground right, deep blue negative space left and middle. Beautiful vivid high-contrast scientific expedition photography, slight film grain, not illustration. No divers, no animals, no text, no watermarks, no logos.

Delivered: `gpt-umi/assets/kelp-hero.webp` (1536×1024, quality 88) and `kelp-hero-768.webp` (768×512, quality 86).

Encoding: `cwebp -q 88 source.png -o hero.webp` and `cwebp -resize 768 0 -q 86 source.png -o hero-768.webp`. Transparent vector logos, diagrams, and icons remain SVG/CSS; they were not rasterized. Review screenshots are encoded separately as WebP quality 90.

## Fonts

WOFF2 subsets downloaded from Google Fonts with the complete page text and relevant JS strings. `scripts/fetch-fonts.py` reproduces the subsets, requires network access, and is a development-only utility. The public websites are completely self-contained.

- [Manrope](https://fonts.google.com/specimen/Manrope), SIL Open Font License 1.1: `gpt-nagi/assets/LICENSE-Manrope.txt`.
- [Zen Old Mincho](https://fonts.google.com/specimen/Zen+Old+Mincho), SIL Open Font License 1.1: `gpt-nagi/assets/LICENSE-ZenOldMincho.txt`.
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), SIL Open Font License 1.1: `gpt-umi/assets/LICENSE-SpaceGrotesk.txt`.
- [Noto Sans JP](https://fonts.google.com/specimen/Noto+Sans+JP), SIL Open Font License 1.1: `gpt-umi/assets/LICENSE-NotoSansJP.txt`.

If the Japanese copy is changed, rerun the subset generator to include new glyphs. System fallback fonts are also configured.

## Original code-native visuals and audio

NAGI and UMI logotypes, favicons, the audio waveform, observation diagram, material rings, and community wave graphic were authored in SVG/CSS/JS for this project. NAGI's demo audio is synthesized locally with filtered noise and a quiet sine oscillator using Web Audio; there are no third-party recordings or audio files.
