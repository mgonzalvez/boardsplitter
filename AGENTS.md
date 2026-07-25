# BoardSplitter — Project Documentation

## Overview

BoardSplitter is a single-page web app that lets board game designers upload a large game board image (PDF, JPG, or PNG) and split it into printable pages (US Letter or A4). It's a web clone of the Mac app [SplitPrint](https://www.splitprint.com/), specialized for board game prototyping.

**Production URL:** `https://boardsplitter.gonzhome.us` (GitHub Pages)
**Repository:** `https://github.com/mgonzalvez/boardsplitter`
**Stack:** Vanilla HTML, CSS, JavaScript — no frameworks, no build step.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Single-page app: upload zone, settings panel, preview grid, export controls |
| `styles.css` | Light/dark design tokens, responsive desktop/tablet/phone layouts, and polished system-font UI |
| `app.js` | All application logic: file loading, tiling math, canvas preview, PDF/PNG/JPG export, JSON save/load |
| `test-board.png` | Demo hex-grid game board for testing (2400×1800px) |

## External Dependencies (CDN only, no npm)

| Library | Version | Purpose |
|---------|---------|---------|
| pdf.js | 3.11.174 | Render uploaded PDFs to canvas |
| jsPDF | 2.5.1 | Generate multipage PDF export |

Both loaded via CDN `<script>` tags in `index.html`. The pdf.js worker URL is set inline before `app.js` loads.

The application UI uses the system font stack; it does not require a font download.

## Core Architecture

### State Model (single source of truth)

```js
state = {
  sourceImage: null,       // HTMLImageElement of the loaded board
  originalWidthPx: 0,      // source image pixel width (never changes after load)
  originalHeightPx: 0,     // source image pixel height (never changes after load)
  dpi: 96,                 // dots per inch — SINGLE value ensures no stretching
  scalePercent: 100,       // percentage scale of the board (10-300%)
  boardUnit: 'in',         // display unit for board size inputs ('in' | 'cm')
  paperSize: 'letter',     // 'letter' (8.5×11) | 'a4' (210×297mm)
  orientation: 'portrait', // 'portrait' | 'landscape' (swaps paper dimensions)
  pageAreaMode: 'printable', // 'printable' | 'full' | 'bleed'
  marginUnit: 'in',        // display unit for margins/overlap ('in' | 'cm')
  marginTop: 0.25,         // in display units (converted to inches for math)
  marginRight: 0.25,
  marginBottom: 0.25,
  marginLeft: 0.25,
  overlap: 0,              // bleed between adjacent tiles (in display units)
  guideStyle: 'ticks',     // 'ticks' | 'border' | 'none'
  includeAssemblyKey: false,
  previewZoom: 1,          // UI-only preview scale (0.5–2.5)
}
```

### Critical Design: Single DPI = No Stretching

**This is the most important concept in the codebase.** Physical dimensions are *derived*, not stored:

```js
getPhysicalWidthIn()  = (originalWidthPx / dpi) * (scalePercent / 100)
getPhysicalHeightIn() = (originalHeightPx / dpi) * (scalePercent / 100)
```

Because both axes use the **same DPI value**, the physical aspect ratio always equals the pixel aspect ratio. This makes stretching mathematically impossible.

**Never store `physicalWidthIn` or `physicalHeightIn` as state.** They are always computed from DPI + scale.

### Tiling Math (used by preview and every export format)

```
paperW, paperH        = paper dimensions in inches (swapped for landscape)
printW                = paperW - marginLeft - marginRight
printH                = paperH - marginTop - marginBottom
effectiveW            = printW - overlapIn
effectiveH            = printH - overlapIn

cols                  = from gridColsInput (user-set) or ceil(physW / effectiveW) [fallback]
rows                  = from gridRowsInput (user-set) or ceil(physH / effectiveH) [fallback]

// Divide the board itself into equal core segments
corePxW               = originalWidthPx / cols
corePxH               = originalHeightPx / rows

// Add optional overlap symmetrically around every core segment
pxPerIn               = dpi * (scalePercent / 100)
overlapPx             = overlapIn * pxPerIn
slicePxW              = corePxW + overlapPx
slicePxH              = corePxH + overlapPx
sliceX[col]           = col * corePxW - overlapPx / 2
sliceY[row]           = row * corePxH - overlapPx / 2
```

