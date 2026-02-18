const APP_VERSION = "0.2";
const STATE_SCHEMA_VERSION = 1;

const input = document.getElementById("input");
const metaDiv = document.getElementById("meta");
const controls = document.getElementById("controls");

const canvasRaw = document.getElementById("plot");
const ctxRaw = canvasRaw.getContext("2d");

const canvasTrim = document.createElement("canvas");
canvasTrim.width = canvasRaw.width;
canvasTrim.height = canvasRaw.height;
canvasRaw.after(canvasTrim);
const ctxTrim = canvasTrim.getContext("2d");

const M = { left: 90, right: 20, top: 40, bottom: 60 };

let samplingRate = null;
let data = { wl1: null, wl2: null };
let events = [];
let channelLabels = [];
let channelLabelSource = "default";

let currentWavelength = "wl1";
let currentChannel = 0;

let exclusionTable = null;
let filterEnabled = false;
let lowCutInput = null;
let highCutInput = null;
let filterBox = null;

let notesInput = null;

/* ================= Input ================= */

input.addEventListener("change", handleInput);

async function handleInput(evt) {
  resetState();
  const files = Array.from(evt.target.files);

  if (files.length === 1 && files[0].name.endsWith(".zip")) {
    await loadZip(files[0]);
  } else {
    loadFiles(files);
  }
}

function resetState() {
  samplingRate = null;
  data = { wl1: null, wl2: null };
  events = [];
  channelLabels = [];
  channelLabelSource = "default";

  currentWavelength = "wl1";
  currentChannel = 0;

  filterEnabled = false;

  metaDiv.innerHTML = "";
  controls.classList.add("hidden");
  controls.innerHTML = "";

  ctxRaw.clearRect(0, 0, canvasRaw.width, canvasRaw.height);
  ctxTrim.clearRect(0, 0, canvasTrim.width, canvasTrim.height);
}

/* ================= Loading ================= */

async function loadZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);
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

function loadFiles(files) {
  const hdr = files.find(f => f.name.endsWith(".hdr"));
  const wl1 = files.find(f => f.name.endsWith(".wl1"));
  const wl2 = files.find(f => f.name.endsWith(".wl2"));
  const evt = files.find(f => f.name.endsWith(".evt"));
  const probeMat = files.find(f =>
    f.name.toLowerCase().includes("probeinfo") &&
    f.name.toLowerCase().endsWith(".mat")
  );

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
    data.wl1 = parseMatrix(wl1T);
    data.wl2 = parseMatrix(wl2T);
    events = evtT ? parseEvents(evtT) : [];

    if (matBuf) {
      channelLabels = extractChannelLabels(matBuf, data.wl1[0].length);
      channelLabelSource = "probeInfo.mat";
    } else {
      channelLabels = defaultChannelLabels();
      channelLabelSource = "default (probeInfo.mat not found)";
    }

    buildControls();
    controls.classList.remove("hidden");
    renderMeta();
    redraw();
  });
}

/* ================= Controls ================= */

