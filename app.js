// app.js

const APP_VERSION = "0.2";
const PROTOCOL_SCHEMA_VERSION = 1;

const input = document.getElementById("input");
const metaDiv = document.getElementById("meta");
const controls = document.getElementById("controls");
const protocolHost = document.getElementById("protocolHost");
const plotGrid = document.getElementById("plotGrid");

const canvasRaw = document.getElementById("plot");
const PLOT_WIDTH = 1200;
const PLOT_HEIGHT = 420;
canvasRaw.width = PLOT_WIDTH;
canvasRaw.height = PLOT_HEIGHT;
const ctxRaw = canvasRaw.getContext("2d");
canvasRaw.classList.add("w-full");

const canvasTrim = document.createElement("canvas");
canvasTrim.width = PLOT_WIDTH;
canvasTrim.height = PLOT_HEIGHT;
canvasTrim.classList.add("w-full");
const ctxTrim = canvasTrim.getContext("2d");

const M = { left: 54, right: 18, top: 10, bottom: 36 };
let rawPlotHeaderEl = null;
let trimPlotHeaderEl = null;

let samplingRate = null;
let data = { wl1: null, wl2: null };
let events = [];
let channelLabels = [];
let channelLabelSource = "default";

let currentWavelength = "wl2";
let currentChannel = 0;

let exclusionTable = null;
let lowCutEnabled = true;
let highCutEnabled = true;
let lowCutInput = null;
let highCutInput = null;
let lowToggleBtn = null;
let highToggleBtn = null;
let filterEngineSelect = null;
let dcRestoreCheckbox = null;
let plotModeSelect = null;

let notesInput = null;
let branchTagInput = null;

let datasetLabel = "unknown-dataset";
let inputTypeLabel = "unknown";

let sources = {
  hdr: null,
  wl1: null,
  wl2: null,
  evt: null,
  probeMat: null,
  samplingRateFrom: null,
  eventsFrom: null,
  channelLabelsFrom: null
};

let pendingProtocol = null;

/* Protocol UI state */
let protocolFilenameLabelEl = null;
let lastProtocolFilename = "";
let protocolSummaryEl = null;
let themeToggleBtn = null;
let currentTheme = "dark";
const THEME_STORAGE_KEY = "fnirs-webpipe-theme";
const PLOT_MODE_STORAGE_KEY = "fnirs-webpipe-plot-mode";
let currentPlotMode = "both";
let rawPanelEl = null;
let trimPanelEl = null;

initTheme();
initPlotMode();
input.addEventListener("change", handleInput);
initPlotLayout();

initUrlProtocolListener();

/* ================= Input ================= */

async function handleInput(evt) {
  resetUiOnly();
  const files = Array.from(evt.target.files);

  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    inputTypeLabel = "zip";
    datasetLabel = stem(files[0].name);
    await loadZip(files[0]);
  } else {
    inputTypeLabel = "files";
    const hdr = files.find(f => f.name.toLowerCase().endsWith(".hdr"));
    datasetLabel = hdr ? stem(hdr.name) : (files[0] ? stem(files[0].name) : "unknown-dataset");
    loadFiles(files);
  }
}

function resetUiOnly() {
  metaDiv.innerHTML = "";
  if (protocolHost) {
  protocolHost.classList.add("hidden");
  protocolHost.innerHTML = "";
  }
  controls.classList.add("hidden");
  controls.innerHTML = "";
  protocolSummaryEl = null;
  protocolFilenameLabelEl = null;
  ctxRaw.clearRect(0, 0, canvasRaw.width, canvasRaw.height);
  ctxTrim.clearRect(0, 0, canvasTrim.width, canvasTrim.height);
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("theme-dark", currentTheme === "dark");
  if (themeToggleBtn) {
    themeToggleBtn.textContent = currentTheme === "dark" ? "Dark: On" : "Dark: Off";
  }
}

function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  } catch (e) {}
}

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (e) {}
  applyTheme(saved === "light" ? "light" : "dark");
}

function initPlotMode() {
  try {
    const saved = localStorage.getItem(PLOT_MODE_STORAGE_KEY);
    if (saved === "raw" || saved === "trimmed" || saved === "both") {
      currentPlotMode = saved;
    }
  } catch (e) {}
}

function setPlotMode(mode) {
  currentPlotMode = (mode === "raw" || mode === "trimmed" || mode === "both") ? mode : "both";
  try {
    localStorage.setItem(PLOT_MODE_STORAGE_KEY, currentPlotMode);
  } catch (e) {}
  applyPlotMode();
  redraw();
}

function resetAllState() {
  samplingRate = null;
  data = { wl1: null, wl2: null };
  events = [];
  channelLabels = [];
  channelLabelSource = "default";

  currentWavelength = "wl2";
  currentChannel = 0;

  lowCutEnabled = true;
  highCutEnabled = true;

  sources = {
    hdr: null,
    wl1: null,
    wl2: null,
    evt: null,
    probeMat: null,
    samplingRateFrom: null,
    eventsFrom: null,
    channelLabelsFrom: null
  };
}

/* ================= ZIP handling (auto detect protocol ZIP) ================= */

async function loadZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);

  const protoFile =
    zip.file("protocol.pipe") ||
    zip.file("protocol.json");

  if (protoFile) {
    const txt = await protoFile.async("text");
    try {
      const obj = JSON.parse(txt);
      const normalized = normalizeProtocol(obj);
      if (data.wl1) {
        applyProtocol(normalized);
      } else {
        pendingProtocol = normalized;
      }
      lastProtocolFilename = basename(zipFile.name);
      updateProtocolFilenameLabel();
      metaDiv.textContent = "Protocol imported from ZIP. Load data to apply it to plots.";
    } catch (e) {
      metaDiv.textContent = "Protocol ZIP detected, but protocol file could not be parsed: " + e;
    }
    return;
  }

  const files = [];
  for (const name in zip.files) {
    const e = zip.files[name];
    if (!e.dir) {
      const blob = await e.async("blob");
      files.push(new File([blob], name));
    }
  }
  loadFiles(files);
}

/* ================= Loading NIRx data ================= */