**Key insight:** The board is partitioned into equal pieces before page whitespace is considered. A 24" × 17.1" board on a 3 × 2 grid therefore produces six equal 8" × 8.55" core segments. Each segment is drawn at its real physical size and placed toward its nearest assembly seam. Optional overlap expands every segment equally; source areas beyond the outside board edges remain white.

### Seam-Aware Page Placement

`getTilePlacementInches()` moves unused printable space to the outside perimeter of the assembled board:

- First column → align right, toward the next column
- Last column → align left, toward the previous column
- First row → align bottom, toward the next row
- Last row → align top, toward the previous row
- Interior rows/columns → center because they have seams on both sides
- A single row or column → center on that axis

This changes only placement within each sheet. It never changes source slicing, physical dimensions, scale, grid size, or overlap. Preview and all export formats must use the same placement object. Trim marks follow the actual non-overlap segment boundaries after placement.

### Page Area Modes

The `pageAreaMode` dropdown changes the usable dimensions supplied to all grid, preview, and PDF calculations:

| Mode | Margins | Overlap | Trim marks | Intended use |
|------|---------|---------|----------------|--------------|
| `printable` | Configured margins | Disabled | Available | Standard home/office printers |
| `full` | Forced to zero | Disabled | Hidden/disabled | Borderless printers or print-shop exports |
| `bleed` | Configured margins | Configured overlap | Available | Duplicate edge strips for trimming and assembly |

- **Printable Area** is the default.
- **Full Area** preserves configured margin values but temporarily ignores them, so switching back restores the user's settings.
- **Bleed / Overlap** expands every equal core segment by the overlap amount, split equally across both sides. Switching to Bleed initializes a zero overlap to 0.125".
- Only Bleed mode activates overlap in the geometry. A stored overlap value has no effect in Printable or Full Area mode.
- In Bleed mode, trim marks identify the non-overlap core segment so the duplicated strip can be trimmed away accurately.
- Full Area shows a borderless-printing warning because many physical printers cannot mark the entire sheet.

### DPI Calculation

DPI is calculated differently depending on the trigger:

```js
// From board width input (user specifies physical board size):
state.dpi = originalWidthPx / boardWidthIn

// From grid change (board rescales to fill the grid):
// Each tile = effective printable area (printW - overlap), not just printW
boardW = cols * effectiveW
boardH = rows * effectiveH
dpiForWidth = originalWidthPx / boardW
dpiForHeight = originalHeightPx / boardH
state.dpi = max(dpiForWidth, dpiForHeight)
```

The board width input sets an absolute physical size. Changing the grid rescales the board to fill the new grid (each tile = effective printable area).

### Preview Rendering (two-pass canvas)

Each tile is rendered to the preview grid as a canvas element:

1. **Pass 1:** Render the equal board segment at full source resolution. Only the destination canvas is downscaled when necessary (canvas size limit: 268,435,456 px total area, ~16384px per dimension per axis).
2. **Pass 2:** Scale down to display size via a second canvas. The preview canvas matches the **paper's aspect ratio** (e.g., 8.5/11 for letter). The image segment is drawn at its real physical size and placed toward its nearest assembly seam. Remaining white space moves to the board's outside perimeter.

The tile's div wrapper has explicit `style.width`/`style.height` matching the paper's AR. CSS `width: 100%; height: 100%` is NOT applied to the canvas (would stretch and distort).

This ensures the preview shows what will be in every export format, just smaller, while preserving both aspect ratio and physical scale.

### Preview Zoom

The preview header has zoom-out, percentage/reset, and zoom-in controls. `previewZoom` ranges from 0.5 to 2.5 in 0.25 steps. `getPreviewTileWidth()` applies that multiplier only to preview canvas/display dimensions. Zoom must never modify DPI, physical board dimensions, grid geometry, source slices, project data, or exported pages. The preview container scrolls when a zoomed layout exceeds its viewport.

### Export Formats (300 DPI)

`renderExportTileCanvas()` is the shared print renderer. Each page is rendered at 300 DPI with the equal board segment at its real physical dimensions, seam-aware placement, white page area, selected trim-mark style, and an `A1 · 1/N` coordinate label.

