// app.js

const APP_VERSION = "0.2";
const PROTOCOL_SCHEMA_VERSION = 1;

const input = document.getElementById("input");
const metaDiv = document.getElementById("meta");
const controls = document.getElementById("controls");
const protocolHost = document.getElementById("protocolHost");
const plotGrid = document.getElementById("plotGrid");

const canvasRaw = document.getElementById("plot");
const ctxRaw = canvasRaw.getContext("2d");
canvasRaw.classList.add("w-full");

const canvasTrim = document.createElement("canvas");
canvasTrim.width = canvasRaw.width;
canvasTrim.height = canvasRaw.height;
canvasRaw.after(canvasTrim);
canvasTrim.classList.add("w-full");
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

input.addEventListener("change", handleInput);

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
  ctxRaw.clearRect(0, 0, canvasRaw.width, canvasRaw.height);
  ctxTrim.clearRect(0, 0, canvasTrim.width, canvasTrim.height);
}

function resetAllState() {
  samplingRate = null;
  data = { wl1: null, wl2: null };
  events = [];
  channelLabels = [];
  channelLabelSource = "default";

  currentWavelength = "wl1";
  currentChannel = 0;

  filterEnabled = false;

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
  controls.className = "bg-white rounded p-4 flex flex-col gap-4";

  /* Protocol bar first */
  const protoBar = document.createElement("div");
  protoBar.className = "flex flex-row flex-wrap gap-3 items-center";

  const protoTitle = document.createElement("div");
  protoTitle.className = "font-semibold";
  protoTitle.textContent = "Protocol:";

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

  protocolFilenameLabelEl = document.createElement("div");
  protocolFilenameLabelEl.className = "text-sm text-slate-600 ml-2";
  updateProtocolFilenameLabel();

  protoBar.appendChild(protoTitle);
  protoBar.appendChild(exportBtn);
  protoBar.appendChild(importBtn);
  protoBar.appendChild(resetBtn);
  protoBar.appendChild(copyLinkBtn);
  protoBar.appendChild(protocolFilenameLabelEl);

  const grid = document.createElement("div");
  grid.className = "flex flex-wrap gap-8 items-start";

  const wlDiv = document.createElement("div");
  wlDiv.className = "flex flex-col space-y-1";
  wlDiv.innerHTML = "<div class='font-semibold'>Wavelength</div>";

  ["wl1", "wl2"].forEach((wl, i) => {
    const label = document.createElement("label");
    label.className = "inline-flex items-center space-x-2";

    const r = document.createElement("input");
    r.type = "radio";
    r.name = "wavelength";
    r.checked = (currentWavelength === wl) || (i === 0 && currentWavelength === "wl1");
    r.onchange = () => { currentWavelength = wl; redraw(); renderMeta(); };

    label.appendChild(r);
    label.appendChild(document.createTextNode(wl === "wl1" ? "760 nm" : "850 nm"));
    wlDiv.appendChild(label);
  });

  const chDiv = document.createElement("div");
  chDiv.className = "flex flex-col space-y-1 max-h-60 overflow-y-auto";
  chDiv.innerHTML = "<div class='font-semibold'>Channel</div>";

  channelLabels.forEach((lbl, i) => {
    const label = document.createElement("label");
    label.className = "inline-flex items-center space-x-2";

    const r = document.createElement("input");
    r.type = "radio";
    r.name = "channel";
    r.checked = (i === currentChannel);
    r.onchange = () => { currentChannel = i; redraw(); renderMeta(); };

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
  exclusionTable.oninput = () => { redraw(); renderMeta(); };
  exclusionTable.style.minWidth = "220px";
  exclusionTable.className = "p-2 border rounded bg-white";
  exDiv.appendChild(exclusionTable);

  const fDiv = document.createElement("div");
  fDiv.className = "flex flex-col space-y-1";
  fDiv.innerHTML = "<div class='font-semibold'>Butterworth filter (4th)</div>";

  const fCheck = document.createElement("label");
  fCheck.className = "inline-flex items-center space-x-2";

  filterBox = document.createElement("input");
  filterBox.type = "checkbox";
  filterBox.onchange = () => { filterEnabled = filterBox.checked; redraw(); renderMeta(); };

  fCheck.appendChild(filterBox);
  fCheck.appendChild(document.createTextNode("enable"));

  lowCutInput = document.createElement("input");
  lowCutInput.type = "number";
  lowCutInput.step = "0.01";
  lowCutInput.placeholder = "Low Hz";
  lowCutInput.oninput = () => { redraw(); renderMeta(); };
  lowCutInput.className = "p-2 border rounded bg-white";

  highCutInput = document.createElement("input");
  highCutInput.type = "number";
  highCutInput.step = "0.01";
  highCutInput.placeholder = "High Hz";
  highCutInput.oninput = () => { redraw(); renderMeta(); };
  highCutInput.className = "p-2 border rounded bg-white";

  fDiv.appendChild(fCheck);
  fDiv.appendChild(lowCutInput);
  fDiv.appendChild(highCutInput);

  const protoDiv = document.createElement("div");
  protoDiv.className = "flex flex-col space-y-2";

  const branchLabel = document.createElement("div");
  branchLabel.className = "font-semibold";
  branchLabel.textContent = "Protocol label";

  branchTagInput = document.createElement("input");
  branchTagInput.type = "text";
  branchTagInput.placeholder = "e.g., fs32, qc1, motionTrim";
  branchTagInput.oninput = renderMeta;
  branchTagInput.className = "p-2 border rounded bg-white";

  const notesLabel = document.createElement("div");
  notesLabel.className = "font-semibold";
  notesLabel.textContent = "Notes";

  notesInput = document.createElement("textarea");
  notesInput.rows = 10;
  notesInput.placeholder = "Notes about processing choices, rationale, caveats...";
  notesInput.oninput = renderMeta;
  notesInput.style.minWidth = "340px";
  notesInput.className = "p-2 border rounded bg-white";

  protoDiv.appendChild(branchLabel);
  protoDiv.appendChild(branchTagInput);
  protoDiv.appendChild(notesLabel);
  protoDiv.appendChild(notesInput);

  grid.appendChild(wlDiv);
  grid.appendChild(chDiv);
  grid.appendChild(exDiv);
  grid.appendChild(fDiv);
  grid.appendChild(protoDiv);

  if (protocolHost) {
  protocolHost.innerHTML = "";
  protocolHost.appendChild(protoBar);
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

function resetProtocolUiOnly() {
  if (!data.wl1) return;

  currentWavelength = "wl1";
  currentChannel = 0;

  if (branchTagInput) branchTagInput.value = "";
  if (notesInput) notesInput.value = "";

  if (exclusionTable) exclusionTable.value = "";

  filterEnabled = false;
  if (filterBox) filterBox.checked = false;
  if (lowCutInput) lowCutInput.value = "";
  if (highCutInput) highCutInput.value = "";

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

  const intervals = parseIntervals(exclusionTable.value);
  const trimmed = applyExclusions(raw, intervals);
  const trimmedEvents = adjustEvents(events, intervals);

  let processed = trimmed.slice();
  let filterLabel = "no filter";

  if (filterEnabled) {
    const low = parseFloat(lowCutInput.value);
    const high = parseFloat(highCutInput.value);
    const lowHz = Number.isFinite(low) ? low : null;
    const highHz = Number.isFinite(high) ? high : null;

    processed = butterworth4(trimmed, samplingRate, lowHz, highHz);
    processed = rmsNormalize(trimmed, processed);

    if (lowHz && highHz) filterLabel = "BP " + lowHz + "-" + highHz + " Hz";
    else if (lowHz) filterLabel = "HP " + lowHz + " Hz";
    else if (highHz) filterLabel = "LP " + highHz + " Hz";
    else filterLabel = "filter enabled";
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

/* ================= Meta and protocol summary ================= */

function renderMeta() {
  if (!data.wl1 || !samplingRate) return;

  const summary = buildProtocolSummary(buildProtocolObject());

  const bHdr = basename(sources.hdr) || "missing";
  const bWl1 = basename(sources.wl1) || "missing";
  const bWl2 = basename(sources.wl2) || "missing";
  const bEvt = basename(sources.evt) || "none";
  const bProbe = basename(sources.probeMat) || "none";

  const low = parseFloat(lowCutInput.value);
  const high = parseFloat(highCutInput.value);
  const lowHz = Number.isFinite(low) ? low : null;
  const highHz = Number.isFinite(high) ? high : null;

  let filterText = "off";
  if (filterEnabled) {
    if (lowHz && highHz) filterText = "enabled (BP " + lowHz + "-" + highHz + " Hz)";
    else if (lowHz) filterText = "enabled (HP " + lowHz + " Hz)";
    else if (highHz) filterText = "enabled (LP " + highHz + " Hz)";
    else filterText = "enabled";
  }

  const labelText = (branchTagInput ? branchTagInput.value.trim() : "") || "none";
  const notesText = notesInput ? notesInput.value : "";

  let html = ""
    + "<div class='grid grid-cols-1 md:grid-cols-2 gap-6'>"
    + "  <div>"
    + "    <div class='font-semibold mb-2'>Recording Summary</div>"
    + "    <div class='grid grid-cols-2 gap-2 text-sm'>"
    + "      <div>Dataset</div><div>" + escapeHtml(datasetLabel) + "</div>"
    + "      <div>Input type</div><div>" + escapeHtml(inputTypeLabel) + "</div>"
    + "      <div>Sampling rate</div><div>" + samplingRate + " Hz</div>"
    + "      <div>Samples</div><div>" + data.wl1.length + "</div>"
    + "      <div>Duration</div><div>" + (data.wl1.length / samplingRate).toFixed(2) + " s</div>"
    + "      <div>Channels</div><div>" + data.wl1[0].length + "</div>"
    + "      <div>Filter</div><div>" + escapeHtml(filterText) + "</div>"
    + "      <div>Protocol label</div><div>" + escapeHtml(labelText) + "</div>"
    + "      <div>App version</div><div>" + APP_VERSION + "</div>"
    + "      <div>Protocol schema</div><div>" + PROTOCOL_SCHEMA_VERSION + "</div>"
    + "    </div>"
    + "    <div class='mt-3'>"
    + "      <div class='font-semibold mb-1'>Protocol summary</div>"
    + "      <div class='text-sm whitespace-pre-wrap'>" + escapeHtml(summary) + "</div>"
    + "    </div>"
    + "    <div class='mt-3'>"
    + "      <div class='font-semibold mb-1'>Sources</div>"
    + "      <div class='grid grid-cols-2 gap-2 text-sm'>"
    + "        <div>HDR</div><div>" + escapeHtml(bHdr) + "</div>"
    + "        <div>WL1</div><div>" + escapeHtml(bWl1) + "</div>"
    + "        <div>WL2</div><div>" + escapeHtml(bWl2) + "</div>"
    + "        <div>EVT</div><div>" + escapeHtml(bEvt) + "</div>"
    + "        <div>probeInfo</div><div>" + escapeHtml(bProbe) + "</div>"
    + "        <div>Sampling rate from</div><div>" + escapeHtml(basename(sources.samplingRateFrom) || "?") + "</div>"
    + "        <div>Events from</div><div>" + escapeHtml(basename(sources.eventsFrom) || "?") + "</div>"
    + "        <div>Channel labels from</div><div>" + escapeHtml(basename(sources.channelLabelsFrom) || "?") + "</div>"
    + "      </div>"
    + "    </div>"
    + "    <div class='mt-3'>"
    + "      <div class='font-semibold mb-1'>Notes</div>"
    + "      <div class='text-sm whitespace-pre-wrap'>" + escapeHtml(notesText) + "</div>"
    + "    </div>"
    + "  </div>"
    + "  <div>"
    + "    <div class='font-semibold mb-2'>Events</div>"
    + "    <table class='w-full text-sm border-collapse' style='table-layout: fixed;'>"
    + "      <thead>"
    + "        <tr>"
    + "          <th class='border px-2 py-1' style='width: 80px;'>Time (s)</th>"
    + "          <th class='border px-2 py-1' style='width: 60px;'>Code</th>"
    + "        </tr>"
    + "      </thead>"
    + "      <tbody>";

  if (!events.length) {
    html += ""
      + "<tr>"
      + "  <td class='border px-2 py-2 text-slate-600' colspan='2'>No events found</td>"
      + "</tr>";
  } else {
    events.forEach(e => {
      html += ""
        + "<tr>"
        + "  <td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + (e.sample / samplingRate).toFixed(2) + "</td>"
        + "  <td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + e.code + "</td>"
        + "</tr>";
    });
  }

  html += ""
    + "      </tbody>"
    + "    </table>"
    + "  </div>"
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

  const lowHz = Number.isFinite(low) ? low : null;
  const highHz = Number.isFinite(high) ? high : null;

  const steps = [];

  steps.push({
    step: "trim",
    enabled: true,
    intervalsSeconds: intervals
  });

  steps.push({
    step: "filter_butterworth_iir",
    enabled: !!filterEnabled,
    order: 4,
    lowHz: lowHz,
    highHz: highHz,
    amplitudePreservation: "rms_normalize_to_pre_filter"
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
    filterPart += " amp=rms";
  }

  return labelPart + "wl=" + wlTxt + " | ch=" + chLbl + " | " + trimPart + " | " + filterPart;
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
  if (f && f.enabled) {
    filterEnabled = true;
    if (filterBox) filterBox.checked = true;
    lowCutInput.value = (f.lowHz === null || typeof f.lowHz === "undefined") ? "" : String(f.lowHz);
    highCutInput.value = (f.highHz === null || typeof f.highHz === "undefined") ? "" : String(f.highHz);
  } else {
    filterEnabled = false;
    if (filterBox) filterBox.checked = false;
    lowCutInput.value = "";
    highCutInput.value = "";
  }

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
      wavelength: raw && raw.selection && raw.selection.wavelength === "wl2" ? "wl2" : "wl1",
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
      { step: "trim", enabled: true, intervalsSeconds: [] },
      { step: "filter_butterworth_iir", enabled: false, order: 4, lowHz: null, highHz: null, amplitudePreservation: "rms_normalize_to_pre_filter" }
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
  const wls = document.querySelectorAll("input[name='wavelength']");
  wls.forEach(r => {
    const txt = (r.parentElement && r.parentElement.textContent) ? r.parentElement.textContent : "";
    if (currentWavelength === "wl1") r.checked = txt.indexOf("760") !== -1;
    if (currentWavelength === "wl2") r.checked = txt.indexOf("850") !== -1;
  });

  const ch = document.querySelectorAll("input[name='channel']");
  ch.forEach((r, i) => { r.checked = i === currentChannel; });
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
  return "mean " + s.mean.toFixed(2) +
    " | median " + s.median.toFixed(2) +
    " | sd " + s.sd.toFixed(2) +
    " | min " + s.min.toFixed(2) +
    " | max " + s.max.toFixed(2);
}