function loadFiles(files) {
  resetAllState();

  const hdr = files.find(f => f.name.toLowerCase().endsWith(".hdr"));
  const wl1 = files.find(f => f.name.toLowerCase().endsWith(".wl1"));
  const wl2 = files.find(f => f.name.toLowerCase().endsWith(".wl2"));
  const evt = files.find(f => f.name.toLowerCase().endsWith(".evt"));
  const probeMat = files.find(f =>
    f.name.toLowerCase().includes("probeinfo") &&
    f.name.toLowerCase().endsWith(".mat")
  );

  sources.hdr = hdr ? hdr.name : null;
  sources.wl1 = wl1 ? wl1.name : null;
  sources.wl2 = wl2 ? wl2.name : null;
  sources.evt = evt ? evt.name : null;
  sources.probeMat = probeMat ? probeMat.name : null;

  if (!hdr || !wl1 || !wl2) {
    metaDiv.textContent = "Missing required files (.hdr, .wl1, .wl2)";
    return;
  }

  Promise.all([
    hdr.text(),
    wl1.text(),
    wl2.text(),
    evt ? evt.text() : null,
    probeMat ? probeMat.arrayBuffer() : null
  ]).then(([hdrT, wl1T, wl2T, evtT, matBuf]) => {
    samplingRate = parseSamplingRate(hdrT);
    sources.samplingRateFrom = hdr.name;

    data.wl1 = parseMatrix(wl1T);
    data.wl2 = parseMatrix(wl2T);

    events = evtT ? parseEvents(evtT) : [];
    sources.eventsFrom = evt ? evt.name : "none";

    if (matBuf) {
      channelLabels = extractChannelLabels(matBuf, data.wl1[0].length);
      channelLabelSource = "probeInfo.mat";
      sources.channelLabelsFrom = probeMat.name;
    } else {
      channelLabels = defaultChannelLabels();
      channelLabelSource = "default (probeInfo.mat not found)";
      sources.channelLabelsFrom = "default";
    }

    buildControls();
    controls.classList.remove("hidden");

    if (pendingProtocol) {
      applyProtocol(pendingProtocol);
      pendingProtocol = null;
    }

    renderMeta();
    redraw();
  });
}

/* ================= Controls ================= */

