<p align="center">
  <img src="public/PixFormatLogo.webp" alt="Pixformat Logo" width="120">
</p>

<h1 align="center">Pixformat</h1>

<p align="center">
  Free, private, browser-based image converter.<br>
  Convert between WebP, PNG, JPEG, AVIF and more, entirely on the client side.<br>
  No uploads, no servers, no tracking of your files.
</p>

<p align="center">
  <a href="https://pixformat.com/"><strong>pixformat.com</strong></a>
</p>

---

## Features

**Format support.** Accepts JPEG, PNG, WebP, GIF, BMP, SVG as input. Outputs WebP, PNG, JPEG, and AVIF when the browser supports it.

**Batch processing.** Drop multiple files at once, convert them in parallel using a Web Worker pool sized to your CPU core count.

**Real-time stats.** See original size, converted size, and percentage saved for every image. Color-coded badges indicate green for savings, orange for increases.

**Quality tuned per codec.** WebP at 0.82 for perceptual transparency, JPEG at 0.85 for photographic fidelity, PNG lossless, AVIF at 0.65 for perceptual equivalence to WebP 0.82.

**Download options.** Download images individually or grab them all as a single ZIP archive.

**Fully accessible.** ARIA labels, live regions, keyboard navigation with Tab, Enter, Escape, Arrow keys. Focus management, screen reader announcements, respects `prefers-reduced-motion`.

**Zero dependencies at build time.** Pure vanilla JavaScript, HTML5, CSS3. JSZip is lazy-loaded from CDN only when downloading multiple files as ZIP.

**Privacy first.** Every conversion runs locally in your browser. Nothing leaves your machine.

---

## Tech Stack

| Technology | Details |
|------------|---------|
| **HTML5** | Semantic markup, structured data via JSON-LD, Open Graph and Twitter Card meta tags. |
| **CSS3** | Custom properties, Grid, Flexbox, responsive design, and mobile-first breakpoints. |
| **Vanilla JS, ES2019+** | Web Workers, OffscreenCanvas, async/await, Canvas API, Blob API, and drag-and-drop File API. |

---

## Getting Started

No build step required. Pixformat is a static single-page application.

### Clone the repository

```bash
git clone https://github.com/enekomtz1/Pixformat.git
cd Pixformat
```

### Run it

Open `index.html` directly in your browser by double-clicking the file. All conversions run locally, no server needed.

> **Note:** ZIP batch downloads require an internet connection because JSZip is lazy-loaded from a CDN. All other features work fully offline.

### For development, optional

If you prefer a local HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve
```

### Browser requirements

Modern browser with HTML5 Canvas support. Web Workers and OffscreenCanvas are optional. The app falls back to main-thread processing when unavailable.

---

## Project Structure

| File | Description |
|------|-------------|
| `index.html` | Main HTML file and single-page app entry point |
| `app.js` | Application logic, worker pool, and conversion engine |
| `styles.css` | Full styling, responsive layout, and animations |
| `robots.txt` | SEO crawl directives |
| `sitemap.xml` | Sitemap for pixformat.com |
| `public/PixFormatLogo.webp` | Logo in WebP format |
| `public/pixformat-icon.svg` | App icon in SVG format |

---

## How It Works

1. The user drops or selects image files through the drag-and-drop zone or file picker.
2. A pool of Web Workers, sized to `navigator.hardwareConcurrency`, processes conversions in parallel using OffscreenCanvas.
3. Each image is decoded with `createImageBitmap`, drawn to canvas, then encoded to the selected output format via `canvas.toBlob`.
4. Thumbnails, size stats, and status indicators update in real time as each conversion completes.
5. ZIP downloads are assembled client-side with JSZip. The library is lazy-loaded only when needed.

---

## Performance

Yield-to-main pattern via `scheduler.yield()` keeps tasks under 50ms to avoid blocking the UI.
Worker pool pre-warms during idle time with `requestIdleCallback`.
Deferred script loading for analytics, lazy loading for JSZip.
Canvas memory is freed after each conversion by zeroing width and height.
Object URLs are revoked after use to prevent memory leaks.

---

## License

MIT License

Copyright (c) 2026 Pixformat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files, the "Software", to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