- **PDF** is the default and embeds every rendered tile canvas in jsPDF.
- **PNG tiles** encode the same canvases losslessly and download them in one ZIP.
- **JPG tiles** encode at quality 0.92 and download them in one ZIP.
- The ZIP writer is dependency-free and stores already-compressed image entries without recompressing them.

### Trim Mark Styles

`guideStyle` selects one of three treatments shared by preview, PDF, PNG, and JPG:

- `ticks` (default): short corner trim marks outside the core segment boundary
- `border`: the previous full red dashed trim rectangle
- `none`: no trim marks

Full Area hides the trim-style control and suppresses marks because its usable area already reaches the sheet edges.

### Assembly Key

The optional assembly key is deliberately one checkbox. When enabled, export adds one overview page/image before the tiles. The board overview is divided into the current grid and labeled `A1`, `A2`, `B1`, etc. Those labels match the preview badges, labels printed on exported tiles, and PNG/JPG filenames. Tile labels are drawn only in measured white space outside the rendered board rectangle. If even one tile lacks a safe label region, export stops with guidance instead of covering artwork. With the key disabled, no labels are drawn into exported pages. The key uses the selected paper dimensions but does not change tiling or add a page to the on-screen preview.

### File Loading

- **Images (JPG/PNG):** `FileReader.readAsDataURL()` → `Image.src = dataURL`
- **PNG physical size:** `getPngDpi()` reads the standard `pHYs` pixels-per-meter chunk. A 6000px-wide PNG tagged at 300 DPI therefore opens at 20", not the 62.5" produced by the old 96 DPI assumption.
- **Missing metadata:** Raster files without supported physical-resolution metadata use a 300 DPI print fallback and show `DPI assumed` beside their pixel dimensions. PDF-derived canvases retain their separate 96 DPI fallback. Board dimensions remain editable.
- **PDFs:** pdf.js renders each page to canvas at adaptive scale (capped at 4096px per dimension), combines vertically, then uses `canvas.toBlob()` → Blob URL as `Image.src`. **Never use `toDataURL` for PDFs** — the base64 string is too large and crashes the browser.

### Grid Inputs (two-way binding)

- **User changes cols/rows** → `applyGridSize()` rescales the board to exactly fill the new grid (DPI recalculated)
- **User changes other settings** (paper size, orientation, board dimensions, scale) → `updateGridInputs()` recalculates how many pages the current settings produce
- **User changes board width** → `updateFromWidthInput()` sets DPI from the specified physical width, recalculates grid from paper

### Find Best Layout

`findBestLayout()` compares the minimum valid portrait and landscape layouts for the current board dimensions, paper size, page-area mode, margins, and overlap.

Selection priority:

1. Fewest total pages
2. Least total white area across those pages
3. Current orientation when both results tie

The button may change only `state.orientation` and the grid column/row inputs. It must preserve DPI, scale percentage, and physical board dimensions. The result is reported below the button, for example: `Best layout: 3 × 2 portrait — 6 pages.`

### Save/Load (JSON)