function buildControls() {
  controls.innerHTML = "";
  controls.classList.remove("hidden");
  controls.className = "bg-white rounded p-4 flex flex-col gap-3 border border-slate-200";

  /* Top protocol workspace cards */
  const protoBar = document.createElement("div");
  protoBar.className = "top-card rounded border border-slate-200 bg-slate-50 p-2 flex items-center gap-2";

  const protoTitle = document.createElement("div");
  protoTitle.className = "text-[11px] uppercase tracking-wide font-semibold text-slate-600 mr-1";
  protoTitle.textContent = "Actions";

  const btnGroup = document.createElement("div");
  btnGroup.className = "flex items-center gap-1.5 flex-nowrap";

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn";
  exportBtn.textContent = "Save";
  exportBtn.onclick = exportProtocol;

  const importBtn = document.createElement("button");
  importBtn.className = "btn";
  importBtn.textContent = "Load";
  importBtn.onclick = importProtocol;

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn";
  resetBtn.textContent = "Reset";
  resetBtn.onclick = resetProtocolUiOnly;

  const copyLinkBtn = document.createElement("button");
  copyLinkBtn.className = "btn";
  copyLinkBtn.textContent = "Link";
  copyLinkBtn.onclick = copyProtocolLink;

  themeToggleBtn = document.createElement("button");
  themeToggleBtn.className = "btn";
  themeToggleBtn.onclick = toggleTheme;
  applyTheme(currentTheme);

  protocolFilenameLabelEl = document.createElement("div");
  protocolFilenameLabelEl.className = "text-xs text-slate-600 ml-auto truncate";
  updateProtocolFilenameLabel();

  protoBar.appendChild(protoTitle);
  btnGroup.appendChild(exportBtn);
  btnGroup.appendChild(importBtn);
  btnGroup.appendChild(resetBtn);
  btnGroup.appendChild(copyLinkBtn);
  btnGroup.appendChild(themeToggleBtn);
  protoBar.appendChild(btnGroup);
  protoBar.appendChild(protocolFilenameLabelEl);

  const labelCard = document.createElement("div");
  labelCard.className = "top-card rounded border border-slate-200 bg-slate-50 p-2";
  const labelTitle = document.createElement("div");
  labelTitle.className = "text-[11px] uppercase tracking-wide font-semibold text-slate-600 mb-1";
  labelTitle.textContent = "Protocol Label";
  branchTagInput = document.createElement("input");
  branchTagInput.type = "text";
  branchTagInput.placeholder = "e.g., fs32, qc1, motionTrim";
  branchTagInput.oninput = renderMeta;
  branchTagInput.className = "p-2 border rounded bg-white w-full";
  labelCard.appendChild(labelTitle);
  labelCard.appendChild(branchTagInput);

  const summaryCard = document.createElement("div");
  summaryCard.className = "top-card rounded border border-slate-200 bg-slate-50 p-2";
  const summaryTitle = document.createElement("div");
  summaryTitle.className = "text-[11px] uppercase tracking-wide font-semibold text-slate-600 mb-1";
  summaryTitle.textContent = "Protocol Summary";
  protocolSummaryEl = document.createElement("div");
  protocolSummaryEl.className = "text-[13px] leading-tight whitespace-pre-wrap max-h-12 overflow-y-auto text-slate-700";
  protocolSummaryEl.textContent = "No protocol summary yet.";
  summaryCard.appendChild(summaryTitle);
  summaryCard.appendChild(protocolSummaryEl);

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-2 items-start";

  const selectRow = document.createElement("div");
  selectRow.className = "grid grid-cols-1 gap-2";

  const wlDiv = document.createElement("div");
  wlDiv.className = "rounded border border-slate-200 p-3 flex flex-col gap-2";
  wlDiv.innerHTML = "<div class='font-semibold'>Wavelength (nm)</div>";
  const wlRow = document.createElement("div");
  wlRow.className = "wl-choice-row";

  ["wl1", "wl2"].forEach((wl) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice-btn wl-choice-btn";
    b.dataset.wlChoice = wl;
    b.textContent = wl === "wl1" ? "760" : "850";
    b.onclick = () => {
      currentWavelength = wl;
      rebuildRadioSelections();
      redraw();
      renderMeta();
    };
    wlRow.appendChild(b);
  });
  wlDiv.appendChild(wlRow);

  const chDiv = document.createElement("div");
  chDiv.className = "rounded border border-slate-200 p-3 flex flex-col gap-2";
  chDiv.innerHTML = "<div class='font-semibold'>Channel</div>";

  const groups = groupChannelsBySource(channelLabels);
  groups.forEach(g => {
    const row = document.createElement("div");
    row.className = "channel-group-row";

    const src = document.createElement("div");
    src.className = "channel-source-label";
    src.textContent = g.source + ":";
    row.appendChild(src);

    const btnWrap = document.createElement("div");
    btnWrap.className = "channel-choice-row";

    g.items.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice-btn channel-choice-btn";
      b.dataset.chChoice = String(item.index);
      b.textContent = item.detectorLabel;
      b.title = item.fullLabel;
      b.onclick = () => {
        currentChannel = item.index;
        rebuildRadioSelections();
        redraw();
        renderMeta();
      };
      btnWrap.appendChild(b);
    });

    row.appendChild(btnWrap);
    chDiv.appendChild(row);
  });

  const processRow = document.createElement("div");
  processRow.className = "grid grid-cols-2 gap-2";

  const exDiv = document.createElement("div");
  exDiv.className = "rounded border border-slate-200 p-3 flex flex-col space-y-1";
  exDiv.innerHTML = "<div class='font-semibold'>Cut intervals (s)</div>";

  exclusionTable = document.createElement("textarea");
  exclusionTable.rows = 2;
  exclusionTable.placeholder = "23, 25\n34, 36";
  exclusionTable.oninput = () => { redraw(); renderMeta(); };
  exclusionTable.className = "p-2 border rounded bg-white w-full";
  exDiv.appendChild(exclusionTable);

  const fDiv = document.createElement("div");
  fDiv.className = "rounded border border-slate-200 p-3 flex flex-col space-y-1";
  fDiv.innerHTML = "<div class='font-semibold'>Butterworth filter (4th)</div>";

  lowCutInput = document.createElement("input");
  lowCutInput.type = "text";
  lowCutInput.inputMode = "decimal";
  lowCutInput.placeholder = "0.1";
  lowCutInput.oninput = () => { redraw(); renderMeta(); };
  lowCutInput.className = "p-2 border rounded bg-white w-full";
  lowCutInput.value = "0.1";
  const lowLbl = document.createElement("div");
  lowLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  lowLbl.textContent = "Low:";
  lowToggleBtn = document.createElement("button");
  lowToggleBtn.type = "button";
  lowToggleBtn.className = "filter-toggle-btn";
  lowToggleBtn.onclick = () => {
    lowCutEnabled = !lowCutEnabled;
    updateFilterToggleButtons();
    redraw();
    renderMeta();
  };
  const lowRow = document.createElement("div");
  lowRow.className = "grid grid-cols-[auto_56px_auto] gap-2 items-center";
  lowRow.appendChild(lowLbl);
  lowRow.appendChild(lowCutInput);
  lowRow.appendChild(lowToggleBtn);

  highCutInput = document.createElement("input");
  highCutInput.type = "text";
  highCutInput.inputMode = "decimal";
  highCutInput.placeholder = "10.0";
  highCutInput.oninput = () => { redraw(); renderMeta(); };
  highCutInput.className = "p-2 border rounded bg-white w-full";
  highCutInput.value = "10.0";
  const highLbl = document.createElement("div");
  highLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  highLbl.textContent = "High:";
  highToggleBtn = document.createElement("button");
  highToggleBtn.type = "button";
  highToggleBtn.className = "filter-toggle-btn";
  highToggleBtn.onclick = () => {
    highCutEnabled = !highCutEnabled;
    updateFilterToggleButtons();
    redraw();
    renderMeta();
  };
  const highRow = document.createElement("div");
  highRow.className = "grid grid-cols-[auto_56px_auto] gap-2 items-center";
  highRow.appendChild(highLbl);
  highRow.appendChild(highCutInput);
  highRow.appendChild(highToggleBtn);

  const engineRow = document.createElement("div");
  engineRow.className = "grid grid-cols-[auto_1fr] gap-2 items-center";
  const engineLbl = document.createElement("div");
  engineLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  engineLbl.textContent = "Engine:";
  filterEngineSelect = document.createElement("select");
  filterEngineSelect.className = "p-2 border rounded bg-white w-full text-sm";
  const optLegacy = document.createElement("option");
  optLegacy.value = "legacy";
  optLegacy.textContent = "Legacy biquad";
  const optSos = document.createElement("option");
  optSos.value = "sos";
  optSos.textContent = "SOS biquad";
  filterEngineSelect.appendChild(optLegacy);
  filterEngineSelect.appendChild(optSos);
  filterEngineSelect.value = "sos";
  filterEngineSelect.onchange = () => {
    redraw();
    renderMeta();
  };
  engineRow.appendChild(engineLbl);
  engineRow.appendChild(filterEngineSelect);
  filterEngineSelect.title = "Filter implementation selector.";

  const dcRow = document.createElement("div");
  dcRow.className = "grid grid-cols-[auto_1fr] gap-2 items-center";
  const dcLbl = document.createElement("div");
  dcLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  dcLbl.textContent = "DC restore:";
  dcRestoreCheckbox = document.createElement("input");
  dcRestoreCheckbox.type = "checkbox";
  dcRestoreCheckbox.className = "h-4 w-4 justify-self-start";
  dcRestoreCheckbox.checked = true;
  dcRestoreCheckbox.onchange = () => {
    redraw();
    renderMeta();
  };
  dcRow.appendChild(dcLbl);
  dcRow.appendChild(dcRestoreCheckbox);
  dcRestoreCheckbox.title = "Restore original mean after filtering/scaling.";

  const viewCard = document.createElement("div");
  viewCard.className = "rounded border border-slate-200 p-3 flex flex-col space-y-2";
  const viewTitle = document.createElement("div");
  viewTitle.className = "font-semibold";
  viewTitle.textContent = "Plot view";
  const viewRow = document.createElement("div");
  viewRow.className = "grid grid-cols-[auto_1fr] gap-2 items-center";
  const viewLbl = document.createElement("div");
  viewLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  viewLbl.textContent = "Plot view:";
  plotModeSelect = document.createElement("select");
  plotModeSelect.className = "p-2 border rounded bg-white w-full text-sm";
  [
    { value: "both", label: "Raw + Trimmed" },
    { value: "raw", label: "Raw only" },
    { value: "trimmed", label: "Trimmed only" }
  ].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    plotModeSelect.appendChild(o);
  });
  plotModeSelect.value = currentPlotMode;
  plotModeSelect.onchange = () => setPlotMode(plotModeSelect.value);
  plotModeSelect.title = "Choose which plot panel is shown.";
  viewRow.appendChild(viewLbl);
  viewRow.appendChild(plotModeSelect);
  viewCard.appendChild(viewTitle);
  viewCard.appendChild(viewRow);

  fDiv.appendChild(lowRow);
  fDiv.appendChild(highRow);
  fDiv.appendChild(engineRow);
  fDiv.appendChild(dcRow);
  const notesDiv = document.createElement("div");
  notesDiv.className = "rounded border border-slate-200 p-3 flex flex-col space-y-2";
  const notesLabel = document.createElement("div");
  notesLabel.className = "font-semibold";
  notesLabel.textContent = "Notes";
  notesInput = document.createElement("textarea");
  notesInput.rows = 1;
  notesInput.placeholder = "Notes about processing choices, rationale, caveats...";
  notesInput.oninput = renderMeta;
  notesInput.style.maxHeight = "56px";
  notesInput.style.overflowY = "auto";
  notesInput.style.resize = "vertical";
  notesInput.className = "p-2 border rounded bg-white w-full text-sm";
  notesDiv.appendChild(notesLabel);
  notesDiv.appendChild(notesInput);

  selectRow.appendChild(wlDiv);
  selectRow.appendChild(chDiv);
  processRow.appendChild(exDiv);
  processRow.appendChild(fDiv);
  grid.appendChild(notesDiv);
  grid.appendChild(selectRow);
  grid.appendChild(processRow);
  rebuildRadioSelections();
  updateFilterToggleButtons();

  if (protocolHost) {
  protocolHost.innerHTML = "";
  protocolHost.className = "min-w-[280px] w-full col-span-3 grid grid-cols-4 gap-2";
  protocolHost.appendChild(protoBar);
  protocolHost.appendChild(labelCard);
  protocolHost.appendChild(summaryCard);
  protocolHost.appendChild(viewCard);
  protocolHost.classList.remove("hidden");
  }

  controls.appendChild(grid);
}

