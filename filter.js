function applyRjgButterworth(series, fs, spec, mode) {
  if (!Array.isArray(series) || !series.length) return [];
  const design = designRjgButterworth(fs, spec, mode);
  if (!design || !Array.isArray(design.sos) || !design.sos.length) return series.slice();
  const padding = resolveEdgePadding(series.length, fs, spec);
  if (!padding.enabled) return forwardBackwardSos(series, design.sos);

  const padded = zeroPad(series, padding.samples);
  const filtered = forwardBackwardSos(padded, design.sos);
  return filtered.slice(padding.samples, padding.samples + series.length);
}

function designRjgButterworth(fs, spec, mode) {
  const validated = spec || {};
  const hpPass = finiteOrNull(validated.highpassPassHz);
  const hpSix = finiteOrNull(validated.highpassSixDbHz);
  const lpPass = finiteOrNull(validated.lowpassPassHz);
  const lpSix = finiteOrNull(validated.lowpassSixDbHz);
  const gpass = finiteOr(validated.passbandRippleDb, 0.1);
  const gstop = finiteOr(validated.stopbandAttenuationDb, 6.0);

  if (!Number.isFinite(fs) || fs <= 0) throw new Error("Sampling rate must be > 0");
  if (mode && mode !== "rjg_sos") throw new Error("Unsupported filter engine: " + mode);

  if (hpPass !== null && lpPass !== null) {
    const hpOrder = buttordHz(hpPass, hpSix, gpass, gstop, fs);
    const lpOrder = buttordHz(lpPass, lpSix, gpass, gstop, fs);
    return {
      kind: "bandpass",
      order: hpOrder.order + lpOrder.order,
      stageOrders: { highpass: hpOrder.order, lowpass: lpOrder.order },
      wn: { highpass: hpOrder.wn, lowpass: lpOrder.wn },
      sos: butterSos(hpOrder.order, hpOrder.wn, "highpass", fs).concat(
        butterSos(lpOrder.order, lpOrder.wn, "lowpass", fs)
      )
    };
  }

  if (hpPass !== null) {
    const hpOrder = buttordHz(hpPass, hpSix, gpass, gstop, fs);
    return {
      kind: "highpass",
      order: hpOrder.order,
      wn: hpOrder.wn,
      sos: butterSos(hpOrder.order, hpOrder.wn, "highpass", fs)
    };
  }

  if (lpPass !== null) {
    const lpOrder = buttordHz(lpPass, lpSix, gpass, gstop, fs);
    return {
      kind: "lowpass",
      order: lpOrder.order,
      wn: lpOrder.wn,
      sos: butterSos(lpOrder.order, lpOrder.wn, "lowpass", fs)
    };
  }

  return { kind: "none", order: 0, wn: null, sos: [] };
}

function buttordHz(wpHz, wsHz, gpass, gstop, fs) {
  const wp = asArray(wpHz).map(v => (2 * v) / fs);
  const ws = asArray(wsHz).map(v => (2 * v) / fs);
  const filterType = inferFilterType(wp, ws);
  const passb = prewarp(wp);
  const stopb = prewarp(ws);
  const nat = findNatFreq(stopb, passb, filterType);

  const GSTOP = Math.pow(10, 0.1 * Math.abs(gstop));
  const GPASS = Math.pow(10, 0.1 * Math.abs(gpass));
  const order = Math.max(1, Math.ceil(Math.log10((GSTOP - 1) / (GPASS - 1)) / (2 * Math.log10(nat))));
  const W0Pass = Math.pow(GPASS - 1, -1 / (2 * order));
  const W0Stop = Math.pow(GSTOP - 1, -1 / (2 * order));

  let WN;
  if (filterType === 1) {
    WN = [stopb[0] * W0Stop];
  } else if (filterType === 2) {
    WN = [stopb[0] / W0Stop];
  } else if (filterType === 4) {
    const bw = passb[1] - passb[0];
    const roots = [-W0Pass, W0Pass].map(w => {
      const term = Math.sqrt((w * w / 4) * bw * bw + passb[0] * passb[1]);
      return -w * bw / 2 + term;
    });
    WN = roots.map(Math.abs).sort((a, b) => a - b);
  } else {
    throw new Error("Unsupported filter type: " + filterType);
  }

  const wn = WN.map(v => Math.atan(v) * 2 / Math.PI * fs / 2);
  return {
    order: order,
    wn: wn.length === 1 ? wn[0] : wn
  };
}

