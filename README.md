# BoardSplitter

BoardSplitter is a browser-based tool for dividing a large board-game image into print-ready US Letter or A4 pages. It is inspired by SplitPrint and designed for board-game prototyping.

All processing happens locally in the browser. Uploaded board images and saved projects are not sent to a server.

## Features

- Import PNG, JPG, or PDF boards
- Switch between persistent light and dark appearances
- Open a themed Related Sites menu linking to the wider PnP tool collection
- Zoom the on-screen page layout from 50% to 250% without affecting exports
- Preserve physical dimensions from embedded PNG DPI metadata
- Set board dimensions in inches or centimeters
- Choose Printable Area, Full Area, or Bleed / Overlap
- Find the lowest-waste portrait or landscape layout
- Align segments toward assembly seams
- Use corner trim marks, a dashed trim border, or no marks
- Optionally include a labeled assembly-key page
- Export a multipage PDF or ZIP archive of PNG/JPG tiles
- Save and restore projects as JSON

## Use

1. Upload a PNG, JPG, or PDF.
2. Confirm the physical board dimensions.
3. Choose the grid, paper, page-area mode, margins, and trim marks.
4. Keep PDF selected for normal printing, or choose PNG/JPG tiles.
5. Export the finished pages.

PNG files with a standard physical-resolution (`pHYs`) chunk open at their embedded DPI. Raster files without supported resolution metadata use an indicated 300 DPI print fallback, so a 6000 × 4275 board opens at 20 × 14.25 inches.

## Run Locally

No build step or package installation is required.

```bash
python3 -m http.server 8765
```

Open <http://localhost:8765>.

Run the regression tests with:

```bash
node --test tests/centering.test.js
```

## Deploy to GitHub Pages

BoardSplitter is published from [mgonzalvez/boardsplitter](https://github.com/mgonzalvez/boardsplitter) using GitHub Pages:

- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/ (root)`
- Custom domain: [boardsplitter.gonzhome.us](https://boardsplitter.gonzhome.us)

BoardSplitter is fully static and requires no server-side application.

The repository’s root `CNAME` file contains `boardsplitter.gonzhome.us`. In Cloudflare DNS, the `boardsplitter` CNAME must target `mgonzalvez.github.io` and remain **DNS only** rather than proxied. After DNS and certificate validation finish in **Settings → Pages**, enable **Enforce HTTPS**.

## Dependencies

The app uses CDN-hosted scripts loaded by `index.html`:

- [PDF.js](https://mozilla.github.io/pdf.js/) for importing PDFs
- [jsPDF](https://github.com/parallax/jsPDF) for PDF export

All other functionality is implemented in vanilla HTML, CSS, and JavaScript.

The interface uses responsive layouts for desktop, tablet, and mobile. Settings become a two-column panel on tablets and a single touch-friendly flow on phones. Theme preference is stored locally in the browser.

The header’s Related Sites pill links to PnPFinder, PnP Daily, PnP Launchpad, PnPTools, Card Prototyper, Card Extractor, Card Formatter, and Geeklist Generator.

## Project Structure

- `index.html` — application interface
- `styles.css` — responsive styling
- `app.js` — import, layout, preview, export, and project persistence
- `tests/centering.test.js` — regression tests for tiling and export behavior
- `AGENTS.md` — detailed architecture and maintenance notes