function buildControls() {
  controls.innerHTML = "";
  controls.className = "flex flex-wrap gap-8 items-start";

  const wlDiv = document.createElement("div");
  wlDiv.className = "flex flex-col space-y-1";
  wlDiv.innerHTML = "<div class='font-semibold'>Wavelength</div>";

  ["wl1", "wl2"].forEach((wl, i) => {
    const label = document.createElement("label");
    label.className = "inline-flex items-center space-x-2";

    const r = document.createElement("input");
    r.type = "radio";
    r.name = "wavelength";
    r.checked = i === 0;
    r.onchange = () => {
      currentWavelength = wl;
      redraw();
    };

    label.appendChild(r);
    label.appendChild(document.createTextNode(wl === "wl1" ? "760 nm" : "850 nm"));
    wlDiv.appendChild(label);
  });

  const chDiv = document.createElement("div");
  chDiv.className = "flex flex-col space-y-1 max-h-48 overflow-y-auto";
  chDiv.innerHTML = "<div class='font-semibold'>Channel</div>";

  channelLabels.forEach((lbl, i) => {
    const label = document.createElement("label");
    label.className = "inline-flex items-center space-x-2";

    const r = document.createElement("input");
    r.type = "radio";
    r.name = "channel";
    r.checked = i === 0;
    r.onchange = () => {
      currentChannel = i;
      redraw();
    };

    label.appendChild(r);
    label.appendChild(document.createTextNode(lbl));
    chDiv.appendChild(label);
  });

  const exDiv = document.createElement("div");
  exDiv.className = "flex flex-col space-y-1";
  exDiv.innerHTML = "<div class='font-semibold'>Exclude intervals (s)</div>";

  exclusionTable = document.createElement("textarea");
  exclusionTable.rows = 4;
  exclusionTable.placeholder = "start,end";
  exclusionTable.oninput = redraw;
  exDiv.appendChild(exclusionTable);

  const fDiv = document.createElement("div");
  fDiv.className = "flex flex-col space-y-1";
  fDiv.innerHTML = "<div class='font-semibold'>Butterworth filter (4th)</div>";

  const fCheck = document.createElement("label");
  fCheck.className = "inline-flex items-center space-x-2";

  filterBox = document.createElement("input");
  filterBox.type = "checkbox";
  filterBox.onchange = () => {
    filterEnabled = filterBox.checked;
    renderMeta();
    redraw();
  };

  fCheck.appendChild(filterBox);
  fCheck.appendChild(document.createTextNode("enable"));

  lowCutInput = document.createElement("input");
  lowCutInput.type = "number";
  lowCutInput.step = "0.01";
  lowCutInput.placeholder = "Low Hz";
  lowCutInput.oninput = () => {
    renderMeta();
    redraw();
  };

  highCutInput = document.createElement("input");
  highCutInput.type = "number";
  highCutInput.step = "0.01";
  highCutInput.placeholder = "High Hz";
  highCutInput.oninput = () => {
    renderMeta();
    redraw();
  };

  fDiv.appendChild(fCheck);
  fDiv.appendChild(lowCutInput);
  fDiv.appendChild(highCutInput);

  const stateDiv = document.createElement("div");
  stateDiv.className = "flex flex-col space-y-2";

  const notesLabel = document.createElement("div");
  notesLabel.className = "font-semibold";
  notesLabel.textContent = "Notes";

  notesInput = document.createElement("textarea");
  notesInput.rows = 3;
  notesInput.placeholder = "Processing notes...";
  notesInput.oninput = renderMeta;

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export State";
  exportBtn.onclick = exportState;

  const importBtn = document.createElement("button");
  importBtn.textContent = "Import State";
  importBtn.onclick = importState;

  stateDiv.appendChild(notesLabel);
  stateDiv.appendChild(notesInput);
  stateDiv.appendChild(exportBtn);
  stateDiv.appendChild(importBtn);

  controls.appendChild(wlDiv);
  controls.appendChild(chDiv);
  controls.appendChild(exDiv);
  controls.appendChild(fDiv);
  controls.appendChild(stateDiv);
}

/* ================= Redraw ================= */

function redraw() {
  if (!data.wl1) return;

  const raw = data[currentWavelength].map(r => r[currentChannel]);
  const intervals = parseIntervals(exclusionTable.value);
  const trimmed = applyExclusions(raw, intervals);
  const trimmedEvents = adjustEvents(events, intervals);

  let processed = trimmed.slice();
  let filterLabel = "no filter";

  if (filterEnabled && trimmed.length > 10) {
    const low = parseFloat(lowCutInput.value) || null;
    const high = parseFloat(highCutInput.value) || null;

    processed = butterworth4(trimmed, samplingRate, low, high);
    processed = rmsNormalize(trimmed, processed);

    if (low && high) filterLabel = "BP " + low + "-" + high + " Hz";
    else if (low) filterLabel = "HP " + low + " Hz";
    else if (high) filterLabel = "LP " + high + " Hz";
  }

  const wlLabel = currentWavelength === "wl1" ? "760 nm" : "850 nm";
  const chLabel = channelLabels[currentChannel];

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

/* ================= Meta ================= */

function renderMeta() {
  const low = lowCutInput ? (parseFloat(lowCutInput.value) || null) : null;
  const high = highCutInput ? (parseFloat(highCutInput.value) || null) : null;

  let filterText = "off";
  if (filterEnabled) {
    if (low && high) filterText = "enabled (BP " + low + "-" + high + " Hz)";
    else if (low) filterText = "enabled (HP " + low + " Hz)";
    else if (high) filterText = "enabled (LP " + high + " Hz)";
    else filterText = "enabled";
  }

  let html = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <div class="font-semibold mb-2">Recording Summary</div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>Sampling rate</div><div>${samplingRate} Hz</div>
          <div>Samples</div><div>${data.wl1.length}</div>
          <div>Duration</div><div>${(data.wl1.length / samplingRate).toFixed(2)} s</div>
          <div>Channels</div><div>${data.wl1[0].length}</div>
          <div>Channel labels</div><div>${channelLabelSource}</div>
          <div>Filter</div><div>${filterText}</div>
          <div>App version</div><div>${APP_VERSION}</div>
          <div>State schema</div><div>${STATE_SCHEMA_VERSION}</div>
        </div>
        <div class="mt-3">
          <div class="font-semibold mb-1">Notes</div>
          <div class="text-sm whitespace-pre-wrap">${escapeHtml(notesInput ? notesInput.value : "")}</div>
        </div>
      </div>
      <div>
        <div class="font-semibold mb-2">Events</div>
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th class="border px-2 py-1">Time (s)</th>
              <th class="border px-2 py-1">Code</th>
            </tr>
          </thead>
          <tbody>
  `;

  events.forEach(e => {
    html += `
      <tr>
        <td class="border px-2 py-1">${(e.sample / samplingRate).toFixed(2)}</td>
        <td class="border px-2 py-1">${e.code}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  metaDiv.innerHTML = html;
}

/* ================= State Export ================= */

function buildStateObject() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    wavelength: currentWavelength,
    channel: currentChannel,
    exclusions: parseIntervals(exclusionTable.value),
    filter: {
      enabled: filterEnabled,
      lowHz: parseFloat(lowCutInput.value) || null,
      highHz: parseFloat(highCutInput.value) || null
    },
    notes: notesInput ? notesInput.value : ""
  };
}

