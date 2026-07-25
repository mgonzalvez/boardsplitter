const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement(tagName = 'div') {
  const classes = new Set();
  const listeners = new Map();
  const children = [];
  const attributes = new Map();
  const context = {
    beginPath() {},
    drawImage() {},
    fillRect() {},
    fillText() {},
    lineTo() {},
    measureText(text) {
      return { width: String(text).length * 10 };
    },
    moveTo() {},
    restore() {},
    save() {},
    setLineDash() {},
    stroke() {},
    strokeRect() {},
    set fillStyle(value) {},
    set font(value) {},
    set lineWidth(value) {},
    set strokeStyle(value) {},
    set textAlign(value) {},
    set textBaseline(value) {},
  };
  return {
    tagName: tagName.toUpperCase(),
    children,
    value: '',
    checked: true,
    clientWidth: 1000,
    innerHTML: '',
    textContent: '',
    style: { setProperty() {} },
    classList: {
      add(...names) {
        names.forEach(name => classes.add(name));
      },
      remove(...names) {
        names.forEach(name => classes.delete(name));
      },
      toggle(name, force) {
        if (force === true) {
          classes.add(name);
          return true;
        }
        if (force === false) {
          classes.delete(name);
          return false;
        }
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach(handler => handler.call(this, event));
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    contains(node) {
      return node === this || children.includes(node);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    focus() {},
    querySelector() {
      return null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    click() {},
    getContext() {
      return context;
    },
    toBlob(callback, type = 'image/png') {
      callback(new Blob(['mock-image'], { type }));
    },
    toDataURL(type = 'image/png') {
      return `data:${type};base64,bW9jay1pbWFnZQ==`;
    },
  };
}

function loadApp() {
  const elements = new Map();
  const storage = new Map();
  const document = {
    documentElement: {
      dataset: { theme: 'light' },
      style: {},
    },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    createElement,
  };

  const context = {
    Blob,
    console,
    document,
    setTimeout,
    clearTimeout,
    TextEncoder,
    alert() {},
  };
  context.window = {
    addEventListener() {},
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
  };

  vm.createContext(context);
  const appPath = path.join(__dirname, '..', 'app.js');
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), context, { filename: appPath });
  return context;
}

test('appearance toggle switches and persists light and dark themes', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    const initial = {
      theme: getCurrentTheme(),
      label: themeToggle.getAttribute('aria-label'),
    };
    themeToggle.dispatchEvent({ type: 'click' });
    const dark = {
      theme: getCurrentTheme(),
      colorScheme: document.documentElement.style.colorScheme,
      label: themeToggle.getAttribute('aria-label'),
      meta: themeColorMeta.content,
      stored: window.localStorage.getItem('boardsplitter-theme'),
    };
    themeToggle.dispatchEvent({ type: 'click' });
    const light = {
      theme: getCurrentTheme(),
      label: themeToggle.getAttribute('aria-label'),
      meta: themeColorMeta.content,
    };
    ({ initial, dark, light });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      initial: { theme: 'light', label: 'Switch to dark mode' },
      dark: {
        theme: 'dark',
        colorScheme: 'dark',
        label: 'Switch to light mode',
        meta: '#090b10',
        stored: 'dark',
      },
      light: {
        theme: 'light',
        label: 'Switch to dark mode',
        meta: '#f4f7fb',
      },
    }
  );
});

test('responsive stylesheet covers light, dark, tablet, phone, touch, and reduced motion', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(styles, /html\[data-theme="light"\]/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /@media \(pointer: coarse\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.related-sites-trigger/);
  assert.match(styles, /\.related-sites-panel/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /id="related-sites-menu"/);
  assert.match(html, /prefers-color-scheme: dark/);
});

test('Related Sites menu contains PnP Daily and all seven directory sites', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const expectedSites = [
    ['PnP Daily', 'https://pnpdaily.gonzhome.us'],
    ['PnPFinder', 'https://pnpfinder.com'],
    ['PnP Launchpad', 'https://launchpad.gonzhome.us'],
    ['PnPTools', 'https://pnptools.gonzhome.us'],
    ['Card Prototyper', 'https://prototyper.gonzhome.us'],
    ['Card Extractor', 'https://extractor.gonzhome.us'],
    ['Card Formatter', 'https://formatter.gonzhome.us'],
    ['Geeklist Generator', 'https://geeklist.gonzhome.us'],
  ];

  expectedSites.forEach(([name, url]) => {
    assert.match(html, new RegExp(`href="${url}"[^>]*>${name}</a>`));
  });
});

