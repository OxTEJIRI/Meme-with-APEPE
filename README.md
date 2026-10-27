# Meme with APEPE

A green-and-black picture puzzle arcade created for @0xTEJIRI’s APEPE × BingX contest entry. Play at **https://meme-with-apepe.vercel.app/**.

APEPE points to **Generate meme image**. A random meme appears fully assembled for five visible seconds, then shuffles into a 3×3 or 4×4 puzzle. Tap two pieces to swap them, or drag one onto another. A corner thumbnail shows the original image and can be enlarged.

After 30 seconds without progress, one piece glows gold, its destination glows blue, and an arrow shows where it belongs. A manual hint is also available. Solving the puzzle reveals the complete meme and:

**MEME WITH APEPE. TRADE WITH BingX.**

The victory slogan plays in a prerecorded deep synthetic voice. The sound toggle controls the voice and subtle puzzle effects; the victory dialog also has a replay button. Audio is prepared on the player's first game click and delivered as an 80 KB MP3, with no speech service called during play. Voice source and processing details are in `dist/assets/audio/CREDITS.md`.

## Run locally

Requires Node.js 20 or newer. There are no runtime npm dependencies and no installation step.

```sh
npm run dev
```

Open the printed localhost URL. The optional local-only `/__preview` route displays the game in desktop and mobile viewports.

```sh
npm run check
npm run build
```

`check` validates JavaScript syntax and runs puzzle tests. `build` verifies all required files and 25 optimized WebP assets. The production-ready files are already in **dist/**.

## Hosting

Publish **dist/** as a static website. All assets use relative URLs and work at a domain root or a project subpath. Every image then loads from the host’s online URL; no player needs the source files or the creator’s computer.

For **Vercel**, import this GitHub repository and deploy. The included `vercel.json` selects the static framework, runs `npm run check && npm run build`, publishes **dist**, and enables long caching for the content-hashed meme filenames. No environment variables or paid image service are required. Keep the project’s Root Directory at the repository root.

Cloudflare Pages is also supported: choose **None** as the framework, use the same build command, and set the output directory to **dist**. Its `_headers` file carries the equivalent image caching rules. On Vercel, the build sets the social-preview image URL from Vercel’s production hostname when system environment variables are enabled. For other hosts, update `og:image` in `dist/index.html` when you switch public domains.

`.openai/hosting.json` also supports the registered Sites deployment. Its project ID is an identifier, not a secret. No API key or environment variable is needed by the game.

## Image delivery

- 25 original scenes, optimized to **1152 × 1152 WebP**.
- The meme bank totals **7.72 MB**, down from **72.51 MB** of source PNGs (89.4% smaller).
- Individual game images range from approximately **245–382 KB**.
- The welcome screen loads the optimized APEPE icon and pointing mascot. A round loads one selected meme and reuses that same URL for tiles, the guide, and the completed image.
- The five-second preview starts after the image is loaded and decoded. Preview and elapsed play time pause when the page is hidden or a help/guide dialog is open.
- Images are chosen from a shuffled deck, so all 25 appear before the deck repeats.

## Controls and accessibility

- Mouse/touch: tap two pieces, or drag and drop.
- Keyboard: Tab to a piece; Enter or Space selects it. Arrow keys move between positions. Escape clears the selection. H shows a hint.
- The game has no time limit. Elapsed time and swaps are informational.
- Reduced-motion preferences are respected.
- Completed-image progress is saved only in the current browser. The game works if browser storage is unavailable.

## Source layout

- `dist/index.html`, `dist/styles.css`: responsive interface and dialogs.
- `dist/app.mjs`: game flow, input, timer, hints, image loading, and progress.
- `dist/puzzle.mjs`: pure shuffle, swap, completion, and hint logic.
- `dist/sound.mjs`: user-gesture audio preparation, synthetic puzzle effects, victory playback and mute preference.
- `dist/memes.mjs`: numbered image bank.
- `dist/assets/`: optimized artwork and an image manifest.
- `tests/puzzle.test.mjs`: permutation, solvability, hint progress, and input-boundary tests.
- `scripts/serve.mjs`, `scripts/verify.mjs`: local preview and deployment verification.

## Artwork

The 25 meme scenes, pointing APEPE mascot, and neon-green face icon were generated with the built-in image_gen tool from character references supplied by the project owner. Original PNGs and generation prompts were delivered separately. This repository includes the optimized web versions and app icon sizes.

Fan-made contest project; no trading functionality, account connection, or payment flow is included.
