function butterworth4(series, fs, lowHz, highHz) {
  if (!lowHz && !highHz) return series.slice();

  let out = series.slice();

  if (lowHz && highHz) {
    out = butterworthHigh(out, fs, lowHz);
    out = butterworthLow(out, fs, highHz);
  } else if (lowHz) {
    out = butterworthHigh(out, fs, lowHz);
  } else if (highHz) {
    out = butterworthLow(out, fs, highHz);
  }

  return out;
}

function butterworthLow(x, fs, fc) {
  const ita = 1.0 / Math.tan(Math.PI * fc / fs);
  const q = Math.SQRT2;

  const b0 = 1.0 / (1.0 + q * ita + ita * ita);
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2.0 * (ita * ita - 1.0) * b0;
  const a2 = (1.0 - q * ita + ita * ita) * b0;

  return zeroPhaseBiquad(x, b0, b1, b2, a1, a2, fs);
}

function butterworthHigh(x, fs, fc) {
  const ita = Math.tan(Math.PI * fc / fs);
  const q = Math.SQRT2;

  const b0 = 1.0 / (1.0 + q * ita + ita * ita);
  const b1 = -2 * b0;
  const b2 = b0;
  const a1 = 2.0 * (ita * ita - 1.0) * b0;
  const a2 = (1.0 - q * ita + ita * ita) * b0;

  return zeroPhaseBiquad(x, b0, b1, b2, a1, a2, fs);
}

function zeroPhaseBiquad(x, b0, b1, b2, a1, a2, fs) {
  if (!Array.isArray(x) || x.length < 3) return x.slice();

  const padLen = computePadLength(x.length, fs);
  const padded = padLen > 0 ? reflectPad(x, padLen) : x.slice();

  let y = iirFilter(padded, b0, b1, b2, a1, a2);
  y.reverse();
  y = iirFilter(y, b0, b1, b2, a1, a2);
  y.reverse();

  if (padLen === 0) return y;
  return y.slice(padLen, padLen + x.length);
}

function computePadLength(n, fs) {
  if (!Number.isFinite(n) || n < 5) return 0;
  const fsPad = Number.isFinite(fs) && fs > 0 ? Math.ceil(fs) : 18;
  const target = Math.max(18, fsPad);
  return Math.max(0, Math.min(target, n - 2));
}

function reflectPad(x, padLen) {
  const n = x.length;
  const left = [];
  const right = [];

  for (let i = padLen; i >= 1; i--) {
    left.push(2 * x[0] - x[i]);
  }

  for (let i = n - 2; i >= n - padLen - 1; i--) {
    right.push(2 * x[n - 1] - x[i]);
  }

  return left.concat(x, right);
}

function iirFilter(x, b0, b1, b2, a1, a2) {
  const y = new Array(x.length).fill(0);
  if (!x.length) return y;

  const sumB = b0 + b1 + b2;
  const denom = 1 + a1 + a2;
  const x0 = x[0];
  const y0 = Math.abs(denom) > 1e-12 ? x0 * (sumB / denom) : x0;

  for (let i = 0; i < x.length; i++) {
    const xi0 = x[i];
    const x1 = i > 0 ? x[i - 1] : x0;
    const x2 = i > 1 ? x[i - 2] : x0;
    const y1 = i > 0 ? y[i - 1] : y0;
    const y2 = i > 1 ? y[i - 2] : y0;

    y[i] =
      b0 * xi0 +
      b1 * x1 +
      b2 * x2 -
      a1 * y1 -
      a2 * y2;
  }

  return y;
}