test('Escape closes the Related Sites menu', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    relatedSitesMenu.open = true;
    relatedSitesMenu.dispatchEvent({ type: 'keydown', key: 'Escape' });
    relatedSitesMenu.open;
  `, context);

  assert.equal(result, false);
});

test('preview zoom buttons step, reset, clamp, and preserve board dimensions', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = 300;
    state.scalePercent = 100;
    previewContainer.clientWidth = 1000;

    const initial = {
      zoom: state.previewZoom,
      label: zoomValue.textContent,
      tileWidth: getPreviewTileWidth(3),
      boardWidth: getPhysicalWidthIn(),
    };

    btnZoomOut.dispatchEvent({ type: 'click' });
    const zoomedOut = {
      zoom: state.previewZoom,
      label: zoomValue.textContent,
      tileWidth: getPreviewTileWidth(3),
      boardWidth: getPhysicalWidthIn(),
    };

    btnZoomReset.dispatchEvent({ type: 'click' });
    for (let i = 0; i < 10; i++) btnZoomIn.dispatchEvent({ type: 'click' });
    const maximum = {
      zoom: state.previewZoom,
      label: zoomValue.textContent,
      disabled: btnZoomIn.disabled,
      tileWidth: getPreviewTileWidth(3),
    };

    btnZoomReset.dispatchEvent({ type: 'click' });
    ({
      initial,
      zoomedOut,
      maximum,
      reset: { zoom: state.previewZoom, label: zoomValue.textContent },
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      initial: { zoom: 1, label: '100%', tileWidth: 200, boardWidth: 20 },
      zoomedOut: { zoom: 0.75, label: '75%', tileWidth: 150, boardWidth: 20 },
      maximum: { zoom: 2.5, label: '250%', disabled: true, tileWidth: 500 },
      reset: { zoom: 1, label: '100%' },
    }
  );
});

test('PNG physical-resolution metadata restores 300 DPI board dimensions', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    const png = new Uint8Array(29);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    const pngView = new DataView(png.buffer);
    pngView.setUint32(8, 9, false);
    png.set([112, 72, 89, 115], 12); // pHYs
    pngView.setUint32(16, 11811, false);
    pngView.setUint32(20, 11811, false);
    png[24] = 1;

    const detectedDpi = getPngDpi(png.buffer);
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = detectedDpi;
    state.scalePercent = 100;

    ({
      dpi: detectedDpi,
      width: getPhysicalWidthIn(),
      height: getPhysicalHeightIn(),
    });
  `, context);

  assert.ok(Math.abs(result.dpi - 300) < 0.001);
  assert.ok(Math.abs(result.width - 20) < 0.001);
  assert.ok(Math.abs(result.height - 14.25) < 0.001);
});

test('PNG without physical-resolution metadata falls back cleanly', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    getPngDpi(png.buffer);
  `, context);

  assert.equal(result, null);
});

test('raster imports without readable metadata assume print-ready 300 DPI', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = resolveImportDpi(null, 300);
    state.scalePercent = 100;

    ({
      dpi: state.dpi,
      width: getPhysicalWidthIn(),
      height: getPhysicalHeightIn(),
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { dpi: 300, width: 20, height: 14.25 }
  );
});

test('centimeter controls preserve physical board size and margins', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = 300;
    state.scalePercent = 100;
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0.125;

    setBoardUnit('cm');
    const board = {
      width: Number(boardWidthInput.value),
      height: Number(boardHeightInput.value),
    };

    setUnit('cm');
    const metric = {
      top: state.marginTop,
      overlap: state.overlap,
      topInput: Number(marginTopInput.value),
      overlapInput: Number(overlapInput.value),
      topInches: getConfiguredMarginsInches().top,
    };

    setUnit('in');
    const restored = {
      top: state.marginTop,
      overlap: state.overlap,
    };

    ({ board, metric, restored });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      board: { width: 50.8, height: 36.2 },
      metric: {
        top: 0.635,
        overlap: 0.3175,
        topInput: 0.64,
        overlapInput: 0.32,
        topInches: 0.25,
      },
      restored: { top: 0.25, overlap: 0.125 },
    }
  );
});

test('24 × 17.1 inch board becomes six equal Letter-page segments', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = 250;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'portrait';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0;

    updateGridInputs();
    const cols = Number(gridColsInput.value);
    const rows = Number(gridRowsInput.value);
    const geometry = getTileGeometry(cols, rows);

    ({
      cols,
      rows,
      corePxW: geometry.corePxW,
      corePxH: geometry.corePxH,
      sliceWIn: geometry.sliceWIn,
      sliceHIn: geometry.sliceHIn,
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      cols: 3,
      rows: 2,
      corePxW: 2000,
      corePxH: 2137.5,
      sliceWIn: 8,
      sliceHIn: 8.55,
    }
  );
});

test('equal partitions cover every source pixel without a trailing remainder', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6001;
    state.originalHeightPx = 4277;
    state.dpi = 250;
    state.scalePercent = 100;
    state.overlap = 0;

    const geometry = getTileGeometry(3, 2);
    ({
      coveredWidth: geometry.corePxW * 3,
      coveredHeight: geometry.corePxH * 2,
      xStarts: [0, 1, 2].map(col => col * geometry.corePxW),
      yStarts: [0, 1].map(row => row * geometry.corePxH),
    });
  `, context);

  assert.equal(result.coveredWidth, 6001);
  assert.equal(result.coveredHeight, 4277);
  assert.equal(result.xStarts[0], 0);
  assert.equal(result.xStarts[2] + 6001 / 3, 6001);
  assert.equal(result.yStarts[0], 0);
  assert.equal(result.yStarts[1] + 4277 / 2, 4277);
});