function updateProtocolFilenameLabel() {
  if (!protocolFilenameLabelEl) return;
  if (!lastProtocolFilename) {
    protocolFilenameLabelEl.textContent = "";
    return;
  }
  protocolFilenameLabelEl.textContent = "file: " + lastProtocolFilename;
}

function updateProtocolSummaryLabel(text) {
  if (!protocolSummaryEl) return;
  protocolSummaryEl.textContent = text || "No protocol summary yet.";
}

function updateFilterToggleButtons() {
  if (lowToggleBtn) {
    lowToggleBtn.textContent = lowCutEnabled ? "✅" : "❌";
    lowToggleBtn.classList.toggle("active", lowCutEnabled);
    lowToggleBtn.classList.toggle("inactive", !lowCutEnabled);
  }
  if (highToggleBtn) {
    highToggleBtn.textContent = highCutEnabled ? "✅" : "❌";
    highToggleBtn.classList.toggle("active", highCutEnabled);
    highToggleBtn.classList.toggle("inactive", !highCutEnabled);
  }
}

function resetProtocolUiOnly() {
  if (!data.wl1) return;

  currentWavelength = "wl2";
  currentChannel = 0;

  if (branchTagInput) branchTagInput.value = "";
  if (notesInput) notesInput.value = "";

  if (exclusionTable) exclusionTable.value = "";

  lowCutEnabled = true;
  highCutEnabled = true;
  updateFilterToggleButtons();
  if (lowCutInput) lowCutInput.value = "0.1";
  if (highCutInput) highCutInput.value = "10.0";
  if (filterEngineSelect) filterEngineSelect.value = "sos";
  if (dcRestoreCheckbox) dcRestoreCheckbox.checked = true;
  if (plotModeSelect) plotModeSelect.value = currentPlotMode;

  lastProtocolFilename = "";
  updateProtocolFilenameLabel();

  rebuildRadioSelections();
  renderMeta();
  redraw();
}

/* ================= Plotting ================= */

function redraw() {
  if (!data.wl1) return;

  const raw = data[currentWavelength].map(r => r[currentChannel]);
  let filtered = raw.slice();
  let filterLabel = "no filter";

  const low = parseFloat(lowCutInput.value);
  const high = parseFloat(highCutInput.value);
  const requestedLowHz = lowCutEnabled && Number.isFinite(low) ? low : null;
  const requestedHighHz = highCutEnabled && Number.isFinite(high) ? high : null;
  const validated = validateFilterCutoffs(samplingRate, requestedLowHz, requestedHighHz);
  const lowHz = validated.lowHz;
  const highHz = validated.highHz;
  const filterEngine = getFilterEngine();
  const dcRestore = isDcRestoreEnabled();

  if (lowHz !== null || highHz !== null) {
    filtered = butterworth4(raw, samplingRate, lowHz, highHz, filterEngine);
    filtered = rmsNormalize(raw, filtered, Math.ceil(samplingRate || 0));
    if (dcRestore) filtered = restoreDcMean(raw, filtered);

    if (lowHz && highHz) filterLabel = "BP " + lowHz + "-" + highHz + " Hz";
    else if (lowHz) filterLabel = "HP " + lowHz + " Hz";
    else if (highHz) filterLabel = "LP " + highHz + " Hz";
    else filterLabel = "filter enabled";
  }

  const intervals = parseIntervals(exclusionTable.value);
  const processed = applyExclusions(filtered, intervals);
  const trimmedEvents = adjustEvents(events, intervals);

  const wlLabel = currentWavelength === "wl1" ? "760 nm" : "850 nm";
  const chLabel = channelLabels[currentChannel];
  if (rawPlotHeaderEl) rawPlotHeaderEl.textContent = wlLabel + " " + chLabel + " Raw | " + formatStats(computeStats(raw));
  if (trimPlotHeaderEl) trimPlotHeaderEl.textContent = wlLabel + " " + chLabel + " Trimmed (" + filterLabel + ") | " + formatStats(computeStats(processed));

  drawPlot(
    ctxRaw,
    canvasRaw,
    raw,
    samplingRate,
    intervals,
    events.map(e => ({ time: e.sample / samplingRate, code: e.code })),
    wlLabel + " " + chLabel + " Raw",
    formatStats(computeStats(raw))
  );

  drawPlot(
    ctxTrim,
    canvasTrim,
    processed,
    samplingRate,
    null,
    trimmedEvents,
    wlLabel + " " + chLabel + " Trimmed (" + filterLabel + ")",
    formatStats(computeStats(processed))
  );
}

/* ================= Meta and protocol summary ================= */