- **Save:** Converts image to data URL (handles blob URLs via canvas re-encoding), serializes all state fields
- **Load:** Restores image + all settings, syncs UI. Supports legacy projects. Old `cuttingGuides` values migrate to `border` or `none`.
- **Version:** Current format is v5. Loading an older project converts saved millimeter display values to centimeters.

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Header: BoardSplitter + subtitle           │
├──────────┬──────────────────────────────────┤
│          │  Preview                         │
│ Settings │  ┌─────┬─────┬─────┐            │
│          │  │ A1  │ A2  │ A3  │            │
│ Board    │  ├─────┼─────┼─────┤            │
│ Size     │  │ B1  │ B2  │ B3  │            │
│ (W×H)    │  └─────┴─────┴─────┘            │
│          │                                  │
│ Grid     │  [PDF ▾] [Export PDF]            │
│ (cols×rows)                                │
│          │                                  │
│ Find Best│                                  │
│ Layout   │                                  │
│          │                                  │
│ Paper    │                                  │
│ Size     │                                  │
│          │                                  │
│ Page Area│                                  │
│ Mode     │                                  │
│          │                                  │
│ Orientation                                │
│ (portrait/landscape)                       │
│          │                                  │
│ Margins  │                                  │
│ (T/R/B/L)                                 │
│          │                                  │
│ Overlap  │                                  │
│          │                                  │
│ Trim     │                                  │
│ Marks    │                                  │
│ Assembly │                                  │
│ Key      │                                  │
│          │                                  │
│ Save/Load                                │
│ Change File                              │
└──────────┴──────────────────────────────────┘
```

Responsive: On tablet/phone, the sidebar stacks above the preview.

### Appearance and Responsive Layout

- `index.html` applies the saved theme before CSS loads to prevent a light/dark flash.
- The header theme button toggles `html[data-theme="light"|"dark"]`.
- The selection is stored as `localStorage["boardsplitter-theme"]`; first visit follows `prefers-color-scheme`.
- `styles.css` defines all semantic colors as custom properties for both themes. Avoid hard-coded UI colors outside the theme blocks; printed page canvases intentionally remain white.
- Desktop uses a sticky, independently scrollable settings panel beside the preview.
- At 900px and below, settings become a two-column grid above the preview.
- At 600px and below, settings become a single-column touch layout and export controls expand to full width.
- Interactive controls have at least 44px targets, with 48px targets on coarse-pointer devices.
- The preview retains horizontal/vertical scrolling at narrow widths rather than shrinking pages until they are unusable.
- Reduced-motion preferences suppress decorative transitions.

### Related Sites Menu

- The header contains a native `<details>` menu styled as a theme-aware pill and floating panel.
- It lists names only and opens each related site in a new tab with `noopener noreferrer`.
- Current links: PnPFinder, PnP Daily, PnP Launchpad, PnPTools, Card Prototyper, Card Extractor, Card Formatter, and Geeklist Generator.
- The full `Related Sites` label shortens to `Sites` below 380px.
- JavaScript closes the panel after choosing a site, clicking outside, or pressing Escape.
- Keep this list aligned with `https://pnpdaily.gonzhome.us/sites.html`; BoardSplitter itself is intentionally omitted because it is the current site.

### Footer

The footer mirrors PnP Daily with a 2026 Martin Gonzalvez copyright notice, a BoardSplitter-specific feedback email subject, and the Ko-fi support link. Footer links must remain legible in both themes.

## Running Locally

```bash
cd /Users/gonz/Desktop/websites/BoardSplitter
python3 -m http.server 8765
# Open http://localhost:8765

# Run the tiling regression tests
node --test tests/centering.test.js
```

## Deployment

BoardSplitter deploys directly from the `main` branch at `/ (root)` in `mgonzalvez/boardsplitter`. GitHub Pages is configured with **Deploy from a branch** because the app has no build step.

The production custom domain is `boardsplitter.gonzhome.us`:

- The repository-root `CNAME` file must contain `boardsplitter.gonzhome.us`.
- Cloudflare DNS must define `boardsplitter` as a CNAME targeting `mgonzalvez.github.io`.
- Keep the Cloudflare record **DNS only** (gray cloud); proxying it can interfere with GitHub’s domain validation and certificate provisioning.
- GitHub Pages **Enforce HTTPS** should be enabled after the certificate is available.

On 2026-07-25, public DNS resolvers returned the expected CNAME, GitHub reported the Pages build as complete with an approved certificate, and the production URL served the BoardSplitter application.

## Known Limitations / Future Work

- **JSON save** embeds the full image as base64 — large images (10MB+) produce very large project files.
- **PDF upload** renders at ~150 DPI; complex vector PDFs may lose some sharpness.
- **No image rotation or cropping** (by design).
- **JPEG DPI metadata is not yet detected**; JPEGs use the clearly labeled 300 DPI print assumption.
- **No browser print dialog** — exports are downloaded files.

## Common Bugs to Watch For

1. **Image stretching:** Always verify that source and destination aspect ratios match in `drawImage` calls. The single-DPI model prevents this, but any code that introduces separate X/Y DPI values will break it.

2. **Blob URLs in JSON:** When saving projects, always convert blob URLs back to data URLs via `getImageDataURL()`. Blob URLs don't survive page reloads.