test('page-area modes expose the correct usable area', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0.125;

    state.pageAreaMode = 'printable';
    const printable = {
      margins: getMarginsInches(),
      overlap: getOverlapInches(),
    };

    state.pageAreaMode = 'full';
    const full = {
      margins: getMarginsInches(),
      overlap: getOverlapInches(),
      guides: shouldDrawCuttingGuides(),
    };

    state.pageAreaMode = 'bleed';
    const bleed = {
      margins: getMarginsInches(),
      overlap: getOverlapInches(),
    };

    ({ printable, full, bleed });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      printable: {
        margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
        overlap: 0,
      },
      full: {
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        overlap: 0,
        guides: false,
      },
      bleed: {
        margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
        overlap: 0.125,
      },
    }
  );
});

test('page-area mode changes grid capacity and contextual controls', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 4250;
    state.originalHeightPx = 2750;
    state.dpi = 250;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'portrait';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0.125;

    state.pageAreaMode = 'printable';
    updateGridInputs();
    const printableCols = Number(gridColsInput.value);

    state.pageAreaMode = 'full';
    syncPageAreaUI();
    updateGridInputs();
    const fullCols = Number(gridColsInput.value);
    const fullUI = {
      marginsHidden: marginInputsControl.classList.contains('hidden'),
      overlapHidden: overlapControl.classList.contains('hidden'),
      guidesHidden: trimStyleControl.classList.contains('hidden'),
    };

    state.pageAreaMode = 'bleed';
    syncPageAreaUI();
    updateGridInputs();
    const bleedCols = Number(gridColsInput.value);
    const bleedUI = {
      marginsHidden: marginInputsControl.classList.contains('hidden'),
      overlapHidden: overlapControl.classList.contains('hidden'),
      guidesHidden: trimStyleControl.classList.contains('hidden'),
    };

    ({ printableCols, fullCols, bleedCols, fullUI, bleedUI });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      printableCols: 3,
      fullCols: 2,
      bleedCols: 3,
      fullUI: {
        marginsHidden: true,
        overlapHidden: true,
        guidesHidden: true,
      },
      bleedUI: {
        marginsHidden: false,
        overlapHidden: false,
        guidesHidden: false,
      },
    }
  );
});

test('selecting Bleed supplies a useful default overlap', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = 250;
    state.scalePercent = 100;
    state.overlap = 0;
    pageAreaModeSelect.value = 'bleed';
    pageAreaModeSelect.dispatchEvent({ type: 'change' });

    ({
      mode: state.pageAreaMode,
      overlap: state.overlap,
      overlapValue: Number(overlapInput.value),
      overlapVisible: !overlapControl.classList.contains('hidden'),
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      mode: 'bleed',
      overlap: 0.125,
      overlapValue: 0.125,
      overlapVisible: true,
    }
  );
});