function renderMeta() {
  if (!data.wl1 || !samplingRate) return;

  const summary = buildProtocolSummary(buildProtocolObject());
  updateProtocolSummaryLabel(summary);

  const bHdr = basename(sources.hdr) || "missing";
  const bWl1 = basename(sources.wl1) || "missing";
  const bWl2 = basename(sources.wl2) || "missing";
  const bEvt = basename(sources.evt) || "none";
  const bProbe = basename(sources.probeMat) || "none";

  const low = parseFloat(lowCutInput.value);
  const high = parseFloat(highCutInput.value);
  const requestedLowHz = lowCutEnabled && Number.isFinite(low) ? low : null;
  const requestedHighHz = highCutEnabled && Number.isFinite(high) ? high : null;
  const validated = validateFilterCutoffs(samplingRate, requestedLowHz, requestedHighHz);
  const lowHz = validated.lowHz;
  const highHz = validated.highHz;

  let filterText = "off";
  if (lowHz !== null && highHz !== null) filterText = "BP " + lowHz + "-" + highHz + " Hz";
  else if (lowHz !== null) filterText = "HP " + lowHz + " Hz";
  else if (highHz !== null) filterText = "LP " + highHz + " Hz";
  const filterEngine = getFilterEngine();
  const dcRestore = isDcRestoreEnabled();
  const filterWarning = validated.warning ? escapeHtml(validated.warning) : "";

  const labelText = (branchTagInput ? branchTagInput.value.trim() : "") || "none";
  let eventRows = "";
  if (!events.length) {
    eventRows = "<tr><td class='border px-2 py-2 text-slate-600' colspan='2'>No events found</td></tr>";
  } else {
    events.forEach(e => {
      eventRows += "<tr>"
        + "<td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + (e.sample / samplingRate).toFixed(2) + "</td>"
        + "<td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + e.code + "</td>"
        + "</tr>";
    });
  }

  const html = ""
    + "<div class='space-y-2'>"
    + "  <details class='rounded border border-slate-200 p-2'>"
    + "    <summary class='font-semibold cursor-pointer select-none'>Recording Summary</summary>"
    + "    <div class='grid grid-cols-2 gap-x-3 gap-y-1 text-sm mt-2'>"
    + "      <div class='text-slate-600'>Dataset</div><div class='break-all'>" + escapeHtml(datasetLabel) + "</div>"
    + "      <div class='text-slate-600'>Input type</div><div>" + escapeHtml(inputTypeLabel) + "</div>"
    + "      <div class='text-slate-600'>Sampling rate</div><div>" + samplingRate + " Hz</div>"
    + "      <div class='text-slate-600'>Samples</div><div>" + data.wl1.length + "</div>"
    + "      <div class='text-slate-600'>Duration</div><div>" + (data.wl1.length / samplingRate).toFixed(2) + " s</div>"
    + "      <div class='text-slate-600'>Channels</div><div>" + data.wl1[0].length + "</div>"
    + "      <div class='text-slate-600'>Filter</div><div>" + escapeHtml(filterText) + "</div>"
    + "      <div class='text-slate-600'>Filter engine</div><div>" + escapeHtml(filterEngine) + "</div>"
    + "      <div class='text-slate-600'>DC restore</div><div>" + (dcRestore ? "on" : "off") + "</div>"
    + "      <div class='text-slate-600'>Filter note</div><div>" + (filterWarning || "none") + "</div>"
    + "      <div class='text-slate-600'>Protocol label</div><div>" + escapeHtml(labelText) + "</div>"
    + "      <div class='text-slate-600'>App version</div><div>" + APP_VERSION + "</div>"
    + "      <div class='text-slate-600'>Protocol schema</div><div>" + PROTOCOL_SCHEMA_VERSION + "</div>"
    + "    </div>"
    + "  </details>"
    + "  <details class='rounded border border-slate-200 p-2'>"
    + "    <summary class='font-semibold cursor-pointer select-none'>File Sources</summary>"
    + "    <div class='grid grid-cols-2 gap-x-3 gap-y-1 text-sm mt-2'>"
    + "      <div class='text-slate-600'>HDR</div><div>" + escapeHtml(bHdr) + "</div>"
    + "      <div class='text-slate-600'>WL1</div><div>" + escapeHtml(bWl1) + "</div>"
    + "      <div class='text-slate-600'>WL2</div><div>" + escapeHtml(bWl2) + "</div>"
    + "      <div class='text-slate-600'>EVT</div><div>" + escapeHtml(bEvt) + "</div>"
    + "      <div class='text-slate-600'>probeInfo</div><div>" + escapeHtml(bProbe) + "</div>"
    + "      <div class='text-slate-600'>Sampling rate from</div><div>" + escapeHtml(basename(sources.samplingRateFrom) || "?") + "</div>"
    + "      <div class='text-slate-600'>Events from</div><div>" + escapeHtml(basename(sources.eventsFrom) || "?") + "</div>"
    + "      <div class='text-slate-600'>Channel labels from</div><div>" + escapeHtml(basename(sources.channelLabelsFrom) || "?") + "</div>"
    + "    </div>"
    + "  </details>"
    + "  <details class='rounded border border-slate-200 p-2'>"
    + "    <summary class='font-semibold cursor-pointer select-none'>Events</summary>"
    + "    <table class='w-full text-sm border-collapse mt-2' style='table-layout: fixed;'>"
    + "      <thead>"
    + "        <tr class='bg-slate-50'>"
    + "          <th class='border px-2 py-1 text-left' style='width: 80px;'>Time (s)</th>"
    + "          <th class='border px-2 py-1 text-left' style='width: 60px;'>Code</th>"
    + "        </tr>"
    + "      </thead>"
    + "      <tbody>"
    + eventRows
    + "      </tbody>"
    + "    </table>"
    + "  </details>"
    + "</div>";

  metaDiv.innerHTML = html;
}

/* ================= Protocol object, export, import ================= */

function buildProtocolObject() {
  const label = (branchTagInput ? branchTagInput.value.trim() : "") || "";
  const notes = notesInput ? notesInput.value : "";

  const intervals = parseIntervals(exclusionTable.value);

  const low = parseFloat(lowCutInput.value);
  const high = parseFloat(highCutInput.value);

  const requestedLowHz = lowCutEnabled && Number.isFinite(low) ? low : null;
  const requestedHighHz = highCutEnabled && Number.isFinite(high) ? high : null;
  const validated = validateFilterCutoffs(samplingRate, requestedLowHz, requestedHighHz);
  const lowHz = validated.lowHz;
  const highHz = validated.highHz;
  const filterEngine = getFilterEngine();
  const dcRestore = isDcRestoreEnabled();

  const steps = [];

  steps.push({
    step: "filter_butterworth_iir",
    enabled: (lowHz !== null || highHz !== null),
    order: 4,
    lowHz: lowHz,
    highHz: highHz,
    implementation: filterEngine,
    dcRestore: dcRestore,
    plotView: currentPlotMode,
    amplitudePreservation: "rms_normalize_to_pre_filter"
  });

  steps.push({
    step: "trim",
    enabled: true,
    intervalsSeconds: intervals
  });

  const protocol = {
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    datasetLabel: datasetLabel,
    protocolLabel: label,
    selection: {
      wavelength: currentWavelength,
      channelIndex: currentChannel
    },
    steps: steps,
    notes: notes,
    sources: {
      hdr: sources.hdr,
      wl1: sources.wl1,
      wl2: sources.wl2,
      evt: sources.evt,
      probeInfoMat: sources.probeMat,
      samplingRateFrom: sources.samplingRateFrom,
      eventsFrom: sources.eventsFrom,
      channelLabelsFrom: sources.channelLabelsFrom
    }
  };

  protocol.protocolSummary = buildProtocolSummary(protocol);

  return protocol;
}