function butterSos(order, wnHz, btype, fs) {
  const normalizedWn = asArray(wnHz).map(v => v / (fs / 2));
  const warped = normalizedWn.map(v => 4 * Math.tan(Math.PI * v / 2));
  let zpk = buttap(order);

  if (btype === "lowpass") {
    zpk = lp2lpZpk(zpk.z, zpk.p, zpk.k, warped[0]);
  } else if (btype === "highpass") {
    zpk = lp2hpZpk(zpk.z, zpk.p, zpk.k, warped[0]);
  } else {
    throw new Error("Unsupported Butterworth type: " + btype);
  }

  const digital = bilinearZpk(zpk.z, zpk.p, zpk.k, 2.0);
  return butterZpkToSos(digital.z, digital.p, digital.k, btype);
}

function buttap(order) {
  const poles = [];
  for (let m = -order + 1; m <= order - 1; m += 2) {
    const theta = Math.PI * m / (2 * order);
    poles.push(complex(-Math.cos(theta), -Math.sin(theta)));
  }
  return { z: [], p: poles, k: 1.0 };
}

function lp2lpZpk(z, p, k, wo) {
  const degree = relativeDegree(z, p);
  return {
    z: z.map(root => cscale(root, wo)),
    p: p.map(root => cscale(root, wo)),
    k: k * Math.pow(wo, degree)
  };
}

function lp2hpZpk(z, p, k, wo) {
  const degree = relativeDegree(z, p);
  const zh = z.map(root => cdiv(complex(wo, 0), root)).concat(repeatRoot(complex(0, 0), degree));
  const ph = p.map(root => cdiv(complex(wo, 0), root));
  const gainRatio = creal(cdiv(cprod(z.map(root => cneg(root))), cprod(p.map(root => cneg(root)))));
  return { z: zh, p: ph, k: k * gainRatio };
}

function lp2bpZpk(z, p, k, wo, bw) {
  const degree = relativeDegree(z, p);
  const zScaled = z.map(root => cscale(root, bw / 2)).map(ensureComplex);
  const pScaled = p.map(root => cscale(root, bw / 2)).map(ensureComplex);
  const zb = [];
  const pb = [];

  zScaled.forEach(root => {
    const disc = csqrt(csub(cmul(root, root), complex(wo * wo, 0)));
    zb.push(cadd(root, disc));
    zb.push(csub(root, disc));
  });

  pScaled.forEach(root => {
    const disc = csqrt(csub(cmul(root, root), complex(wo * wo, 0)));
    pb.push(cadd(root, disc));
    pb.push(csub(root, disc));
  });

  return {
    z: zb.concat(repeatRoot(complex(0, 0), degree)),
    p: pb,
    k: k * Math.pow(bw, degree)
  };
}

function bilinearZpk(z, p, k, fs) {
  const degree = relativeDegree(z, p);
  const fs2 = 2 * fs;
  const zz = z.map(root => cdiv(cadd(complex(fs2, 0), root), csub(complex(fs2, 0), root)));
  const pz = p.map(root => cdiv(cadd(complex(fs2, 0), root), csub(complex(fs2, 0), root)));
  const gainRatio = creal(cdiv(cprod(z.map(root => csub(complex(fs2, 0), root))), cprod(p.map(root => csub(complex(fs2, 0), root)))));
  return {
    z: zz.concat(repeatRoot(complex(-1, 0), degree)),
    p: pz,
    k: k * gainRatio
  };
}

