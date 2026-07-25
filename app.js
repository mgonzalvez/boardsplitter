/* ===== BoardSplitter — Main Application Logic ===== */

// Paper sizes in points (1 pt = 1/72 inch)
const PAPER_SIZES = {
  letter: { widthIn: 8.5, heightIn: 11, label: 'US Letter' },
  a4:     { widthMm: 210, heightMm: 297, label: 'A4' },
};

// Conversion constants
const MM_PER_IN = 25.4;
const CM_PER_IN = 2.54;
const PT_PER_IN = 72;

// App state
let state = {
  sourceImage: null,       // HTMLImageElement of the loaded board
  originalWidthPx: 0,      // source image pixel width
  originalHeightPx: 0,     // source image pixel height
  dpi: 96,                 // dots per inch — single value ensures no stretching
  scalePercent: 100,       // percentage scale of the board (10-300%)
  boardUnit: 'in',         // 'in' | 'cm' for board size inputs
  paperSize: 'letter',     // 'letter' | 'a4'
  orientation: 'portrait', // 'portrait' | 'landscape'
  pageAreaMode: 'printable', // 'printable' | 'full' | 'bleed'
  marginUnit: 'in',        // 'in' | 'cm'
  marginTop: 0.25,         // in display units
  marginRight: 0.25,
  marginBottom: 0.25,
  marginLeft: 0.25,
  overlap: 0,              // in display units
  guideStyle: 'ticks',     // 'ticks' | 'border' | 'none'
  includeAssemblyKey: false,
  previewZoom: 1,          // UI-only preview scale; never affects export
};

/** Derived physical width in inches (from DPI + scale) */
function getPhysicalWidthIn() {
  return (state.originalWidthPx / state.dpi) * (state.scalePercent / 100);
}

/** Derived physical height in inches (from DPI + scale) */
function getPhysicalHeightIn() {
  return (state.originalHeightPx / state.dpi) * (state.scalePercent / 100);
}

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);

const dropZone = $('#drop-zone');
const fileInput = $('#file-input');
const workspace = $('#workspace');
const uploadSection = $('#upload-section');
const themeToggle = $('#theme-toggle');
const themeColorMeta = $('#theme-color-meta');
const relatedSitesMenu = $('#related-sites-menu');

const boardWidthInput = $('#board-width');
const boardHeightInput = $('#board-height');
const btnBoardInches = $('#btn-board-inches');
const btnBoardCm = $('#btn-board-cm');
const scaleSlider = $('#scale-slider');
const scaleValueLabel = $('#scale-value');
const gridColsInput = $('#grid-cols');
const gridRowsInput = $('#grid-rows');

const paperSizeSelect = $('#paper-size');
const pageAreaModeSelect = $('#page-area-mode');
const pageAreaHelp = $('#page-area-help');
const btnPortrait = $('#btn-portrait');
const btnLandscape = $('#btn-landscape');

const marginUnitControl = $('#margin-unit-control');
const marginInputsControl = $('#margin-inputs-control');
const overlapControl = $('#overlap-control');
const trimStyleControl = $('#trim-style-control');
const btnInches = $('#btn-inches');
const btnCm = $('#btn-cm');
const marginTopInput = $('#margin-top');
const marginRightInput = $('#margin-right');
const marginBottomInput = $('#margin-bottom');
const marginLeftInput = $('#margin-left');
const overlapInput = $('#overlap');
const guideStyleSelect = $('#guide-style');
const includeAssemblyKeyCheckbox = $('#include-assembly-key');

const previewContainer = $('#preview-container');
const pageInfo = $('#page-info');
const btnZoomOut = $('#btn-zoom-out');
const btnZoomReset = $('#btn-zoom-reset');
const btnZoomIn = $('#btn-zoom-in');
const zoomValue = $('#zoom-value');
const btnExport = $('#btn-export');
const exportFormatSelect = $('#export-format');
const exportLabel = $('#export-label');
const exportHelp = $('#export-help');
const btnOptimize = $('#btn-optimize');
const layoutResult = $('#layout-result');
const btnSave = $('#btn-save');
const btnLoad = $('#btn-load');
const loadInput = $('#load-input');
const btnChangeFile = $('#btn-change-file');

// ===== Utility Functions =====

/** Convert display units to inches */
function toInches(value) {
  return state.marginUnit === 'cm' ? value / CM_PER_IN : value;
}

/** Convert inches to display units */
function fromInches(value) {
  return state.marginUnit === 'cm' ? value * CM_PER_IN : value;
}

/** Get paper dimensions in inches (swapped for landscape) */
function getPaperSizeInches(orientation = state.orientation) {
  let dims;
  if (state.paperSize === 'letter') {
    dims = PAPER_SIZES.letter;
  } else {
    const a4 = PAPER_SIZES.a4;
    dims = { widthIn: a4.widthMm / MM_PER_IN, heightIn: a4.heightMm / MM_PER_IN };
  }

  // Swap for landscape orientation
  if (orientation === 'landscape') {
    return { widthIn: dims.heightIn, heightIn: dims.widthIn };
  }
  return dims;
}

/** Get the configured margins in inches, regardless of page-area mode */
function getConfiguredMarginsInches() {
  return {
    top: toInches(state.marginTop),
    right: toInches(state.marginRight),
    bottom: toInches(state.marginBottom),
    left: toInches(state.marginLeft),
  };
}

/** Get margins used by the active page-area mode */
function getMarginsInches() {
  if (state.pageAreaMode === 'full') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return getConfiguredMarginsInches();
}

/** Get the configured overlap in inches, regardless of page-area mode */
function getConfiguredOverlapInches() {
  return toInches(state.overlap);
}

/** Overlap is active only in Bleed / Overlap mode */
function getOverlapInches() {
  return state.pageAreaMode === 'bleed' ? getConfiguredOverlapInches() : 0;
}

function shouldDrawCuttingGuides() {
  return state.guideStyle !== 'none' && state.pageAreaMode !== 'full';
}

/** Format number for display */
function fmtNum(n, decimals = 1) {
  return Number(n.toFixed(decimals));
}

/** Human-friendly tile coordinate: A1, A2, B1, and so on. */
function getPageLabel(row, col) {
  let rowNumber = row + 1;
  let rowLabel = '';
  while (rowNumber > 0) {
    rowNumber--;
    rowLabel = String.fromCharCode(65 + (rowNumber % 26)) + rowLabel;
    rowNumber = Math.floor(rowNumber / 26);
  }
  return `${rowLabel}${col + 1}`;
}