test('Bleed placement and trim boundaries move toward the nearest seam', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 6000;
    state.originalHeightPx = 4275;
    state.dpi = 250;
    state.scalePercent = 100;
    state.pageAreaMode = 'bleed';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0.125;

    const paper = getPaperSizeInches();
    const margins = getMarginsInches();
    const geometry = getTileGeometry(4, 2);
    ({
      first: getTilePlacementInches(0, 0, 4, 2, paper, margins, geometry),
      last: getTilePlacementInches(3, 1, 4, 2, paper, margins, geometry),
    });
  `, context);

  assert.equal(result.first.drawLeft, 2.125);
  assert.ok(Math.abs(result.first.drawTop - 2.075) < 1e-9);
  assert.equal(result.first.guideLeft, 2.1875);
  assert.ok(Math.abs(result.first.guideTop - 2.1375) < 1e-9);
  assert.equal(result.first.guideWidth, 6);
  assert.equal(result.first.guideHeight, 8.55);

  assert.equal(result.last.drawLeft, 0.25);
  assert.equal(result.last.drawTop, 0.25);
  assert.equal(result.last.guideLeft, 0.3125);
  assert.equal(result.last.guideTop, 0.3125);
});

test('interior tiles remain centered between seams', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 4200;
    state.originalHeightPx = 4800;
    state.dpi = 200;
    state.scalePercent = 100;
    state.pageAreaMode = 'printable';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0;

    const paper = getPaperSizeInches();
    const margins = getMarginsInches();
    const geometry = getTileGeometry(3, 3);
    ({
      first: getTilePlacementInches(0, 0, 3, 3, paper, margins, geometry),
      middle: getTilePlacementInches(1, 1, 3, 3, paper, margins, geometry),
      last: getTilePlacementInches(2, 2, 3, 3, paper, margins, geometry),
    });
  `, context);

  assert.equal(result.first.drawLeft, 1.25);
  assert.equal(result.first.drawTop, 2.75);
  assert.equal(result.middle.drawLeft, 0.75);
  assert.equal(result.middle.drawTop, 1.5);
  assert.equal(result.last.drawLeft, 0.25);
  assert.equal(result.last.drawTop, 0.25);
});

test('Find Best Layout chooses fewer pages without resizing the board', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.sourceImage = {};
    state.originalWidthPx = 4000;
    state.originalHeightPx = 3000;
    state.dpi = 200;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'portrait';
    state.pageAreaMode = 'printable';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0;
    previewContainer.clientWidth = 1000;

    const before = {
      dpi: state.dpi,
      scale: state.scalePercent,
      width: getPhysicalWidthIn(),
      height: getPhysicalHeightIn(),
    };

    btnOptimize.dispatchEvent({ type: 'click' });

    ({
      before,
      after: {
        dpi: state.dpi,
        scale: state.scalePercent,
        width: getPhysicalWidthIn(),
        height: getPhysicalHeightIn(),
      },
      orientation: state.orientation,
      cols: Number(gridColsInput.value),
      rows: Number(gridRowsInput.value),
      message: layoutResult.textContent,
      resultVisible: !layoutResult.classList.contains('hidden'),
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      before: { dpi: 200, scale: 100, width: 20, height: 15 },
      after: { dpi: 200, scale: 100, width: 20, height: 15 },
      orientation: 'landscape',
      cols: 2,
      rows: 2,
      message: 'Best layout: 2 × 2 landscape — 4 pages.',
      resultVisible: true,
    }
  );
});

test('Find Best Layout keeps the current orientation when layouts tie', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.originalWidthPx = 3200;
    state.originalHeightPx = 3200;
    state.dpi = 200;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'landscape';
    state.pageAreaMode = 'printable';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0;

    const best = findBestLayout();
    ({
      orientation: best.orientation,
      cols: best.cols,
      rows: best.rows,
      pages: best.pages,
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      orientation: 'landscape',
      cols: 2,
      rows: 2,
      pages: 4,
    }
  );
});

test('trim mark styles and Full Area visibility behave predictably', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.pageAreaMode = 'printable';
    state.guideStyle = 'ticks';
    const ticks = shouldDrawCuttingGuides();

    state.guideStyle = 'border';
    const border = shouldDrawCuttingGuides();

    state.guideStyle = 'none';
    const none = shouldDrawCuttingGuides();

    state.guideStyle = 'ticks';
    state.pageAreaMode = 'full';
    syncPageAreaUI();
    const full = shouldDrawCuttingGuides();

    ({ ticks, border, none, full, trimControlHidden: trimStyleControl.classList.contains('hidden') });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      ticks: true,
      border: true,
      none: false,
      full: false,
      trimControlHidden: true,
    }
  );
});

test('assembly labels scale beyond one alphabet row', () => {
  const context = loadApp();
  const labels = vm.runInContext(`
    [getPageLabel(0, 0), getPageLabel(1, 2), getPageLabel(25, 0), getPageLabel(26, 4)]
  `, context);

  assert.deepEqual(Array.from(labels), ['A1', 'B3', 'Z1', 'AA5']);
});