function butterZpkToSos(z, p, k, btype) {
  const poleSections = pairRootsIntoSections(p);
  const zeroSections = makeZeroSections(z, poleSections, btype);
  const sos = poleSections.map((poles, idx) => zpkSectionToRow(zeroSections[idx], poles, idx === 0 ? k : 1.0));
  return sos.sort((a, b) => sectionPoleRadius(a) - sectionPoleRadius(b));
}

function pairRootsIntoSections(roots) {
  const tol = 1e-9;
  const remaining = roots.slice();
  const sections = [];

  remaining.sort((a, b) => {
    if (Math.abs(a.re - b.re) > tol) return a.re - b.re;
    return Math.abs(a.im) - Math.abs(b.im);
  });

  while (remaining.length) {
    const root = remaining.shift();
    if (!root) break;
    if (Math.abs(root.im) <= tol) {
      const matchIdx = remaining.findIndex(next => Math.abs(next.im) <= tol);
      if (matchIdx >= 0) {
        sections.push([root, remaining.splice(matchIdx, 1)[0]]);
      } else {
        sections.push([root]);
      }
      continue;
    }

    const conjIdx = remaining.findIndex(next =>
      Math.abs(next.re - root.re) <= 1e-7 &&
      Math.abs(next.im + root.im) <= 1e-7
    );
    if (conjIdx < 0) {
      throw new Error("Complex root has no conjugate partner");
    }
    sections.push([root, remaining.splice(conjIdx, 1)[0]]);
  }

  return sections;
}

function makeZeroSections(z, poleSections, btype) {
  if (btype === "bandpass") {
    return poleSections.map(() => [complex(1, 0), complex(-1, 0)]);
  }

  const root = btype === "highpass" ? complex(1, 0) : complex(-1, 0);
  const totalDegree = poleSections.reduce((sum, section) => sum + section.length, 0);
  const zeros = z.length ? z.slice() : repeatRoot(root, totalDegree);
  const sections = [];
  let idx = 0;

  for (let i = 0; i < poleSections.length; i++) {
    const roots = [];
    const needed = poleSections[i].length;
    for (let j = 0; j < needed && idx < zeros.length; j++) {
      roots.push(zeros[idx++]);
    }
    sections.push(roots);
  }

  return sections;
}

function zpkSectionToRow(zRoots, pRoots, gain) {
  const b = polyFromRoots(zRoots).map(toReal);
  const a = polyFromRoots(pRoots).map(toReal);
  const bFull = [0, 0, 0];
  const aFull = [0, 0, 0];

  for (let i = 0; i < b.length; i++) bFull[i] = b[i];
  for (let i = 0; i < a.length; i++) aFull[i] = a[i];

  for (let i = 0; i < bFull.length; i++) bFull[i] *= gain;

  const a0 = aFull[0] === 0 ? 1 : aFull[0];
  return [
    bFull[0] / a0,
    bFull[1] / a0,
    bFull[2] / a0,
    aFull[1] / a0,
    aFull[2] / a0
  ];
}

function polyFromRoots(roots) {
  let coeffs = [complex(1, 0)];
  roots.forEach(root => {
    const next = Array.from({ length: coeffs.length + 1 }, () => complex(0, 0));
    for (let i = 0; i < coeffs.length; i++) {
      next[i] = cadd(next[i], coeffs[i]);
      next[i + 1] = cadd(next[i + 1], cneg(cmul(coeffs[i], root)));
    }
    coeffs = next;
  });
  return coeffs;
}

function forwardBackwardSos(x, sections) {
  let y = sosFilter(x, sections);
  y.reverse();
  y = sosFilter(y, sections);
  y.reverse();
  return y;
}

function resolveEdgePadding(length, fs, spec) {
  const enabled = !!(spec && spec.edgePaddingEnabled);
  const seconds = finiteOr(spec && spec.edgePaddingSeconds, 10.0);
  if (!enabled || !Number.isFinite(fs) || fs <= 0 || !Number.isFinite(length) || length < 3) {
    return { enabled: false, samples: 0 };
  }
  const requested = Math.max(10.0, seconds);
  const samples = Math.max(0, Math.round(requested * fs));
  return { enabled: samples > 0, samples: samples };
}