function buildProtocolSummary(protocol) {
  const wl = protocol.selection && protocol.selection.wavelength ? protocol.selection.wavelength : currentWavelength;
  const wlTxt = wl === "wl1" ? "760" : "850";

  const chIdx = protocol.selection && Number.isFinite(Number(protocol.selection.channelIndex))
    ? Number(protocol.selection.channelIndex)
    : currentChannel;

  const chLbl = channelLabels[chIdx] ? channelLabels[chIdx] : ("ch" + String(chIdx + 1));

  const label = protocol.protocolLabel ? protocol.protocolLabel : "";
  const labelPart = label ? ("label=" + label + " | ") : "";

  let trimPart = "trim=none";
  const trimStep = (protocol.steps || []).find(s => s.step === "trim");
  if (trimStep && trimStep.enabled && Array.isArray(trimStep.intervalsSeconds) && trimStep.intervalsSeconds.length) {
    const n = trimStep.intervalsSeconds.length;
    const ints = trimStep.intervalsSeconds
      .map(x => Number(x.start).toFixed(2) + "-" + Number(x.end).toFixed(2))
      .join(",");
    trimPart = "trim=" + n + " [" + ints + "]";
  }

  let filterPart = "filter=off";
  const f = (protocol.steps || []).find(s => s.step === "filter_butterworth_iir");
  if (f && f.enabled) {
    const low = (f.lowHz === null || typeof f.lowHz === "undefined") ? "" : String(f.lowHz);
    const high = (f.highHz === null || typeof f.highHz === "undefined") ? "" : String(f.highHz);
    if (low && high) filterPart = "filter=bp(" + low + "-" + high + ") o" + String(f.order);
    else if (low) filterPart = "filter=hp(" + low + ") o" + String(f.order);
    else if (high) filterPart = "filter=lp(" + high + ") o" + String(f.order);
    else filterPart = "filter=on o" + String(f.order);
    if (f.implementation) filterPart += " " + String(f.implementation);
    if (f.dcRestore) filterPart += " dc";
    filterPart += " amp=rms";
  }

  return labelPart + "wl=" + wlTxt + " | ch=" + chLbl + " | " + filterPart + " | " + trimPart;
}

function exportProtocol() {
  if (!data.wl1) return;

  const proto = buildProtocolObject();
  const blob = new Blob([JSON.stringify(proto, null, 2)], { type: "application/json" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultProtocolFilename(proto);
  a.click();

  lastProtocolFilename = a.download;
  updateProtocolFilenameLabel();
}

function importProtocol() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".pipe,.json,.zip,application/json";

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".zip")) {
      handleInput({ target: { files: [file] } });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        const normalized = normalizeProtocol(raw);
        if (data.wl1) applyProtocol(normalized);
        else pendingProtocol = normalized;

        lastProtocolFilename = basename(file.name);
        updateProtocolFilenameLabel();
      } catch (err) {
        metaDiv.textContent = "Protocol import failed: " + err;
      }
    };
    reader.readAsText(file);
  };

  fileInput.click();
}

function applyProtocol(protocol) {
  const p = normalizeProtocol(protocol);

  if (branchTagInput) branchTagInput.value = p.protocolLabel || "";
  if (notesInput) notesInput.value = p.notes || "";

  const sel = p.selection || {};
  const wl = sel.wavelength === "wl2" ? "wl2" : "wl1";
  const ch = Number.isFinite(Number(sel.channelIndex)) ? Number(sel.channelIndex) : 0;

  currentWavelength = wl;
  currentChannel = ch;

  if (data.wl1 && currentChannel >= data.wl1[0].length) currentChannel = data.wl1[0].length - 1;
  if (currentChannel < 0) currentChannel = 0;

  const trimStep = (p.steps || []).find(s => s.step === "trim");
  if (trimStep && trimStep.enabled && Array.isArray(trimStep.intervalsSeconds)) {
    exclusionTable.value = trimStep.intervalsSeconds
      .map(x => Number(x.start) + "," + Number(x.end))
      .join("\n");
  } else {
    exclusionTable.value = "";
  }

  const f = (p.steps || []).find(s => s.step === "filter_butterworth_iir");
  const requestedPlotView = (f && (f.plotView === "raw" || f.plotView === "trimmed" || f.plotView === "both"))
    ? f.plotView
    : currentPlotMode;
  if (f && f.enabled) {
    lowCutEnabled = (f.lowHz !== null && typeof f.lowHz !== "undefined");
    highCutEnabled = (f.highHz !== null && typeof f.highHz !== "undefined");
    lowCutInput.value = (f.lowHz === null || typeof f.lowHz === "undefined") ? "0.1" : String(f.lowHz);
    highCutInput.value = (f.highHz === null || typeof f.highHz === "undefined") ? "10.0" : String(f.highHz);
    if (filterEngineSelect) {
      filterEngineSelect.value = (f.implementation === "legacy") ? "legacy" : "sos";
    }
    if (dcRestoreCheckbox) dcRestoreCheckbox.checked = !!f.dcRestore;
  } else {
    lowCutEnabled = true;
    highCutEnabled = true;
    lowCutInput.value = "0.1";
    highCutInput.value = "10.0";
    if (filterEngineSelect) filterEngineSelect.value = "sos";
    if (dcRestoreCheckbox) dcRestoreCheckbox.checked = true;
  }
  if (plotModeSelect) plotModeSelect.value = requestedPlotView;
  setPlotMode(requestedPlotView);
  updateFilterToggleButtons();

  rebuildRadioSelections();
  renderMeta();
  redraw();
}

/* ================= URL protocol share ================= */

function copyProtocolLink() {
  if (!data.wl1) return;

  const proto = buildProtocolObject();
  const compact = {
    protocolSchemaVersion: proto.protocolSchemaVersion,
    protocolLabel: proto.protocolLabel,
    selection: proto.selection,
    steps: proto.steps,
    notes: proto.notes,
    protocolSummary: proto.protocolSummary
  };

  const enc = encodeForUrl(compact);
  if (!enc) return;

  const base = window.location.href.split("#")[0];
  const link = base + "#protocol=" + enc;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link);
  } else {
    window.prompt("Copy link:", link);
  }
}