function exportState() {
  const state = buildStateObject();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fnirs-webpipe-state.json";
  a.click();
}

/* ================= State Import ================= */

function importState() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const rawState = JSON.parse(reader.result);
      const normalized = normalizeState(rawState);
      applyState(normalized);
    };
    reader.readAsText(file);
  };

  fileInput.click();
}

/* ================= Version Compatibility ================= */

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return defaultStateObject();

  if (typeof raw.schemaVersion === "number") {
    if (raw.schemaVersion === STATE_SCHEMA_VERSION) return raw;
    return migrateState(raw);
  }

  return migrateLegacyState(raw);
}

function defaultStateObject() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    wavelength: "wl1",
    channel: 0,
    exclusions: [],
    filter: { enabled: false, lowHz: null, highHz: null },
    notes: ""
  };
}

function migrateState(state) {
  let s = state;

  if (s.schemaVersion === 0) {
    s = migrateLegacyState(s);
  }

  if (typeof s.schemaVersion !== "number") {
    s = migrateLegacyState(s);
  }

  s.schemaVersion = STATE_SCHEMA_VERSION;
  if (!s.appVersion) s.appVersion = APP_VERSION;
  if (!s.timestamp) s.timestamp = new Date().toISOString();

  if (!s.filter) s.filter = { enabled: false, lowHz: null, highHz: null };
  if (typeof s.filter.enabled !== "boolean") s.filter.enabled = false;
  if (typeof s.filter.lowHz !== "number") s.filter.lowHz = s.filter.lowHz || null;
  if (typeof s.filter.highHz !== "number") s.filter.highHz = s.filter.highHz || null;

  if (!Array.isArray(s.exclusions)) s.exclusions = [];
  s.exclusions = s.exclusions
    .map(x => ({ start: Number(x.start), end: Number(x.end) }))
    .filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.start < x.end);

  if (typeof s.wavelength !== "string") s.wavelength = "wl1";
  if (s.wavelength !== "wl1" && s.wavelength !== "wl2") s.wavelength = "wl1";

  s.channel = Number.isFinite(Number(s.channel)) ? Number(s.channel) : 0;
  if (s.channel < 0) s.channel = 0;

  if (typeof s.notes !== "string") s.notes = "";

  return s;
}