3. **Grid inputs vs calculated values:** The render functions must read from `gridColsInput.value` / `gridRowsInput.value`, NOT recalculate cols/rows from physical dimensions. The user's grid setting is authoritative.

4. **Equal partitions:** Always derive core slices from `originalWidthPx / cols` and `originalHeightPx / rows`. Do not return to fixed page-sized source windows; that produces mostly empty trailing pages.

5. **Orientation swap:** `getPaperSizeInches()` swaps width/height for landscape. Any code that uses raw paper dimensions without going through this function will break in landscape mode.

6. **Canvas size limit:** Max canvas area is 268,435,456 px (~16384px per dimension). When exceeded, scale down only the destination canvas. Source coordinates must remain in original-image pixels.

7. **Board-size/grid interaction (active issue):** Board dimensions and grid inputs are both user-editable, but changing either one currently recalculates DPI and therefore changes the other. Image resolution itself does not change the page count when physical board size is fixed. Possible future interaction models:
   - **Option A:** Let user set DPI directly, derive board width from DPI
   - **Option B:** Make grid authoritative — DPI = `originalWidthPx / (cols × printW)`
   - **Option C:** Downscale imported images to a target DPI (e.g., 300) before processing

8. **Page-area mode consistency:** Grid calculation, preview, and all exports must use `getMarginsInches()` and `getOverlapInches()`. Do not read configured margins/overlap directly for rendering; Full Area must force both to zero and only Bleed may activate overlap.

9. **Best-layout invariant:** `findBestLayout()` must never update DPI, scale, or physical board dimensions. It compares orientations and applies only orientation plus grid rows/columns.

10. **Seam-aware placement:** Preview and `renderExportTileCanvas()` must both use `getTilePlacementInches()`. Do not independently center tiles in an export path. First/last tiles align toward their shared seam, while interior and single-axis tiles center.

11. **Export parity:** PDF, PNG, and JPG must all go through `renderExportTileCanvas()`. Keep labels and trim marks in that shared canvas rather than implementing format-specific drawing.

12. **Assembly labels:** Use `getPageLabel(row, col)` everywhere. Changing the label scheme independently in previews, tile canvases, filenames, or the assembly key will make the key misleading. `getSafeTileLabelLayout()` must return a region wholly outside the board draw rectangle; a missing safe region must abort export, never fall back to an overlay.

## Active Issues

### Image Centering — Board Not Centered in Preview Grid (RESOLVED 2026-07-25)

**Status:** Resolved by replacing fixed page-sized source windows with equal board partitions shared by preview and every export format. Default overlap is now zero, matching SplitPrint's “None” setting.

**Root cause:** The old renderer used fixed page-sized source windows and applied positive centering offsets to their source coordinates. That skipped the board's left/top content and pushed all unused grid capacity to the right/bottom. Even with the sign corrected, fixed windows would still produce unequal board pieces whenever the board dimensions were not exact multiples of the window size.

**Resolution:** `getTileGeometry()` now partitions the source image itself into equal columns and rows. Preview and `renderExportTileCanvas()` use those same fractional source rectangles. Each segment is drawn at its physical size using seam-aware placement. `drawSourceSlice()` clips source rectangles safely, including symmetric overlap that extends beyond an outside board edge.

**Regression case:** A 24" × 17.1" board with Letter paper, 0.25" margins, and zero overlap produces a 3 × 2 grid. Every core segment is 8" × 8.55", matching SplitPrint's behavior.

### Page Area Modes (IMPLEMENTED 2026-07-25)

**Status:** Printable Area, Full Area (Borderless), and Bleed / Overlap are implemented across grid calculation, preview, every export format, contextual controls, and project save/load.

**Regression coverage:** `tests/centering.test.js` verifies mode-specific margins, overlap, core trim guides, grid capacity, and contextual control visibility.

### Find Best Layout (IMPLEMENTED 2026-07-25)

**Status:** The former Optimize Grid control was replaced with Find Best Layout. It compares the minimum portrait and landscape grids, prioritizes page count and then total unused printable area, preserves board size, and reports the selected layout.

**Regression coverage:** `tests/centering.test.js` verifies a landscape win, physical-size preservation, and retention of the current orientation on an exact tie.