/** Add either a dashed trim border or compact corner trim marks to a preview tile. */
function appendPreviewGuides(tile, placement, paper) {
  if (!shouldDrawCuttingGuides()) return;

  const left = (placement.guideLeft / paper.widthIn) * 100;
  const right = ((placement.guideLeft + placement.guideWidth) / paper.widthIn) * 100;
  const top = (placement.guideTop / paper.heightIn) * 100;
  const bottom = ((placement.guideTop + placement.guideHeight) / paper.heightIn) * 100;

  if (state.guideStyle === 'border') {
    const guides = document.createElement('div');
    guides.className = 'cutting-guides';
    guides.style.setProperty('--guide-top', top + '%');
    guides.style.setProperty('--guide-bottom', (100 - bottom) + '%');
    guides.style.setProperty('--guide-left', left + '%');
    tile.appendChild(guides);

    const leftGuide = document.createElement('div');
    leftGuide.className = 'cutting-guides-left';
    leftGuide.style.setProperty('--guide-left', left + '%');
    tile.appendChild(leftGuide);

    const rightGuide = document.createElement('div');
    rightGuide.className = 'cutting-guides-right';
    rightGuide.style.setProperty('--guide-left', (100 - right) + '%');
    tile.appendChild(rightGuide);
    return;
  }

  const marks = document.createElement('div');
  marks.className = 'trim-marks';

  const addMark = (axis, x, y) => {
    const mark = document.createElement('span');
    mark.className = `trim-mark ${axis}`;
    mark.style.left = x;
    mark.style.top = y;
    marks.appendChild(mark);
  };

  // Horizontal marks stop at the trim boundary; vertical marks do the same.
  addMark('horizontal', `calc(${left}% - 9px)`, `calc(${top}% - 0.75px)`);
  addMark('horizontal', `${right}%`, `calc(${top}% - 0.75px)`);
  addMark('horizontal', `calc(${left}% - 9px)`, `calc(${bottom}% - 0.75px)`);
  addMark('horizontal', `${right}%`, `calc(${bottom}% - 0.75px)`);
  addMark('vertical', `calc(${left}% - 0.75px)`, `calc(${top}% - 9px)`);
  addMark('vertical', `calc(${right}% - 0.75px)`, `calc(${top}% - 9px)`);
  addMark('vertical', `calc(${left}% - 0.75px)`, `${bottom}%`);
  addMark('vertical', `calc(${right}% - 0.75px)`, `${bottom}%`);

  tile.appendChild(marks);
}

// ===== Appearance =====

function getCurrentTheme() {
  return document.documentElement?.dataset?.theme === 'dark' ? 'dark' : 'light';
}

function syncThemeControl() {
  const theme = getCurrentTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
  themeToggle.title = `Switch to ${nextTheme} mode`;
  if (themeColorMeta) {
    themeColorMeta.content = theme === 'dark' ? '#090b10' : '#f4f7fb';
  }
}

function setTheme(theme, persist = true) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  if (persist) {
    try {
      window.localStorage.setItem('boardsplitter-theme', normalized);
    } catch (err) {
      // Theme still applies when storage is unavailable.
    }
  }
  syncThemeControl();
}

themeToggle.addEventListener('click', () => {
  setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
});
syncThemeControl();

document.addEventListener('click', (event) => {
  if (relatedSitesMenu.open && !relatedSitesMenu.contains(event.target)) {
    relatedSitesMenu.open = false;
  }
});

relatedSitesMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    relatedSitesMenu.open = false;
    relatedSitesMenu.querySelector('summary')?.focus();
  }
});

document.querySelectorAll('.related-sites-panel a').forEach(link => {
  link.addEventListener('click', () => {
    relatedSitesMenu.open = false;
  });
});

// ===== Preview Zoom =====

const PREVIEW_ZOOM_MIN = 0.5;
const PREVIEW_ZOOM_MAX = 2.5;
const PREVIEW_ZOOM_STEP = 0.25;

function syncPreviewZoomControl() {
  const percent = Math.round(state.previewZoom * 100);
  zoomValue.textContent = `${percent}%`;
  btnZoomOut.disabled = state.previewZoom <= PREVIEW_ZOOM_MIN;
  btnZoomIn.disabled = state.previewZoom >= PREVIEW_ZOOM_MAX;
}

function setPreviewZoom(value) {
  const stepped = Math.round(value / PREVIEW_ZOOM_STEP) * PREVIEW_ZOOM_STEP;
  state.previewZoom = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, stepped));
  syncPreviewZoomControl();
  renderPreview();
}

btnZoomOut.addEventListener('click', () => {
  setPreviewZoom(state.previewZoom - PREVIEW_ZOOM_STEP);
});

btnZoomReset.addEventListener('click', () => {
  setPreviewZoom(1);
});

btnZoomIn.addEventListener('click', () => {
  setPreviewZoom(state.previewZoom + PREVIEW_ZOOM_STEP);
});

syncPreviewZoomControl();

// ===== File Upload Handling =====

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

btnChangeFile.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    loadPDF(file);
  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    loadImage(file);
  } else {
    alert('Unsupported file type. Please upload a PDF, JPG, or PNG.');
  }
}

/**
 * Read a PNG pHYs chunk and convert pixels-per-meter to DPI.
 * Returns null when the PNG has no trustworthy square-pixel resolution.
 */
function getPngDpi(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < signature.length || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  const view = new DataView(arrayBuffer);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.length) return null;

    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (type === 'pHYs' && length >= 9) {
      const pixelsPerMeterX = view.getUint32(dataOffset, false);
      const pixelsPerMeterY = view.getUint32(dataOffset + 4, false);
      const unitIsMeters = bytes[dataOffset + 8] === 1;
      if (!unitIsMeters || pixelsPerMeterX <= 0 || pixelsPerMeterY <= 0) return null;

      const dpiX = pixelsPerMeterX * 0.0254;
      const dpiY = pixelsPerMeterY * 0.0254;
      const difference = Math.abs(dpiX - dpiY) / Math.max(dpiX, dpiY);
      if (difference > 0.01) return null;

      const dpi = (dpiX + dpiY) / 2;
      return dpi >= 10 && dpi <= 2400 ? dpi : null;
    }

    offset = nextOffset;
  }

  return null;
}

async function getEmbeddedImageDpi(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'png') return null;

  try {
    return getPngDpi(await file.arrayBuffer());
  } catch (err) {
    console.warn('Could not read embedded image resolution:', err);
    return null;
  }
}

async function loadImage(file) {
  const embeddedDpi = await getEmbeddedImageDpi(file);
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img, file.name, embeddedDpi, 300);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Determine a safe render scale based on page size to avoid OOM
  const firstPage = await pdf.getPage(1);
  const defaultViewport = firstPage.getViewport({ scale: 1.0 });

  // Cap combined image at ~4000px in each dimension to avoid OOM
  const MAX_DIM = 4096;
  let scale = 2.0; // start with good quality
  const estimatedTotalHeight = defaultViewport.height * pdf.numPages;
  if (defaultViewport.width > MAX_DIM || estimatedTotalHeight > MAX_DIM) {
    scale = Math.min(
      MAX_DIM / defaultViewport.width,
      MAX_DIM / estimatedTotalHeight
    );
  }
  scale = Math.max(0.5, Math.min(scale, 2.0));

  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
  }

  // Combine all pages vertically
  const totalHeight = pages.reduce((sum, p) => sum + p.height, 0);
  const maxWidth = Math.max(...pages.map(p => p.width));

  const combined = document.createElement('canvas');
  combined.width = maxWidth;
  combined.height = totalHeight;
  const ctx = combined.getContext('2d');

  let yOffset = 0;
  for (const page of pages) {
    ctx.drawImage(page, 0, yOffset);
    yOffset += page.height;
  }

  // Use Blob URL instead of data URL to avoid massive base64 strings
  combined.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img, file.name);
    };
    img.src = url;
  }, 'image/png');
}