function migrateLegacyState(old) {
  const s = defaultStateObject();

  if (typeof old.wavelength === "string") s.wavelength = old.wavelength;
  if (typeof old.currentWavelength === "string") s.wavelength = old.currentWavelength;

  if (Number.isFinite(Number(old.channel))) s.channel = Number(old.channel);
  if (Number.isFinite(Number(old.currentChannel))) s.channel = Number(old.currentChannel);

  if (Array.isArray(old.exclusions)) s.exclusions = old.exclusions;
  if (Array.isArray(old.intervals)) s.exclusions = old.intervals;

  if (old.filter && typeof old.filter === "object") {
    s.filter.enabled = !!old.filter.enabled;
    s.filter.lowHz = Number.isFinite(Number(old.filter.lowHz)) ? Number(old.filter.lowHz) : null;
    s.filter.highHz = Number.isFinite(Number(old.filter.highHz)) ? Number(old.filter.highHz) : null;
  } else {
    if (typeof old.filterEnabled === "boolean") s.filter.enabled = old.filterEnabled;
    if (Number.isFinite(Number(old.lowHz))) s.filter.lowHz = Number(old.lowHz);
    if (Number.isFinite(Number(old.highHz))) s.filter.highHz = Number(old.highHz);
  }

  if (typeof old.notes === "string") s.notes = old.notes;

  if (typeof old.timestamp === "string") s.timestamp = old.timestamp;

  return migrateState(s);
}

function applyState(state) {
  if (!data.wl1) {
    return;
  }

  const normalized = normalizeState(state);

  currentWavelength = normalized.wavelength;
  currentChannel = normalized.channel;

  if (currentChannel >= data.wl1[0].length) currentChannel = data.wl1[0].length - 1;
  if (currentChannel < 0) currentChannel = 0;

  exclusionTable.value = normalized.exclusions.map(e => e.start + "," + e.end).join("\n");

  filterEnabled = !!normalized.filter.enabled;
  if (filterBox) filterBox.checked = filterEnabled;

  lowCutInput.value = normalized.filter.lowHz === null ? "" : String(normalized.filter.lowHz);
  highCutInput.value = normalized.filter.highHz === null ? "" : String(normalized.filter.highHz);

  if (notesInput) notesInput.value = normalized.notes || "";

  rebuildRadioSelections();

  renderMeta();
  redraw();
}

function rebuildRadioSelections() {
  const wls = document.querySelectorAll("input[name='wavelength']");
  wls.forEach(r => {
    const txt = (r.parentElement && r.parentElement.textContent) ? r.parentElement.textContent : "";
    if (currentWavelength === "wl1") r.checked = txt.indexOf("760") !== -1;
    if (currentWavelength === "wl2") r.checked = txt.indexOf("850") !== -1;
  });

  const ch = document.querySelectorAll("input[name='channel']");
  ch.forEach((r, i) => {
    r.checked = i === currentChannel;
  });
}

/* ================= Helpers ================= */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rmsNormalize(ref, x) {
  const rms = a => Math.sqrt(a.reduce((sum, v) => sum + v * v, 0) / a.length);
  const r0 = rms(ref);
  const r1 = rms(x);
  if (r1 === 0) return x;
  return x.map(v => v * (r0 / r1));
}

function extractChannelLabels(buf, expectedChannels) {
  if (typeof mat4js === "undefined") return defaultChannelLabels();

  try {
    const parsed = mat4js.read(buf);
    const probes = parsed.data.probeInfo.probes;
    if (!probes || !probes.index_c) return defaultChannelLabels();

    const labels = probes.index_c.map(pair => "S" + pair[0] + " D" + pair[1]);
    return labels.length === expectedChannels ? labels : defaultChannelLabels();
  } catch (e) {
    return defaultChannelLabels();
  }
}

function parseSamplingRate(t) {
  const m = t.match(/SamplingRate\s*=\s*([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parseMatrix(t) {
  return t.trim().split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number));
}

function parseEvents(t) {
  return t.trim().split(/\r?\n/).map(l => {
    const p = l.trim().split(/\s+/).map(Number);
    return { sample: p[0], code: p[1] };
  });
}

function parseIntervals(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.split(",").map(Number))
    .filter(p => p.length === 2 && p[0] < p[1])
    .map(p => ({ start: p[0], end: p[1] }));
}

function applyExclusions(series, intervals) {
  return series.filter((_, i) => {
    const t = i / samplingRate;
    return !intervals.some(intv => t >= intv.start && t <= intv.end);
  });
}

function adjustEvents(eventsIn, intervals) {
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

function computeStats(series) {
  const sorted = series.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) * (v - mean), 0) / series.length);

  return {
    mean,
    median,
    sd,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

function formatStats(s) {
  return "mean " + s.mean.toFixed(2) +
    " | median " + s.median.toFixed(2) +
    " | sd " + s.sd.toFixed(2) +
    " | min " + s.min.toFixed(2) +
    " | max " + s.max.toFixed(2);
}