function zeroPad(x, padSamples) {
  if (!Array.isArray(x) || !x.length || padSamples <= 0) return x.slice();
  const left = new Array(padSamples).fill(0);
  const right = new Array(padSamples).fill(0);
  return left.concat(x, right);
}

function sosFilter(x, sections) {
  let out = x.slice();
  sections.forEach(sec => {
    out = biquadDf2t(out, sec[0], sec[1], sec[2], sec[3], sec[4]);
  });
  return out;
}

function biquadDf2t(x, b0, b1, b2, a1, a2) {
  const y = new Array(x.length).fill(0);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = b0 * xn + z1;
    z1 = b1 * xn - a1 * yn + z2;
    z2 = b2 * xn - a2 * yn;
    y[i] = yn;
  }
  return y;
}

function inferFilterType(wp, ws) {
  let filterType = 2 * (wp.length - 1) + 1;
  if (wp[0] >= ws[0]) filterType += 1;
  return filterType;
}

function prewarp(freqs) {
  return freqs.map(v => Math.tan(Math.PI * v / 2));
}

function findNatFreq(stopb, passb, filterType) {
  if (filterType === 1) return stopb[0] / passb[0];
  if (filterType === 2) return passb[0] / stopb[0];
  if (filterType === 4) {
    const values = stopb.map(sb => (sb * sb - passb[0] * passb[1]) / (sb * (passb[0] - passb[1])));
    return Math.min(...values.map(v => Math.abs(v)));
  }
  throw new Error("Unsupported filter type: " + filterType);
}

function relativeDegree(z, p) {
  const degree = p.length - z.length;
  if (degree < 0) throw new Error("Improper transfer function");
  return degree;
}

function repeatRoot(root, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(complex(root.re, root.im));
  return out;
}

function sectionPoleRadius(sec) {
  const poles = rootsFromSection(sec[3], sec[4]);
  return Math.max(...poles.map(root => cabs(root)));
}

function rootsFromSection(a1, a2) {
  const disc = csqrt(complex(a1 * a1 - 4 * a2, 0));
  return [
    cscale(cadd(complex(-a1, 0), disc), 0.5),
    cscale(csub(complex(-a1, 0), disc), 0.5)
  ];
}

function asArray(v) {
  return Array.isArray(v) ? v.slice() : [v];
}

function finiteOrNull(v) {
  if (v === null || typeof v === "undefined" || v === "") return null;
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function finiteOr(v, fallback) {
  if (v === null || typeof v === "undefined" || v === "") return fallback;
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function toReal(z) {
  return Math.abs(z.im) <= 1e-9 ? z.re : z.re;
}

function ensureComplex(z) {
  return complex(z.re, z.im);
}

function complex(re, im) {
  return { re: re, im: im || 0 };
}

function cadd(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

function csub(a, b) {
  return complex(a.re - b.re, a.im - b.im);
}

function cmul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function cdiv(a, b) {
  const denom = b.re * b.re + b.im * b.im;
  return complex((a.re * b.re + a.im * b.im) / denom, (a.im * b.re - a.re * b.im) / denom);
}

function cscale(a, scalar) {
  return complex(a.re * scalar, a.im * scalar);
}

function cneg(a) {
  return complex(-a.re, -a.im);
}

function cabs(a) {
  return Math.hypot(a.re, a.im);
}

function creal(a) {
  return a.re;
}

function cprod(values) {
  return values.reduce((acc, value) => cmul(acc, value), complex(1, 0));
}

function csqrt(a) {
  const r = cabs(a);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  const im = (a.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - a.re) / 2));
  return complex(re, im);
}

if (typeof module !== "undefined") {
  module.exports = {
    applyRjgButterworth,
    designRjgButterworth,
    buttordHz,
    butterSos
  };
}