test('image export format updates the single export action', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    exportFormatSelect.value = 'png';
    exportFormatSelect.dispatchEvent({ type: 'change' });
    const png = {
      label: exportLabel.textContent,
      helpVisible: !exportHelp.classList.contains('hidden'),
    };

    exportFormatSelect.value = 'pdf';
    exportFormatSelect.dispatchEvent({ type: 'change' });
    const pdf = {
      label: exportLabel.textContent,
      helpVisible: !exportHelp.classList.contains('hidden'),
    };

    ({ png, pdf });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      png: { label: 'Export PNG Tiles', helpVisible: true },
      pdf: { label: 'Export PDF', helpVisible: false },
    }
  );
});

test('stored ZIP writer produces a valid archive envelope and filename', async () => {
  const context = loadApp();
  const zip = await vm.runInContext(`
    createStoredZipBlob([
      { name: 'A1.txt', blob: new Blob(['tile-data'], { type: 'text/plain' }) }
    ])
  `, context);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = Buffer.from(bytes).toString('latin1');

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.match(text, /A1\.txt/);
});

test('tile and assembly-key renderers share print-ready page dimensions', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.sourceImage = {};
    state.originalWidthPx = 2400;
    state.originalHeightPx = 1800;
    state.dpi = 100;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'portrait';
    state.pageAreaMode = 'printable';
    state.marginUnit = 'in';
    state.marginTop = 0.25;
    state.marginRight = 0.25;
    state.marginBottom = 0.25;
    state.marginLeft = 0.25;
    state.overlap = 0;
    state.guideStyle = 'ticks';
    gridColsInput.value = 3;
    gridRowsInput.value = 2;

    const config = getExportConfig();
    const tile = renderExportTileCanvas(0, 0, config);
    const key = renderAssemblyKeyCanvas(config);

    ({
      tile: { width: tile.width, height: tile.height },
      key: { width: key.width, height: key.height },
      label: getPageLabel(0, 0),
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      tile: { width: 2550, height: 3300 },
      key: { width: 2550, height: 3300 },
      label: 'A1',
    }
  );
});

test('assembly labels use whitespace above first-row tiles and below last-row tiles', () => {
  const context = loadApp();
  const result = vm.runInContext(`
    state.sourceImage = {};
    state.originalWidthPx = 2400;
    state.originalHeightPx = 1800;
    state.dpi = 100;
    state.scalePercent = 100;
    state.paperSize = 'letter';
    state.orientation = 'portrait';
    state.pageAreaMode = 'printable';
    state.marginUnit = 'in';
    state.marginTop = 0;
    state.marginRight = 0.25;
    state.marginBottom = 0.3;
    state.marginLeft = 0.25;
    state.overlap = 0;
    state.includeAssemblyKey = true;
    gridColsInput.value = 3;
    gridRowsInput.value = 2;

    const config = getExportConfig();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const firstPlacement = getTilePlacementInches(
      0, 0, config.cols, config.rows, config.paper, config.margins, config.geometry
    );
    const lastPlacement = getTilePlacementInches(
      0, 1, config.cols, config.rows, config.paper, config.margins, config.geometry
    );
    const pageW = config.paper.widthIn * config.printDpi;
    const pageH = config.paper.heightIn * config.printDpi;
    const first = getSafeTileLabelLayout(
      ctx, 0, 0, config.cols, config.rows, firstPlacement, pageW, pageH, config.printDpi
    );
    const last = getSafeTileLabelLayout(
      ctx, 1, 0, config.cols, config.rows, lastPlacement, pageW, pageH, config.printDpi
    );

    ({
      firstRegion: first.region,
      firstClearsImage: first.y + first.boxH <= firstPlacement.drawTop * config.printDpi,
      lastRegion: last.region,
      lastClearsImage: last.y >= (lastPlacement.drawTop + lastPlacement.drawHeight) * config.printDpi,
    });
  `, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      firstRegion: 'top',
      firstClearsImage: true,
      lastRegion: 'bottom',
      lastClearsImage: true,
    }
  );
});

test('assembly export aborts rather than overlaying a full-page board', () => {
  const context = loadApp();

  assert.throws(
    () => vm.runInContext(`
      state.sourceImage = {};
      state.originalWidthPx = 850;
      state.originalHeightPx = 1100;
      state.dpi = 100;
      state.scalePercent = 100;
      state.paperSize = 'letter';
      state.orientation = 'portrait';
      state.pageAreaMode = 'full';
      state.marginUnit = 'in';
      state.overlap = 0;
      state.includeAssemblyKey = true;
      gridColsInput.value = 1;
      gridRowsInput.value = 1;

      renderExportTileCanvas(0, 0, getExportConfig());
    `, context),
    /has no clear white space/
  );
});