function initUrlProtocolListener() {
  const p = parseProtocolFromHash();
  if (p) pendingProtocol = p;

  window.addEventListener("hashchange", () => {
    const s = parseProtocolFromHash();
    if (!s) return;
    if (data.wl1) applyProtocol(s);
    else pendingProtocol = s;
  });
}

function parseProtocolFromHash() {
  const h = window.location.hash || "";
  const m = h.match(/#protocol=([^&]+)/);
  if (!m) return null;

  try {
    const json = decodeFromUrl(m[1]);
    const obj = JSON.parse(json);
    return normalizeProtocol(obj);
  } catch {
    return null;
  }
}

function encodeForUrl(obj) {
  try {
    const json = JSON.stringify(obj);
    return base64EncodeUtf8(json);
  } catch {
    return null;
  }
}

function decodeFromUrl(s) {
  return base64DecodeUtf8(s);
}

/* ================= Protocol normalization ================= */

function normalizeProtocol(raw) {
  const out = {
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: raw && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    datasetLabel: raw && typeof raw.datasetLabel === "string" ? raw.datasetLabel : datasetLabel,
    protocolLabel: raw && typeof raw.protocolLabel === "string" ? raw.protocolLabel : "",
    selection: {
      wavelength: raw && raw.selection && raw.selection.wavelength === "wl1" ? "wl1" : "wl2",
      channelIndex: raw && raw.selection && Number.isFinite(Number(raw.selection.channelIndex))
        ? Number(raw.selection.channelIndex)
        : 0
    },
    steps: Array.isArray(raw && raw.steps) ? raw.steps : [],
    notes: raw && typeof raw.notes === "string" ? raw.notes : "",
    sources: raw && raw.sources && typeof raw.sources === "object" ? raw.sources : {},
    protocolSummary: raw && typeof raw.protocolSummary === "string" ? raw.protocolSummary : ""
  };

  if (!out.steps.length) {
    out.steps = [
      { step: "filter_butterworth_iir", enabled: false, order: 4, lowHz: null, highHz: null, implementation: "sos", dcRestore: true, plotView: "both", amplitudePreservation: "rms_normalize_to_pre_filter" },
      { step: "trim", enabled: true, intervalsSeconds: [] }
    ];
  }

  const trim = out.steps.find(s => s.step === "trim");
  if (trim) {
    trim.enabled = !!trim.enabled;
    if (!Array.isArray(trim.intervalsSeconds)) trim.intervalsSeconds = [];
    trim.intervalsSeconds = trim.intervalsSeconds
      .map(x => ({ start: Number(x.start), end: Number(x.end) }))
      .filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.start < x.end);
  }

  const f = out.steps.find(s => s.step === "filter_butterworth_iir");
  if (f) {
    f.enabled = !!f.enabled;
    f.order = 4;
    f.lowHz = (f.lowHz === null || typeof f.lowHz === "undefined") ? null : (Number.isFinite(Number(f.lowHz)) ? Number(f.lowHz) : null);
    f.highHz = (f.highHz === null || typeof f.highHz === "undefined") ? null : (Number.isFinite(Number(f.highHz)) ? Number(f.highHz) : null);
    f.implementation = f.implementation === "legacy" ? "legacy" : "sos";
    f.dcRestore = (typeof f.dcRestore === "boolean") ? f.dcRestore : true;
    f.plotView = (f.plotView === "raw" || f.plotView === "trimmed" || f.plotView === "both") ? f.plotView : "both";
    if (typeof f.amplitudePreservation !== "string") f.amplitudePreservation = "rms_normalize_to_pre_filter";
  }

  out.protocolSummary = buildProtocolSummary(out);
  return out;
}

/* ================= Filename helpers ================= */

function defaultProtocolFilename(protocol) {
  const base = sanitizeFilename(protocol.datasetLabel || "fnirs-webpipe");
  const label = sanitizeFilename((protocol.protocolLabel || "").trim());

  let name = base;
  if (label) name += "_" + label;
  name += "_protocol.pipe";
  return name;
}

/* ================= Misc helpers and parsing ================= */

function basename(p) {
  if (!p) return "";
  const s = String(p);
  const parts = s.split("/");
  return parts[parts.length - 1];
}

function stem(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(0, i) : n;
}

