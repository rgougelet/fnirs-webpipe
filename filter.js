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

  let y = iirFilter(x, b0, b1, b2, a1, a2);
  y = y.reverse();
  y = iirFilter(y, b0, b1, b2, a1, a2);
  return y.reverse();
}

function butterworthHigh(x, fs, fc) {
  const ita = Math.tan(Math.PI * fc / fs);
  const q = Math.SQRT2;

  const b0 = 1.0 / (1.0 + q * ita + ita * ita);
  const b1 = -2 * b0;
  const b2 = b0;
  const a1 = 2.0 * (ita * ita - 1.0) * b0;
  const a2 = (1.0 - q * ita + ita * ita) * b0;

  let y = iirFilter(x, b0, b1, b2, a1, a2);
  y = y.reverse();
  y = iirFilter(y, b0, b1, b2, a1, a2);
  return y.reverse();
}

function iirFilter(x, b0, b1, b2, a1, a2) {
  const y = new Array(x.length).fill(0);

  for (let i = 2; i < x.length; i++) {
    y[i] =
      b0 * x[i] +
      b1 * x[i - 1] +
      b2 * x[i - 2] -
      a1 * y[i - 1] -
      a2 * y[i - 2];
  }

  return y;
}