function resolveImportDpi(embeddedDpi, assumedDpi = 96) {
  return Number.isFinite(embeddedDpi) && embeddedDpi > 0
    ? embeddedDpi
    : assumedDpi;
}

function onImageLoaded(img, filename, embeddedDpi = null, assumedDpi = 96) {
  state.sourceImage = img;
  state.originalWidthPx = img.naturalWidth;
  state.originalHeightPx = img.naturalHeight;

  // Raster board artwork defaults to print-ready 300 DPI when metadata is
  // missing. PDF rendering supplies the legacy 96 DPI fallback separately.
  state.dpi = resolveImportDpi(embeddedDpi, assumedDpi);
  state.scalePercent = 100;

  // Populate board size inputs from derived dimensions
  updateBoardSizeInputs();

  // Reset scale slider
  scaleSlider.value = state.scalePercent;
  scaleValueLabel.textContent = state.scalePercent;

  // Sync grid inputs
  updateGridInputs();

  // Show image pixel dimensions
  const imageInfo = $('#image-info');
  const imageDims = $('#image-dims');
  const dpiLabel = embeddedDpi
    ? `${fmtNum(state.dpi, 1)} DPI`
    : `${fmtNum(state.dpi, 1)} DPI assumed`;
  imageDims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${dpiLabel}`;
  imageInfo.classList.remove('hidden');

  // Show workspace, hide upload
  uploadSection.classList.add('hidden');
  workspace.classList.remove('hidden');

  renderPreview();
}

// ===== Scale & DPI Logic (single DPI = no stretching) =====

/** Update board size inputs from current derived dimensions */
function updateBoardSizeInputs() {
  const wIn = getPhysicalWidthIn();
  const hIn = getPhysicalHeightIn();
  const decimals = 2;
  if (state.boardUnit === 'cm') {
    boardWidthInput.value = fmtNum(wIn * CM_PER_IN, decimals);
    boardHeightInput.value = fmtNum(hIn * CM_PER_IN, decimals);
  } else {
    boardWidthInput.value = fmtNum(wIn, decimals);
    boardHeightInput.value = fmtNum(hIn, decimals);
  }
}

/** Recalculate DPI from a user-entered width (height follows via aspect ratio) */
function updateFromWidthInput() {
  const w = parseFloat(boardWidthInput.value) || 0;
  const wIn = state.boardUnit === 'cm' ? w / CM_PER_IN : w;
  if (wIn <= 0) return;

  // Update height input to maintain aspect ratio
  const hIn = (state.originalHeightPx / state.originalWidthPx) * wIn;
  if (state.boardUnit === 'cm') {
    boardHeightInput.value = fmtNum(hIn * CM_PER_IN, 2);
  } else {
    boardHeightInput.value = fmtNum(hIn, 2);
  }

  // DPI set purely from image and board width (independent of grid)
  state.dpi = state.originalWidthPx / wIn;

  // Calculate grid from paper tile size (uses the correct DPI now)
  updateGridInputs();

  renderPreview();
}

/** Recalculate DPI from a user-entered height (width follows via aspect ratio) */
function updateFromHeightInput() {
  const h = parseFloat(boardHeightInput.value) || 0;
  const hIn = state.boardUnit === 'cm' ? h / CM_PER_IN : h;
  if (hIn <= 0) return;

  // Update width input to maintain aspect ratio
  const wIn = (state.originalWidthPx / state.originalHeightPx) * hIn;
  if (state.boardUnit === 'cm') {
    boardWidthInput.value = fmtNum(wIn * CM_PER_IN, 2);
  } else {
    boardWidthInput.value = fmtNum(wIn, 2);
  }

  // DPI set purely from image and board width (independent of grid)
  state.dpi = state.originalWidthPx / wIn;

  // Calculate grid from paper tile size (now uses correct DPI)
  updateGridInputs();

  renderPreview();
}

// ===== Board Size Input Helpers =====

function setBoardUnit(unit) {
  state.boardUnit = unit;

  btnBoardInches.classList.toggle('active', unit === 'in');
  btnBoardCm.classList.toggle('active', unit === 'cm');

  // Update step
  const step = '0.01';
  boardWidthInput.step = step;
  boardHeightInput.step = step;

  updateBoardSizeInputs();
}

// ===== Settings Change Handlers =====

// Board size unit toggle
btnBoardInches.addEventListener('click', () => setBoardUnit('in'));
btnBoardCm.addEventListener('click', () => setBoardUnit('cm'));

// Board size inputs (maintain aspect ratio)
// updateFromWidthInput/HeightInput already call updateGridInputs internally
boardWidthInput.addEventListener('input', () => updateFromWidthInput());
boardHeightInput.addEventListener('input', () => updateFromHeightInput());

// Scale slider
scaleSlider.addEventListener('input', () => {
  state.scalePercent = parseInt(scaleSlider.value) || 100;
  scaleValueLabel.textContent = state.scalePercent;
  updateBoardSizeInputs();
  updateGridInputs();
  renderPreview();
});

// Grid size inputs — changing cols/rows auto-scales the board to fit
gridColsInput.addEventListener('input', () => applyGridSize());
gridRowsInput.addEventListener('input', () => applyGridSize());

function applyGridSize() {
  clearLayoutResult();

  const cols = Math.max(1, parseInt(gridColsInput.value) || 1);
  const rows = Math.max(1, parseInt(gridRowsInput.value) || 1);

  const paper = getPaperSizeInches();
  const margins = getMarginsInches();
  const overlapIn = getOverlapInches();

  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;
  const effectiveW = printW - overlapIn;
  const effectiveH = printH - overlapIn;

  if (effectiveW <= 0 || effectiveH <= 0) return;

  // Board rescales to fill the new grid (each tile = effective printable area)
  const boardW = cols * effectiveW;
  const boardH = rows * effectiveH;
  const dpiForWidth = state.originalWidthPx / boardW;
  const dpiForHeight = state.originalHeightPx / boardH;
  state.dpi = Math.max(dpiForWidth, dpiForHeight);
  state.scalePercent = 100;

  // Update UI
  scaleSlider.value = state.scalePercent;
  scaleValueLabel.textContent = state.scalePercent;
  updateBoardSizeInputs();
  renderPreview();
}

/** Sync grid inputs from current DPI (called after other settings change) */
function updateGridInputs() {
  clearLayoutResult();

  const paper = getPaperSizeInches();
  const margins = getMarginsInches();
  const overlapIn = getOverlapInches();

  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;
  const effectiveW = printW - overlapIn;
  const effectiveH = printH - overlapIn;

  if (effectiveW <= 0 || effectiveH <= 0) return;

  const physW = getPhysicalWidthIn();
  const physH = getPhysicalHeightIn();

  gridColsInput.value = Math.max(1, Math.ceil(physW / effectiveW));
  gridRowsInput.value = Math.max(1, Math.ceil(physH / effectiveH));
}

function clearLayoutResult() {
  layoutResult.textContent = '';
  layoutResult.classList.add('hidden');
}

/** Calculate the minimum-page layout for one paper orientation. */
function getLayoutForOrientation(orientation) {
  const paper = getPaperSizeInches(orientation);
  const margins = getMarginsInches();
  const overlapIn = getOverlapInches();
  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;
  const effectiveW = printW - overlapIn;
  const effectiveH = printH - overlapIn;

  if (effectiveW <= 0 || effectiveH <= 0) return null;

  const physW = getPhysicalWidthIn();
  const physH = getPhysicalHeightIn();
  const cols = Math.max(1, Math.ceil(physW / effectiveW));
  const rows = Math.max(1, Math.ceil(physH / effectiveH));
  const pages = cols * rows;

  // Actual white space in the exported pages. In Bleed mode, the duplicated
  // strip is image area rather than waste.
  const tileW = physW / cols + overlapIn;
  const tileH = physH / rows + overlapIn;
  const whiteArea = Math.max(0, pages * (printW * printH - tileW * tileH));

  return { orientation, cols, rows, pages, whiteArea };
}

/** Compare portrait and landscape without changing physical board dimensions. */
function findBestLayout() {
  const candidates = ['portrait', 'landscape']
    .map(getLayoutForOrientation)
    .filter(Boolean);

  if (!candidates.length) return null;

  return candidates.reduce((best, candidate) => {
    if (candidate.pages !== best.pages) {
      return candidate.pages < best.pages ? candidate : best;
    }

    const whiteDifference = candidate.whiteArea - best.whiteArea;
    if (Math.abs(whiteDifference) > 1e-9) {
      return whiteDifference < 0 ? candidate : best;
    }

    // Avoid an unnecessary orientation change when both layouts are equal.
    if (candidate.orientation === state.orientation) return candidate;
    return best;
  });
}

btnOptimize.addEventListener('click', () => {
  if (!state.sourceImage) return;

  const best = findBestLayout();
  if (!best) return;

  // Deliberately preserve DPI, scale, and physical board dimensions.
  state.orientation = best.orientation;
  btnPortrait.classList.toggle('active', best.orientation === 'portrait');
  btnLandscape.classList.toggle('active', best.orientation === 'landscape');
  gridColsInput.value = best.cols;
  gridRowsInput.value = best.rows;

  const orientationLabel = best.orientation === 'portrait' ? 'portrait' : 'landscape';
  layoutResult.textContent = `Best layout: ${best.cols} × ${best.rows} ${orientationLabel} — ${best.pages} page${best.pages === 1 ? '' : 's'}.`;
  layoutResult.classList.remove('hidden');

  renderPreview();
});

paperSizeSelect.addEventListener('change', () => {
  state.paperSize = paperSizeSelect.value;
  updateGridInputs();
  renderPreview();
});

pageAreaModeSelect.addEventListener('change', () => {
  state.pageAreaMode = pageAreaModeSelect.value;

  // Give Bleed mode a useful starting value without discarding a value the
  // user configured previously.
  if (state.pageAreaMode === 'bleed' && getConfiguredOverlapInches() <= 0) {
    state.overlap = fromInches(0.125);
    overlapInput.value = fmtNum(state.overlap, state.marginUnit === 'in' ? 3 : 2);
  }

  syncPageAreaUI();
  updateGridInputs();
  renderPreview();
});

function syncPageAreaUI() {
  const isFull = state.pageAreaMode === 'full';
  const isBleed = state.pageAreaMode === 'bleed';

  pageAreaModeSelect.value = state.pageAreaMode;
  marginUnitControl.classList.toggle('hidden', isFull);
  marginInputsControl.classList.toggle('hidden', isFull);
  overlapControl.classList.toggle('hidden', !isBleed);
  trimStyleControl.classList.toggle('hidden', isFull);

  if (isFull) {
    pageAreaHelp.textContent = 'Uses the entire sheet. A borderless printer is required to avoid clipped edges.';
    pageAreaHelp.classList.add('warning');
  } else if (isBleed) {
    pageAreaHelp.textContent = 'Duplicates a strip across adjacent tiles for easier trimming and assembly.';
    pageAreaHelp.classList.remove('warning');
  } else {
    pageAreaHelp.textContent = 'Keeps every board segment inside the margins below.';
    pageAreaHelp.classList.remove('warning');
  }
}

// Orientation toggle
btnPortrait.addEventListener('click', () => setOrientation('portrait'));
btnLandscape.addEventListener('click', () => setOrientation('landscape'));

function setOrientation(orient) {
  if (state.orientation === orient) return;
  state.orientation = orient;

  btnPortrait.classList.toggle('active', orient === 'portrait');
  btnLandscape.classList.toggle('active', orient === 'landscape');

  updateGridInputs();
  renderPreview();
}

btnInches.addEventListener('click', () => setUnit('in'));
btnCm.addEventListener('click', () => setUnit('cm'));

function setUnit(unit) {
  if (state.marginUnit === unit) return;

  // Convert existing values before switching
  const marginsIn = getConfiguredMarginsInches();
  const overlapIn = getConfiguredOverlapInches();

  state.marginUnit = unit;

  // Update displayed values
  state.marginTop = fromInches(marginsIn.top);
  state.marginRight = fromInches(marginsIn.right);
  state.marginBottom = fromInches(marginsIn.bottom);
  state.marginLeft = fromInches(marginsIn.left);
  state.overlap = fromInches(overlapIn);

  // Update UI
  btnInches.classList.toggle('active', unit === 'in');
  btnCm.classList.toggle('active', unit === 'cm');

  // Update input values and step
  const step = '0.01';
  [marginTopInput, marginRightInput, marginBottomInput, marginLeftInput].forEach(input => {
    input.step = step;
  });
  overlapInput.step = step;

  marginTopInput.value = fmtNum(state.marginTop, 2);
  marginRightInput.value = fmtNum(state.marginRight, 2);
  marginBottomInput.value = fmtNum(state.marginBottom, 2);
  marginLeftInput.value = fmtNum(state.marginLeft, 2);
  overlapInput.value = fmtNum(state.overlap, unit === 'in' ? 3 : 2);

  // Update unit labels
  document.querySelectorAll('.overlap-unit').forEach(el => el.textContent = unit);

  // Effective area in inches hasn't changed, but grid inputs may need sync
  updateGridInputs();
  renderPreview();
}

// Margin inputs (changing margins affects effective area → recalc grid)
[marginTopInput, marginRightInput, marginBottomInput, marginLeftInput].forEach((input, i) => {
  input.addEventListener('input', () => {
    const keys = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
    state[keys[i]] = parseFloat(input.value) || 0;
    updateGridInputs();
    renderPreview();
  });
});

overlapInput.addEventListener('input', () => {
  state.overlap = parseFloat(overlapInput.value) || 0;
  updateGridInputs();
  renderPreview();
});

guideStyleSelect.addEventListener('change', () => {
  state.guideStyle = guideStyleSelect.value;
  renderPreview();
});

includeAssemblyKeyCheckbox.addEventListener('change', () => {
  state.includeAssemblyKey = includeAssemblyKeyCheckbox.checked;
});

exportFormatSelect.addEventListener('change', () => {
  const format = exportFormatSelect.value;
  exportLabel.textContent = format === 'pdf' ? 'Export PDF' : `Export ${format.toUpperCase()} Tiles`;
  exportHelp.classList.toggle('hidden', format === 'pdf');
});

// ===== Preview Rendering =====

/**
 * Return equal board partitions for the current grid.
 *
 * The grid determines where the board is cut: every column owns the same
 * fraction of the board width and every row owns the same fraction of the
 * board height. Optional overlap is then added symmetrically around each
 * partition. This avoids the old fixed-page-window behavior where the last
 * column/row contained only the board remainder.
 */
function getTileGeometry(cols, rows) {
  const pxPerIn = state.dpi * (state.scalePercent / 100);
  const overlapIn = getOverlapInches();
  const corePxW = state.originalWidthPx / cols;
  const corePxH = state.originalHeightPx / rows;
  const overlapPx = overlapIn * pxPerIn;

  return {
    corePxW,
    corePxH,
    overlapPx,
    slicePxW: corePxW + overlapPx,
    slicePxH: corePxH + overlapPx,
    sliceWIn: getPhysicalWidthIn() / cols + overlapIn,
    sliceHIn: getPhysicalHeightIn() / rows + overlapIn,
  };
}

/**
 * Place content toward its nearest assembly seam.
 *
 * The first tile moves toward the next tile, the last tile moves toward the
 * previous tile, and interior/single tiles remain centered.
 */
function getSeamAlignedStart(areaStart, areaSize, contentSize, index, count) {
  const spare = Math.max(0, areaSize - contentSize);
  if (count <= 1 || (index > 0 && index < count - 1)) {
    return areaStart + spare / 2;
  }
  return index === 0 ? areaStart + spare : areaStart;
}

/**
 * Shared preview/PDF placement and guide geometry for one tile.
 */
function getTilePlacementInches(col, row, cols, rows, paper, margins, geometry) {
  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;
  const overlapIn = getOverlapInches();
  const drawLeft = getSeamAlignedStart(
    margins.left,
    printW,
    geometry.sliceWIn,
    col,
    cols
  );
  const drawTop = getSeamAlignedStart(
    margins.top,
    printH,
    geometry.sliceHIn,
    row,
    rows
  );

  return {
    drawLeft,
    drawTop,
    drawWidth: geometry.sliceWIn,
    drawHeight: geometry.sliceHIn,
    guideLeft: drawLeft + overlapIn / 2,
    guideTop: drawTop + overlapIn / 2,
    guideWidth: getPhysicalWidthIn() / cols,
    guideHeight: getPhysicalHeightIn() / rows,
  };
}

/**
 * Draw a source rectangle while preserving transparent/white padding when the
 * requested rectangle extends beyond the source image.
 */
function drawSourceSlice(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh) {
  const sourceLeft = Math.max(0, sx);
  const sourceTop = Math.max(0, sy);
  const sourceRight = Math.min(state.originalWidthPx, sx + sw);
  const sourceBottom = Math.min(state.originalHeightPx, sy + sh);

  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return;

  const scaleX = dw / sw;
  const scaleY = dh / sh;
  const clippedW = sourceRight - sourceLeft;
  const clippedH = sourceBottom - sourceTop;

  ctx.drawImage(
    image,
    sourceLeft,
    sourceTop,
    clippedW,
    clippedH,
    dx + (sourceLeft - sx) * scaleX,
    dy + (sourceTop - sy) * scaleY,
    clippedW * scaleX,
    clippedH * scaleY
  );
}

function getPreviewTileWidth(cols) {
  const baseTileWidth = Math.min(
    200,
    Math.max(80, (previewContainer.clientWidth - 40) / cols)
  );
  return Math.max(40, Math.round(baseTileWidth * state.previewZoom));
}

function renderPreview() {
  if (!state.sourceImage) return;

  const physW = getPhysicalWidthIn();
  const physH = getPhysicalHeightIn();

  // Validate board dimensions
  if (physW <= 0 || physH <= 0) {
    previewContainer.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Please enter the physical dimensions of your game board.</p>';
    pageInfo.textContent = '';
    return;
  }

  const paper = getPaperSizeInches();
  const margins = getMarginsInches();
  const overlapIn = getOverlapInches();

  // Printable area per page (in inches)
  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;

  if (printW <= 0 || printH <= 0) {
    previewContainer.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Margins are too large for this paper size.</p>';
    return;
  }

  // Effective printable area per tile (accounting for overlap)
  const effectiveW = printW - overlapIn;
  const effectiveH = printH - overlapIn;

  if (effectiveW <= 0 || effectiveH <= 0) {
    previewContainer.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Overlap is too large for the printable area.</p>';
    return;
  }

  // Use user-specified grid size (from inputs), falling back to calculated
  const cols = Math.max(1, parseInt(gridColsInput.value) || Math.ceil(physW / effectiveW));
  const rows = Math.max(1, parseInt(gridRowsInput.value) || Math.ceil(physH / effectiveH));

  // Update page info
  const boardUnitLabel = state.boardUnit === 'cm' ? 'cm' : 'in';
  const boardWDisplay = state.boardUnit === 'cm'
    ? fmtNum(physW * CM_PER_IN, 2)
    : fmtNum(physW, 2);
  const boardHDisplay = state.boardUnit === 'cm'
    ? fmtNum(physH * CM_PER_IN, 2)
    : fmtNum(physH, 2);
  const pageAreaLabel = {
    printable: 'Printable area',
    full: 'Full area',
    bleed: 'Bleed / overlap',
  }[state.pageAreaMode];

  pageInfo.innerHTML = `
    <span>${cols} &times; ${rows} grid — ${cols * rows} page${cols * rows !== 1 ? 's' : ''}</span>
    <span style="margin-left:0.75rem;">Board: ${boardWDisplay} &times; ${boardHDisplay} ${boardUnitLabel}</span>
    <span style="margin-left:0.75rem;">${pageAreaLabel}</span>
  `;

  // Divide the board itself into equal segments. Page whitespace is added
  // around those segments rather than represented as empty source windows.
  const geometry = getTileGeometry(cols, rows);

  // Build preview grid using canvas-based rendering (memory efficient)
  // Each tile in the preview grid represents one printed page.
  // The tile div has explicit dimensions matching the paper's aspect ratio.
  // The image slice is placed toward the nearest assembly seam.
  const paperAR = paper.widthIn / paper.heightIn;
  const maxTileWidth = getPreviewTileWidth(cols);
  const tileDisplayHeight = maxTileWidth / paperAR;

  // Create grid container
  previewContainer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'preview-grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${maxTileWidth}px)`;
  previewContainer.appendChild(grid);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Equal board partition, expanded by half the overlap on every side.
      const sliceX = col * geometry.corePxW - geometry.overlapPx / 2;
      const sliceY = row * geometry.corePxH - geometry.overlapPx / 2;
      const sliceW = geometry.slicePxW;
      const sliceH = geometry.slicePxH;
      const placement = getTilePlacementInches(
        col,
        row,
        cols,
        rows,
        paper,
        margins,
        geometry
      );

      // Pass 1: Render at full source resolution (downscale only if hitting canvas limits)
      const MAX_CANVAS_PX = 16384;
      const maxCanvasArea = 268435456;
      const tileArea = sliceW * sliceH;
      let renderW = Math.max(1, Math.round(sliceW));
      let renderH = Math.max(1, Math.round(sliceH));

      if (tileArea > maxCanvasArea || sliceW > MAX_CANVAS_PX || sliceH > MAX_CANVAS_PX) {
        // Apply BOTH area and dimension constraints
        const areaScale = Math.sqrt(maxCanvasArea / tileArea);
        const dimScale = Math.min(MAX_CANVAS_PX / sliceW, MAX_CANVAS_PX / sliceH);
        const renderScale = Math.min(areaScale, dimScale);
        renderW = Math.max(1, Math.round(sliceW * renderScale));
        renderH = Math.max(1, Math.round(sliceH * renderScale));
      }

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = renderW;
      fullCanvas.height = renderH;
      const fCtx = fullCanvas.getContext('2d');
      fCtx.fillStyle = '#ffffff';
      fCtx.fillRect(0, 0, renderW, renderH);

      drawSourceSlice(
        fCtx,
        state.sourceImage,
        sliceX,
        sliceY,
        sliceW,
        sliceH,
        0,
        0,
        renderW,
        renderH
      );

      // Pass 2: Scale to preview size within the paper-shaped tile
      // The preview canvas matches the paper's aspect ratio exactly.
      // Unused space is moved to the outside edge of the assembled board.
      const tileDisplayHeightRounded = Math.round(tileDisplayHeight);
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = maxTileWidth;
      previewCanvas.height = tileDisplayHeightRounded;
      const pCtx = previewCanvas.getContext('2d');

      // White background (represents paper)
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, maxTileWidth, tileDisplayHeightRounded);

      // Draw at real physical size using seam-aware placement.
      const drawW = (placement.drawWidth / paper.widthIn) * maxTileWidth;
      const drawH = (placement.drawHeight / paper.heightIn) * tileDisplayHeightRounded;
      const drawX = (placement.drawLeft / paper.widthIn) * maxTileWidth;
      const drawY = (placement.drawTop / paper.heightIn) * tileDisplayHeightRounded;
      pCtx.drawImage(fullCanvas, drawX, drawY, drawW, drawH);

      // Set tile div to exact paper aspect ratio dimensions (NO CSS stretch)
      const tile = document.createElement('div');
      tile.className = 'preview-tile';
      tile.style.width = maxTileWidth + 'px';
      tile.style.height = tileDisplayHeightRounded + 'px';
      tile.appendChild(previewCanvas);

      appendPreviewGuides(tile, placement, paper);

      // Tile coordinate badge matches the assembly key and exported filename.
      const badge = document.createElement('span');
      badge.className = 'page-badge';
      badge.textContent = getPageLabel(row, col);
      tile.appendChild(badge);

      grid.appendChild(tile);
    }
  }
}

