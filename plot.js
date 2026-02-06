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
  drawTitleAndStats(ctx, canvas, title, statsLine);
}

function drawGrid(ctx, canvas) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;

  ctx.strokeStyle = "#e5e7eb";

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

  ctx.strokeStyle = "#000";
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
  const minY = Math.min(...series);
  const maxY = Math.max(...series);

  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#000";

  for (let i = 0; i <= 10; i++) {
    const x = M.left + (i / 10) * w;
    ctx.fillText((dur * i / 10).toFixed(1), x - 8, M.top + h + 20);
  }

  for (let i = 0; i <= 6; i++) {
    const y = M.top + h - (i / 6) * h;
    const v = minY + (i / 6) * (maxY - minY);
    ctx.fillText(v.toFixed(2), M.left - 45, y + 4);
  }
}

function drawSeries(ctx, canvas, series) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const minY = Math.min(...series);
  const maxY = Math.max(...series);

  ctx.strokeStyle = "#111827";
  ctx.beginPath();

  series.forEach((v, i) => {
    const x = M.left + (i / (series.length - 1)) * w;
    const y = M.top + h - ((v - minY) / (maxY - minY)) * h;
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
  ctx.font = "11px sans-serif";

  events.forEach(e => {
    const x = M.left + (e.time / dur) * w;

    ctx.beginPath();
    ctx.moveTo(x, M.top);
    ctx.lineTo(x, M.top + h);
    ctx.stroke();

    ctx.fillText(
      "E" + e.code,
      x + 2,
      M.top + 12
    );
  });
}

function drawLabels(ctx, canvas) {
  ctx.fillStyle = "#000";
  ctx.fillText("Time (s)", canvas.width / 2 - 30, canvas.height - 10);

  ctx.save();
  ctx.translate(M.left - 70, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Intensity (a.u.)", 0, 0);
  ctx.restore();
}

function drawTitleAndStats(ctx, canvas, title, statsLine) {
  ctx.fillStyle = "#000";

  ctx.font = "17px sans-serif";
  ctx.fillText(title, M.left, 18);

  ctx.font = "12px sans-serif";
  ctx.fillText(statsLine, M.left, 36);
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
