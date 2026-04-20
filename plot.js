function drawPlot(ctx, canvas, series, samplingRate, overlays, events, title, statsLine) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid(ctx, canvas);
  drawAxes(ctx, canvas, series, samplingRate);
  drawSeries(ctx, canvas, series);

  if (overlays && overlays.length) {
    drawOverlays(ctx, canvas, overlays, series.length, samplingRate);
  }

  if (events && events.length) {
    drawEvents(ctx, canvas, events, series.length, samplingRate);
  }

  drawLabels(ctx, canvas);
}

function drawGrid(ctx, canvas) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1.2;

  for (let i = 0; i <= 10; i++) {
    const x = M.left + (i / 10) * w;
    ctx.beginPath();
    ctx.moveTo(x, M.top);
    ctx.lineTo(x, M.top + h);
    ctx.stroke();
  }

  for (let i = 0; i <= 6; i++) {
    const y = M.top + (i / 6) * h;
    ctx.beginPath();
    ctx.moveTo(M.left, y);
    ctx.lineTo(M.left + w, y);
    ctx.stroke();
  }
}

function drawAxes(ctx, canvas, series, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M.left, M.top);
  ctx.lineTo(M.left, M.top + h);
  ctx.lineTo(M.left + w, M.top + h);
  ctx.stroke();

  drawTicks(ctx, canvas, series, samplingRate);
}

function drawTicks(ctx, canvas, series, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const dur = series.length / samplingRate;
  const extent = getSeriesExtent(series);
  const minY = extent.min;
  const maxY = extent.max;
  const yRange = maxY - minY;
  const yTickCount = getYTickCount(minY, maxY);
  const xTickCount = getXTickCount(canvas.width);

  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";

  for (let i = 0; i <= xTickCount; i++) {
    const x = M.left + (i / xTickCount) * w;
    const tx = (dur * i / xTickCount).toFixed(1);
    if (i === 0) ctx.textAlign = "left";
    else if (i === xTickCount) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    ctx.fillText(tx, x, M.top + h + 8);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= yTickCount; i++) {
    const y = M.top + h - (i / yTickCount) * h;
    const v = yRange === 0 ? minY : (minY + (i / yTickCount) * yRange);
    ctx.fillText(formatAxisNumber(v, yRange), M.left - 10, y);
  }
}

function drawSeries(ctx, canvas, series) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const extent = getSeriesExtent(series);
  const minY = extent.min;
  const maxY = extent.max;
  const span = maxY - minY || 1;

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.8;
  ctx.beginPath();

  series.forEach((v, i) => {
    const x = M.left + (i / (series.length - 1)) * w;
    const y = M.top + h - ((v - minY) / span) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function drawOverlays(ctx, canvas, intervals, nSamples, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const dur = nSamples / samplingRate;

  ctx.fillStyle = "rgba(203,213,225,0.6)";

  intervals.forEach(intv => {
    const x1 = M.left + (intv.start / dur) * w;
    const x2 = M.left + (intv.end / dur) * w;
    ctx.fillRect(x1, M.top, x2 - x1, h);
  });
}

function drawEvents(ctx, canvas, events, nSamples, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const dur = nSamples / samplingRate;

  ctx.strokeStyle = "#dc2626";
  ctx.fillStyle = "#dc2626";
  ctx.lineWidth = 1.4;
  ctx.font = "13px sans-serif";

  events.forEach(e => {
    const x = M.left + (e.time / dur) * w;

    ctx.beginPath();
    ctx.moveTo(x, M.top);
    ctx.lineTo(x, M.top + h);
    ctx.stroke();

    ctx.fillText(
      eventDisplayLabel(e),
      x + 2,
      M.top + 12
    );
  });
}

function getSeriesExtent(series) {
  if (!series || !series.length) return { min: 0, max: 0 };
  let min = series[0];
  let max = series[0];
  for (let i = 1; i < series.length; i++) {
    const value = series[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function eventDisplayLabel(event) {
  if (event && typeof event.label === "string" && event.label.trim()) return event.label.trim();
  if (event && Number.isFinite(event.code)) return "E" + event.code;
  return "E?";
}

function drawLabels(ctx, canvas) {
  ctx.fillStyle = "#111827";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Time (s)", canvas.width / 2, canvas.height - 6);

  ctx.save();
  ctx.translate(M.left - 42, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Intensity (a.u.)", 0, 0);
  ctx.restore();
}

function formatAxisNumber(v, span) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.00";
  const abs = Math.abs(v);
  if (abs < 0.005 || abs >= 1000) return v.toExponential(2);
  if (span < 0.01) return v.toExponential(2);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  if (span < 0.1) return v.toFixed(4);
  if (span < 1) return v.toFixed(3);
  return v.toFixed(2);
}

function getXTickCount(canvasWidth) {
  if (canvasWidth < 700) return 6;
  if (canvasWidth < 1000) return 8;
  return 10;
}

function getYTickCount(minY, maxY) {
  const maxAbs = Math.max(Math.abs(minY), Math.abs(maxY));
  if (maxAbs < 0.01 || maxAbs >= 1000) return 4;
  return 6;
}


function computeStats(series) {
  const sorted = [...series].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const median = sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length);

  return {
    mean,
    median,
    sd,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}
