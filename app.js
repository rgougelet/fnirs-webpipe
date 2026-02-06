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
    r.onchange = () => { currentWavelength = wl; redraw(); };

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
    r.onchange = () => { currentChannel = i; redraw(); };

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
  const fBox = document.createElement("input");
  fBox.type = "checkbox";
  fBox.onchange = () => { filterEnabled = fBox.checked; redraw(); };
  fCheck.appendChild(fBox);
  fCheck.appendChild(document.createTextNode(" enable"));

  lowCutInput = document.createElement("input");
  lowCutInput.type = "number";
  lowCutInput.step = "0.01";
  lowCutInput.placeholder = "Low Hz";
  lowCutInput.oninput = redraw;

  highCutInput = document.createElement("input");
  highCutInput.type = "number";
  highCutInput.step = "0.01";
  highCutInput.placeholder = "High Hz";
  highCutInput.oninput = redraw;

  fDiv.appendChild(fCheck);
  fDiv.appendChild(lowCutInput);
  fDiv.appendChild(highCutInput);

  controls.appendChild(wlDiv);
  controls.appendChild(chDiv);
  controls.appendChild(exDiv);
  controls.appendChild(fDiv);
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

  if (filterEnabled) {
    const low = parseFloat(lowCutInput.value) || null;
    const high = parseFloat(highCutInput.value) || null;

    processed = butterworth4(trimmed, samplingRate, low, high);
    processed = rmsNormalize(trimmed, processed);

    if (low && high) filterLabel = `BP ${low}-${high} Hz`;
    else if (low) filterLabel = `HP ${low} Hz`;
    else if (high) filterLabel = `LP ${high} Hz`;
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
    `${wlLabel} ${chLabel} Raw`,
    formatStats(computeStats(raw))
  );

  drawPlot(
    ctxTrim,
    canvasTrim,
    processed,
    samplingRate,
    null,
    trimmedEvents,
    `${wlLabel} ${chLabel} Trimmed (${filterLabel})`,
    formatStats(computeStats(processed))
  );
}

/* ================= Meta ================= */

function renderMeta() {
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
          <div>Filter</div><div>${filterEnabled ? "enabled" : "off"}</div>
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

/* ================= Helpers ================= */

function rmsNormalize(ref, x) {
  const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
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
  return text.split(/\r?\n/)
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

function adjustEvents(events, intervals) {
  const out = [];
  events.forEach(e => {
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

function formatStats(s) {
  return `mean ${s.mean.toFixed(2)} | median ${s.median.toFixed(2)} | sd ${s.sd.toFixed(2)} | min ${s.min.toFixed(2)} | max ${s.max.toFixed(2)}`;
}