// ===== Export =====

function getExportConfig() {
  const paper = getPaperSizeInches();
  const margins = getMarginsInches();
  const overlapIn = getOverlapInches();
  const printW = paper.widthIn - margins.left - margins.right;
  const printH = paper.heightIn - margins.top - margins.bottom;

  if (printW - overlapIn <= 0 || printH - overlapIn <= 0) {
    throw new Error('Overlap is too large for the printable area.');
  }

  const cols = Math.max(1, parseInt(gridColsInput.value) || 1);
  const rows = Math.max(1, parseInt(gridRowsInput.value) || 1);

  return {
    paper,
    margins,
    cols,
    rows,
    geometry: getTileGeometry(cols, rows),
    printDpi: 300,
  };
}

/** Draw the selected trim-mark style onto an exported canvas. */
function drawExportGuides(ctx, placement, dpi) {
  if (!shouldDrawCuttingGuides()) return;

  const gx = placement.guideLeft * dpi;
  const gy = placement.guideTop * dpi;
  const gr = (placement.guideLeft + placement.guideWidth) * dpi;
  const gb = (placement.guideTop + placement.guideHeight) * dpi;

  ctx.save();
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = Math.max(1.5, dpi / 180);

  if (state.guideStyle === 'border') {
    ctx.setLineDash([dpi / 12, dpi / 18]);
    ctx.strokeRect(gx, gy, gr - gx, gb - gy);
  } else {
    const length = 0.16 * dpi;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(gx - length, gy); ctx.lineTo(gx, gy);
    ctx.moveTo(gr, gy); ctx.lineTo(gr + length, gy);
    ctx.moveTo(gx - length, gb); ctx.lineTo(gx, gb);
    ctx.moveTo(gr, gb); ctx.lineTo(gr + length, gb);
    ctx.moveTo(gx, gy - length); ctx.lineTo(gx, gy);
    ctx.moveTo(gr, gy - length); ctx.lineTo(gr, gy);
    ctx.moveTo(gx, gb); ctx.lineTo(gx, gb + length);
    ctx.moveTo(gr, gb); ctx.lineTo(gr, gb + length);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Find white page space that does not intersect the rendered board rectangle.
 * Returns null rather than ever allowing an assembly label to cover artwork.
 */
function getSafeTileLabelLayout(ctx, row, col, cols, rows, placement, pageWidthPx, pageHeightPx, dpi) {
  const pageNum = row * cols + col + 1;
  const label = `${getPageLabel(row, col)} · ${pageNum}/${cols * rows}`;
  const fontSize = Math.max(18, Math.round(0.11 * dpi));
  const padX = Math.round(0.055 * dpi);
  const padY = Math.round(0.035 * dpi);
  ctx.font = `600 ${fontSize}px sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const boxW = textWidth + padX * 2;
  const boxH = fontSize + padY * 2;
  const gap = Math.max(2, Math.round(0.02 * dpi));
  const drawLeft = placement.drawLeft * dpi;
  const drawTop = placement.drawTop * dpi;
  const drawRight = (placement.drawLeft + placement.drawWidth) * dpi;
  const drawBottom = (placement.drawTop + placement.drawHeight) * dpi;

  // Prefer horizontal whitespace above/below the board. Side strips are a
  // fallback for unusually narrow or full-height segments.
  const regions = [
    { name: 'top', x: gap, y: gap, width: pageWidthPx - gap * 2, height: drawTop - gap * 2 },
    { name: 'bottom', x: gap, y: drawBottom + gap, width: pageWidthPx - gap * 2, height: pageHeightPx - drawBottom - gap * 2 },
    { name: 'left', x: gap, y: gap, width: drawLeft - gap * 2, height: pageHeightPx - gap * 2 },
    { name: 'right', x: drawRight + gap, y: gap, width: pageWidthPx - drawRight - gap * 2, height: pageHeightPx - gap * 2 },
  ];
  const region = regions.find(candidate => boxW <= candidate.width && boxH <= candidate.height);
  if (!region) return null;

  return {
    label,
    fontSize,
    padX,
    boxW,
    boxH,
    region: region.name,
    x: region.x + (region.width - boxW) / 2,
    y: region.y + (region.height - boxH) / 2,
  };
}

/** Draw an assembly coordinate only in verified whitespace outside the board. */
function drawTileLabel(ctx, row, col, cols, rows, placement, pageWidthPx, pageHeightPx, dpi) {
  if (!state.includeAssemblyKey) return;

  ctx.save();
  const layout = getSafeTileLabelLayout(
    ctx,
    row,
    col,
    cols,
    rows,
    placement,
    pageWidthPx,
    pageHeightPx,
    dpi
  );
  if (!layout) {
    ctx.restore();
    throw new Error(
      `Assembly key label ${getPageLabel(row, col)} has no clear white space. `
      + 'Increase a page margin, use a larger grid, or turn off the assembly key.'
    );
  }

  ctx.font = `600 ${layout.fontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(layout.x, layout.y, layout.boxW, layout.boxH);
  ctx.strokeStyle = 'rgba(80,80,80,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.x, layout.y, layout.boxW, layout.boxH);
  ctx.fillStyle = '#555555';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    layout.label,
    layout.x + layout.padX,
    layout.y + layout.boxH / 2
  );
  ctx.restore();
}

/** Render one print-ready tile; PDF, PNG, and JPG all use this exact canvas. */
function renderExportTileCanvas(row, col, config) {
  const { paper, margins, cols, rows, geometry, printDpi } = config;
  const pagePxW = Math.round(paper.widthIn * printDpi);
  const pagePxH = Math.round(paper.heightIn * printDpi);
  const sliceX = col * geometry.corePxW - geometry.overlapPx / 2;
  const sliceY = row * geometry.corePxH - geometry.overlapPx / 2;
  const placement = getTilePlacementInches(
    col,
    row,
    cols,
    rows,
    paper,
    margins,
    geometry
  );

  const canvas = document.createElement('canvas');
  canvas.width = pagePxW;
  canvas.height = pagePxH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pagePxW, pagePxH);

  drawSourceSlice(
    ctx,
    state.sourceImage,
    sliceX,
    sliceY,
    geometry.slicePxW,
    geometry.slicePxH,
    placement.drawLeft * printDpi,
    placement.drawTop * printDpi,
    placement.drawWidth * printDpi,
    placement.drawHeight * printDpi
  );

  drawExportGuides(ctx, placement, printDpi);
  drawTileLabel(
    ctx,
    row,
    col,
    cols,
    rows,
    placement,
    pagePxW,
    pagePxH,
    printDpi
  );
  return canvas;
}

/** Create a one-page, labeled overview of the board and its tile coordinates. */
function renderAssemblyKeyCanvas(config) {
  const { paper, cols, rows, printDpi } = config;
  const width = Math.round(paper.widthIn * printDpi);
  const height = Math.round(paper.heightIn * printDpi);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const sidePad = 0.45 * printDpi;
  const headerH = 0.8 * printDpi;
  const footerH = 0.45 * printDpi;
  const availableW = width - sidePad * 2;
  const availableH = height - headerH - footerH;
  const sourceAR = state.originalWidthPx / state.originalHeightPx;
  let boardW = availableW;
  let boardH = boardW / sourceAR;
  if (boardH > availableH) {
    boardH = availableH;
    boardW = boardH * sourceAR;
  }
  const boardX = (width - boardW) / 2;
  const boardY = headerH + (availableH - boardH) / 2;

  ctx.fillStyle = '#1d1d1f';
  ctx.font = `700 ${Math.round(0.24 * printDpi)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('BoardSplitter Assembly Key', width / 2, 0.36 * printDpi);
  ctx.fillStyle = '#6e6e73';
  ctx.font = `400 ${Math.round(0.11 * printDpi)}px sans-serif`;
  ctx.fillText(`${cols} × ${rows} grid · ${cols * rows} tiles`, width / 2, 0.58 * printDpi);

  ctx.drawImage(
    state.sourceImage,
    0,
    0,
    state.originalWidthPx,
    state.originalHeightPx,
    boardX,
    boardY,
    boardW,
    boardH
  );

  const cellW = boardW / cols;
  const cellH = boardH / rows;
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = Math.max(2, printDpi / 120);
  ctx.strokeRect(boardX, boardY, boardW, boardH);
  for (let col = 1; col < cols; col++) {
    const x = boardX + col * cellW;
    ctx.beginPath();
    ctx.moveTo(x, boardY);
    ctx.lineTo(x, boardY + boardH);
    ctx.stroke();
  }
  for (let row = 1; row < rows; row++) {
    const y = boardY + row * cellH;
    ctx.beginPath();
    ctx.moveTo(boardX, y);
    ctx.lineTo(boardX + boardW, y);
    ctx.stroke();
  }

  const labelFont = Math.max(14, Math.min(0.22 * printDpi, cellW * 0.2, cellH * 0.2));
  ctx.font = `700 ${labelFont}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const label = getPageLabel(row, col);
      const centerX = boardX + (col + 0.5) * cellW;
      const centerY = boardY + (row + 0.5) * cellH;
      const textW = ctx.measureText(label).width;
      const boxW = textW + labelFont * 0.7;
      const boxH = labelFont * 1.45;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);
      ctx.fillStyle = '#1d1d1f';
      ctx.fillText(label, centerX, centerY);
    }
  }

  ctx.fillStyle = '#6e6e73';
  ctx.font = `400 ${Math.round(0.105 * printDpi)}px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Match each label to the same label on its exported tile.', width / 2, height - 0.18 * printDpi);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode an image tile.'));
    }, type, quality);
  });
}

let crc32Table = null;
function getCrc32(bytes) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let value = n;
      for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      crc32Table[n] = value >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipHeader(size, nameLength, crc, central, offset = 0, dosTime = 0, dosDate = 0) {
  const header = new Uint8Array(central ? 46 : 30);
  const view = new DataView(header.buffer);
  view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);

  if (central) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameLength, true);
    view.setUint32(42, offset, true);
  } else {
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameLength, true);
  }
  return header;
}

/** Dependency-free ZIP writer using stored entries (images are already compressed). */
async function createStoredZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9)
    | ((now.getMonth() + 1) << 5)
    | now.getDate();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = getCrc32(bytes);
    const localHeader = createZipHeader(bytes.length, name.length, crc, false, 0, dosTime, dosDate);
    const centralHeader = createZipHeader(bytes.length, name.length, crc, true, localOffset, dosTime, dosDate);

    localParts.push(localHeader, name, bytes);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + bytes.length;
    centralSize += centralHeader.length + name.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPdf(config) {
  const { paper, cols, rows } = config;
  const paperWpt = paper.widthIn * PT_PER_IN;
  const paperHpt = paper.heightIn * PT_PER_IN;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: state.orientation,
    unit: 'pt',
    format: [paperWpt, paperHpt],
  });
  let pageStarted = false;

  if (state.includeAssemblyKey) {
    const keyCanvas = renderAssemblyKeyCanvas(config);
    pdf.addImage(keyCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, paperWpt, paperHpt);
    pageStarted = true;
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (pageStarted) pdf.addPage([paperWpt, paperHpt]);
      const tileCanvas = renderExportTileCanvas(row, col, config);
      pdf.addImage(tileCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, paperWpt, paperHpt);
      pageStarted = true;
    }
  }

  pdf.save('boardsplitter-output.pdf');
}

async function exportImageTiles(format, config) {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const extension = format === 'png' ? 'png' : 'jpg';
  const files = [];

  if (state.includeAssemblyKey) {
    const keyCanvas = renderAssemblyKeyCanvas(config);
    files.push({
      name: `assembly-key.${extension}`,
      blob: await canvasToBlob(keyCanvas, mime, format === 'jpg' ? 0.92 : undefined),
    });
  }

  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      const canvas = renderExportTileCanvas(row, col, config);
      files.push({
        name: `${getPageLabel(row, col)}.${extension}`,
        blob: await canvasToBlob(canvas, mime, format === 'jpg' ? 0.92 : undefined),
      });
    }
  }

  const zip = await createStoredZipBlob(files);
  downloadBlob(zip, `boardsplitter-${extension}-tiles.zip`);
}

btnExport.addEventListener('click', async () => {
  if (!state.sourceImage) return;

  const format = exportFormatSelect.value;
  btnExport.classList.add('loading');
  exportLabel.textContent = format === 'pdf'
    ? 'Generating PDF…'
    : `Rendering ${format.toUpperCase()} Tiles…`;

  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const config = getExportConfig();
    if (format === 'pdf') await exportPdf(config);
    else await exportImageTiles(format, config);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export: ' + err.message);
  } finally {
    btnExport.classList.remove('loading');
    exportLabel.textContent = format === 'pdf' ? 'Export PDF' : `Export ${format.toUpperCase()} Tiles`;
  }
});

// ===== Save / Load Project (JSON) =====

/** Convert image source to a persistent data URL (handles blob URLs) */
function getImageDataURL(img, callback) {
  if (!img) { callback(null); return; }
  // If it's already a data URL, use it directly
  if (img.src.startsWith('data:')) {
    callback(img.src);
    return;
  }
  // For blob URLs, re-encode via canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  callback(canvas.toDataURL('image/png'));
}

btnSave.addEventListener('click', () => {
  getImageDataURL(state.sourceImage, (dataUrl) => {
    const project = {
      version: 5,
      sourceImage: dataUrl,
      originalWidthPx: state.originalWidthPx,
      originalHeightPx: state.originalHeightPx,
      dpi: state.dpi,
      scalePercent: state.scalePercent,
      boardUnit: state.boardUnit,
      paperSize: state.paperSize,
      orientation: state.orientation,
      pageAreaMode: state.pageAreaMode,
      marginUnit: state.marginUnit,
      marginTop: state.marginTop,
      marginRight: state.marginRight,
      marginBottom: state.marginBottom,
      marginLeft: state.marginLeft,
      overlap: state.overlap,
      guideStyle: state.guideStyle,
      includeAssemblyKey: state.includeAssemblyKey,
    };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'boardsplitter-project.json';
  a.click();

  URL.revokeObjectURL(url);
  });
});

btnLoad.addEventListener('click', () => {
  loadInput.value = '';
  loadInput.click();
});

loadInput.addEventListener('change', () => {
  const file = loadInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const project = JSON.parse(e.target.result);
      loadProject(project);
    } catch (err) {
      alert('Invalid project file.');
    }
  };
  reader.readAsText(file);
});

function loadProject(project) {
  // Restore image
  const img = new Image();
  img.onload = () => {
    state.sourceImage = img;
    state.originalWidthPx = project.originalWidthPx || img.naturalWidth;
    state.originalHeightPx = project.originalHeightPx || img.naturalHeight;

    // Restore DPI-based dimensions (v2) or legacy physical dimensions (v1)
    if (project.dpi != null) {
      state.dpi = project.dpi;
      state.scalePercent = project.scalePercent ?? 100;
    } else {
      // Legacy v1: derive DPI from saved physical width
      state.scalePercent = 100;
      state.dpi = state.originalWidthPx / (project.physicalWidthIn || (img.naturalWidth / 96));
    }

    // Restore settings
    const savedBoardUnit = project.boardUnit || 'in';
    state.boardUnit = savedBoardUnit === 'mm'
      ? 'cm'
      : (['in', 'cm'].includes(savedBoardUnit) ? savedBoardUnit : 'in');
    state.paperSize = project.paperSize || 'letter';
    state.orientation = project.orientation || 'portrait';
    state.pageAreaMode = ['printable', 'full', 'bleed'].includes(project.pageAreaMode)
      ? project.pageAreaMode
      : ((project.overlap ?? 0) > 0 ? 'bleed' : 'printable');
    const savedMarginUnit = project.marginUnit || 'in';
    const legacyMillimeters = savedMarginUnit === 'mm';
    state.marginUnit = legacyMillimeters
      ? 'cm'
      : (['in', 'cm'].includes(savedMarginUnit) ? savedMarginUnit : 'in');
    const restoreMeasurement = (value, fallbackInches) => {
      if (value == null) {
        return state.marginUnit === 'cm' ? fallbackInches * CM_PER_IN : fallbackInches;
      }
      return legacyMillimeters ? value / 10 : value;
    };
    state.marginTop = restoreMeasurement(project.marginTop, 0.25);
    state.marginRight = restoreMeasurement(project.marginRight, 0.25);
    state.marginBottom = restoreMeasurement(project.marginBottom, 0.25);
    state.marginLeft = restoreMeasurement(project.marginLeft, 0.25);
    state.overlap = restoreMeasurement(project.overlap, 0);
    state.guideStyle = ['ticks', 'border', 'none'].includes(project.guideStyle)
      ? project.guideStyle
      : (project.cuttingGuides === false ? 'none' : 'border');
    state.includeAssemblyKey = project.includeAssemblyKey === true;

    // Sync UI
    setBoardUnit(state.boardUnit);
    updateBoardSizeInputs();

    // Sync orientation toggle
    setOrientation(state.orientation);

    // Sync grid inputs
    updateGridInputs();

    // Sync scale slider
    scaleSlider.value = state.scalePercent;
    scaleValueLabel.textContent = state.scalePercent;

    // Show image pixel dimensions
    const imageInfo = $('#image-info');
    const imageDims = $('#image-dims');
    imageDims.textContent = `${state.originalWidthPx} × ${state.originalHeightPx} px · ${fmtNum(state.dpi, 1)} DPI`;
    imageInfo.classList.remove('hidden');

    paperSizeSelect.value = state.paperSize;
    syncPageAreaUI();
    setUnitUI(state.marginUnit);
    updateInputValues();

    guideStyleSelect.value = state.guideStyle;
    includeAssemblyKeyCheckbox.checked = state.includeAssemblyKey;

    // Show workspace
    uploadSection.classList.add('hidden');
    workspace.classList.remove('hidden');

    renderPreview();
  };
  img.src = project.sourceImage;
}

function setUnitUI(unit) {
  btnInches.classList.toggle('active', unit === 'in');
  btnCm.classList.toggle('active', unit === 'cm');
  document.querySelectorAll('.overlap-unit').forEach(el => el.textContent = unit);
}

function updateInputValues() {
  const decimals = 2;
  marginTopInput.value = fmtNum(state.marginTop, decimals);
  marginRightInput.value = fmtNum(state.marginRight, decimals);
  marginBottomInput.value = fmtNum(state.marginBottom, decimals);
  marginLeftInput.value = fmtNum(state.marginLeft, decimals);
  overlapInput.value = fmtNum(state.overlap, state.marginUnit === 'in' ? 3 : 2);
}

syncPageAreaUI();

// ===== Window Resize Handler =====
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderPreview(), 150);
});