### Seam-Aware Placement (IMPLEMENTED 2026-07-25)

**Status:** Board segments are aligned toward neighboring pages so unused white space falls on the outer perimeter of the assembled board. Preview, every export format, and trim marks share the same per-tile placement geometry.

**Regression coverage:** `tests/centering.test.js` verifies first/last row and column alignment, Bleed trim-guide placement, and centering for interior tiles.

### Trim Marks, Assembly Key, and Image Export (IMPLEMENTED 2026-07-25)

**Status:** Corner trim marks, the legacy dashed border, and no-marks styles are available. PDF remains the default export. PNG and JPG tiles download as one ZIP. The optional assembly key adds a labeled overview matching `A1`-style preview badges, page labels, and image filenames. Labels render only in verified whitespace outside the board; export aborts if a safe region is unavailable. Project format v5 stores the trim style and assembly-key preference and uses inches/centimeters for display units.

**Regression coverage:** `tests/centering.test.js` verifies trim-mode behavior, Full Area suppression, coordinate labels, format UI, ZIP structure, and shared tile/key canvas dimensions.

### Embedded PNG DPI and Centimeter Units (IMPLEMENTED 2026-07-25)

**Status:** PNG imports honor a valid square-pixel `pHYs` resolution. Raster files without supported metadata use a labeled 300 DPI print fallback. Board and margin unit toggles now offer inches and centimeters; v5 project loading migrates legacy millimeter values without changing their physical size.

**Regression coverage:** `tests/centering.test.js` verifies that 11811 pixels/meter resolves to approximately 300 DPI and restores a 6000 × 4275 image to 20 × 14.25 inches.

### Light/Dark Theme and Responsive Polish (IMPLEMENTED 2026-07-25)

**Status:** A persistent accessible theme toggle, semantic light/dark design tokens, glass surfaces, improved hierarchy, focus states, and touch-friendly responsive layouts are implemented without changing the core workflow. Static CSS/JS references are cache-versioned.

**Regression coverage:** `tests/centering.test.js` verifies theme state, accessible toggle labels, document color scheme, and browser theme-color metadata.

### Related Sites Navigation (IMPLEMENTED 2026-07-25)

**Status:** A responsive theme-aware Related Sites pill in the header opens a polished names-only link panel containing PnP Daily and all seven sites currently published in Martin's PnP Sites directory.

**Regression coverage:** `tests/centering.test.js` verifies every destination, responsive menu styles, and Escape-to-close behavior.

### Preview Zoom (IMPLEMENTED 2026-07-25)

**Status:** The preview header provides a compact themed 50–250% zoom pill. The center percentage resets to 100%. The control remains touch-friendly on mobile and affects only on-screen canvas size.

**Regression coverage:** `tests/centering.test.js` verifies stepping, upper clamping, reset behavior, tile display scaling, and preservation of physical board dimensions.

### DPI Calculation — Board Width vs Grid Mismatch

**Symptom:** Changing a physical dimension recalculates the grid, while changing the grid rescales the physical board. This bidirectional behavior can feel surprising because both controls appear authoritative.

**Root cause:** `updateFromWidthInput()` makes physical board size authoritative, while `applyGridSize()` makes grid size authoritative. Both operations are mathematically valid but express different user intents through adjacent controls.

**Current code flow:**
1. `updateFromWidthInput(wIn)` → `state.dpi = originalWidthPx / wIn` → `updateGridInputs()` → grid from paper
2. `updateGridInputs()` → reads `getPhysicalWidthIn()` (uses current DPI) → `cols = ceil(physW / effectiveW)`
3. `renderPreview()` / shared export renderer → split the source into equal `originalWidthPx / cols` by `originalHeightPx / rows` core segments

**Key insight:** The DPI formula `originalWidthPx / boardWidthIn` is correct for setting physical board size, and grid calculation from paper dimensions is correct for determining how many pages are needed. At fixed physical size, source-image resolution cancels out of the page-count calculation.

**Possible fixes:**
- **Option A:** Let user set DPI directly, derive board width from DPI
- **Option B:** Make grid authoritative — DPI = `originalWidthPx / (cols × effectiveW)`
- **Option C:** Downscale imported images to a target DPI (e.g. 300) before processing