function sanitizeFilename(s) {
  return String(s || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function base64EncodeUtf8(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/=+$/g, "");
}

function base64DecodeUtf8(b64) {
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "====".slice(0, padLen);
  return decodeURIComponent(escape(atob(padded)));
}

function rmsNormalize(ref, x, edgeSamples) {
  const edge = Number.isFinite(edgeSamples) ? edgeSamples : 0;
  const trimEdges = (arr, n) => {
    if (!Number.isFinite(n) || n <= 0) return arr;
    if (arr.length <= (2 * n + 4)) return arr;
    return arr.slice(n, arr.length - n);
  };
  const mean = a => a.reduce((sum, v) => sum + v, 0) / a.length;
  const rmsCentered = a => {
    const m = mean(a);
    return Math.sqrt(a.reduce((sum, v) => {
      const d = v - m;
      return sum + d * d;
    }, 0) / a.length);
  };
  const refCore = trimEdges(ref, edge);
  const xCore = trimEdges(x, edge);
  const r0 = rmsCentered(refCore);
  const r1 = rmsCentered(xCore);
  if (r1 === 0 || !Number.isFinite(r1)) return x;
  const scale = r0 / r1;
  const clampedScale = Math.max(0.05, Math.min(50.0, scale));
  return x.map(v => v * clampedScale);
}

function extractChannelLabels(buf, expectedChannels) {
  if (typeof mat4js === "undefined") return defaultChannelLabels();

  try {
    const parsed = mat4js.read(buf);
    const probes = parsed.data.probeInfo.probes;
    if (!probes || !probes.index_c) return defaultChannelLabels();
    const labels = probes.index_c.map(pair => "S" + pair[0] + " D" + pair[1]);
    return labels.length === expectedChannels ? labels : defaultChannelLabels();
  } catch {
    return defaultChannelLabels();
  }
}

function parseSamplingRate(t) {
  const m = t.match(/SamplingRate\s*=\s*([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parseMatrix(t) {
  return t.trim().split(/\r?\n/).map(l =>
    l.trim().split(/\s+/).map(Number)
  );
}

function parseEvents(t) {
  return t.trim().split(/\r?\n/).map(l => {
    const p = l.trim().split(/\s+/).map(Number);
    return { sample: p[0], code: p[1] };
  });
}

function parseIntervals(text) {
  if (!text) return [];
  return text.split(/\r?\n/)
    .map(l => l.split(",").map(Number))
    .filter(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] < p[1])
    .map(p => ({ start: p[0], end: p[1] }));
}

function applyExclusions(series, intervals) {
  if (!intervals.length) return series.slice();
  return series.filter((_, i) => {
    const t = i / samplingRate;
    return !intervals.some(intv => t >= intv.start && t <= intv.end);
  });
}

function adjustEvents(eventsIn, intervals) {
  if (!eventsIn.length) return [];
  if (!intervals.length) return eventsIn.map(e => ({ time: e.sample / samplingRate, code: e.code }));

  const out = [];
  eventsIn.forEach(e => {
    const t = e.sample / samplingRate;
    let shift = 0;
    let excluded = false;

    intervals.forEach(intv => {
      if (t >= intv.start && t <= intv.end) excluded = true;
      if (intv.end < t) shift += (intv.end - intv.start);
    });

    if (!excluded) out.push({ time: t - shift, code: e.code });
  });
  return out;
}

function defaultChannelLabels() {
  return data.wl1[0].map((_, i) => "Channel " + (i + 1));
}

function rebuildRadioSelections() {
  const wlButtons = document.querySelectorAll("button[data-wl-choice]");
  wlButtons.forEach(b => {
    const active = b.dataset.wlChoice === currentWavelength;
    b.classList.toggle("active", active);
  });

  const chButtons = document.querySelectorAll("button[data-ch-choice]");
  chButtons.forEach(b => {
    const active = Number(b.dataset.chChoice) === currentChannel;
    b.classList.toggle("active", active);
  });
}

function initPlotLayout() {
  const rawPanel = document.createElement("div");
  rawPanel.className = "plot-panel";
  rawPlotHeaderEl = document.createElement("div");
  rawPlotHeaderEl.className = "plot-header";
  rawPlotHeaderEl.textContent = "Raw";
  rawPanel.appendChild(rawPlotHeaderEl);
  rawPanel.appendChild(canvasRaw);

  const trimPanel = document.createElement("div");
  trimPanel.className = "plot-panel";
  trimPlotHeaderEl = document.createElement("div");
  trimPlotHeaderEl.className = "plot-header";
  trimPlotHeaderEl.textContent = "Trimmed";
  trimPanel.appendChild(trimPlotHeaderEl);
  trimPanel.appendChild(canvasTrim);

  rawPanelEl = rawPanel;
  trimPanelEl = trimPanel;

  plotGrid.innerHTML = "";
  plotGrid.appendChild(rawPanel);
  plotGrid.appendChild(trimPanel);
  applyPlotMode();
}

function computeStats(series) {
  const sorted = series.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) * (v - mean), 0) / series.length);

  return { mean, median, sd, min: sorted[0], max: sorted[sorted.length - 1] };
}

function formatStats(s) {
  return "mean " + formatMetricNumber(s.mean) +
    " | median " + formatMetricNumber(s.median) +
    " | sd " + formatMetricNumber(s.sd) +
    " | min " + formatMetricNumber(s.min) +
    " | max " + formatMetricNumber(s.max);
}

function validateFilterCutoffs(fs, lowHz, highHz) {
  let low = lowHz;
  let high = highHz;
  const warnings = [];

  if (!Number.isFinite(fs) || fs <= 0) {
    if (low !== null || high !== null) {
      warnings.push("Sampling rate is missing/invalid; filter disabled.");
    }
    return { lowHz: null, highHz: null, warning: warnings.join(" ") };
  }

  const nyq = fs / 2;
  const minHz = Math.max(1e-6, nyq * 1e-6);
  const maxHz = nyq * 0.95;

  if (low !== null && low <= 0) {
    warnings.push("Low cutoff must be > 0 Hz; clamped.");
    low = minHz;
  }

  if (high !== null && high <= 0) {
    warnings.push("High cutoff must be > 0 Hz; clamped.");
    high = minHz;
  }

  if (low !== null && low >= nyq) {
    warnings.push("Low cutoff must be below Nyquist (" + nyq.toFixed(3) + " Hz); clamped.");
    low = maxHz;
  }

  if (high !== null && high >= nyq) {
    warnings.push("High cutoff must be below Nyquist (" + nyq.toFixed(3) + " Hz); clamped.");
    high = maxHz;
  }

  if (low !== null && high !== null && low >= high) {
    warnings.push("Low cutoff was >= high cutoff; swapped.");
    const tmp = low;
    low = high;
    high = tmp;
  }

  if (low !== null && high !== null && high - low < minHz) {
    high = Math.min(maxHz, low + minHz);
    warnings.push("Band limits were too close; high cutoff adjusted.");
  }

  return { lowHz: low, highHz: high, warning: warnings.join(" ") };
}

function getFilterEngine() {
  if (!filterEngineSelect) return "sos";
  return filterEngineSelect.value === "legacy" ? "legacy" : "sos";
}

function applyPlotMode() {
  if (!rawPanelEl || !trimPanelEl || !plotGrid) return;

  const showRaw = (currentPlotMode === "both" || currentPlotMode === "raw");
  const showTrim = (currentPlotMode === "both" || currentPlotMode === "trimmed");

  rawPanelEl.style.display = showRaw ? "flex" : "none";
  trimPanelEl.style.display = showTrim ? "flex" : "none";

  if (showRaw && showTrim) {
    plotGrid.style.gridTemplateRows = "1fr 1fr";
  } else {
    plotGrid.style.gridTemplateRows = "1fr";
  }
}

function isDcRestoreEnabled() {
  if (!dcRestoreCheckbox) return true;
  return !!dcRestoreCheckbox.checked;
}

function groupChannelsBySource(labels) {
  const groups = new Map();

  labels.forEach((lbl, i) => {
    const m = String(lbl || "").match(/^S(\d+)\s*D(\d+)$/i);
    const source = m ? ("S" + m[1]) : "Channels";
    const detectorLabel = m ? ("D" + m[2]) : ("Ch" + String(i + 1));
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push({
      index: i,
      fullLabel: String(lbl || ("Channel " + String(i + 1))),
      detectorLabel: detectorLabel
    });
  });

  return Array.from(groups.entries()).map(([source, items]) => ({ source, items }));
}

function restoreDcMean(ref, x) {
  if (!Array.isArray(ref) || !Array.isArray(x) || !ref.length || !x.length) return x;
  const mean = arr => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const delta = mean(ref) - mean(x);
  return x.map(v => v + delta);
}

function formatMetricNumber(v) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.00";
  const abs = Math.abs(v);
  if (abs < 0.005) return v.toExponential(2);
  return v.toFixed(2);
}
