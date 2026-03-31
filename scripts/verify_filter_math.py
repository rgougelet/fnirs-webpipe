import math
import numpy as np
from scipy import signal


def js_low_coeffs(fs_hz: float, cutoff_hz: float):
    ita = 1.0 / math.tan(math.pi * cutoff_hz / fs_hz)
    q = math.sqrt(2.0)
    b0 = 1.0 / (1.0 + q * ita + ita * ita)
    b1 = 2.0 * b0
    b2 = b0
    a1 = 2.0 * (1.0 - ita * ita) * b0
    a2 = (1.0 - q * ita + ita * ita) * b0
    return np.array([b0, b1, b2]), np.array([1.0, a1, a2])


def js_high_coeffs(fs_hz: float, cutoff_hz: float):
    ita = math.tan(math.pi * cutoff_hz / fs_hz)
    q = math.sqrt(2.0)
    b0 = 1.0 / (1.0 + q * ita + ita * ita)
    b1 = -2.0 * b0
    b2 = b0
    a1 = 2.0 * (ita * ita - 1.0) * b0
    a2 = (1.0 - q * ita + ita * ita) * b0
    return np.array([b0, b1, b2]), np.array([1.0, a1, a2])


def max_mag_error(b_js, a_js, b_sp, a_sp, n=8192):
    w = np.linspace(0, math.pi, n)
    _, h_js = signal.freqz(b_js, a_js, worN=w)
    _, h_sp = signal.freqz(b_sp, a_sp, worN=w)
    return float(np.max(np.abs(np.abs(h_js) - np.abs(h_sp))))


def compare_single_stage(fs_hz: float, cutoff_hz: float, btype: str):
    if btype == "lowpass":
      b_js, a_js = js_low_coeffs(fs_hz, cutoff_hz)
    else:
      b_js, a_js = js_high_coeffs(fs_hz, cutoff_hz)

    b_sp, a_sp = signal.butter(2, cutoff_hz, btype=btype, fs=fs_hz, output="ba")
    err = max_mag_error(b_js, a_js, b_sp, a_sp)
    print(f"{btype:8s} fc={cutoff_hz:5.2f} Hz  max|mag err|={err:.3e}")


def main():
    fs_hz = 62.5
    print(f"Verifying JS single-stage Butterworth sections against scipy.signal.butter(order=2, fs={fs_hz})")
    for cutoff_hz in (0.3, 0.5, 1.0, 10.0):
        compare_single_stage(fs_hz, cutoff_hz, "lowpass")
        compare_single_stage(fs_hz, cutoff_hz, "highpass")
    print("")
    print("Interpretation:")
    print("- The current corrected JS low/high coefficient math matches SciPy order-2 Butterworth sections.")
    print("- This does NOT make the overall design equivalent to a MATLAB buttord(...) + butter(...) workflow.")
    print("- Exact parity with rjg_tools would require porting its order-selection and SOS design strategy,")
    print("  then applying zero-phase forward/backward SOS filtering.")


if __name__ == "__main__":
    main()
