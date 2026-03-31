import numpy as np
from scipy import signal


def rjg_filt(x, sos):
    y = signal.sosfilt(sos, x)
    y = np.flip(signal.sosfilt(sos, np.flip(y)))
    return y


def design_hp(srate, passband_hz, sixdbcutoff_hz, desired_passband_ripple_db):
    nyq = srate / 2.0
    wp = passband_hz / nyq
    d = (passband_hz - sixdbcutoff_hz) / nyq
    ws = -d + wp
    rs = 6.0
    order, wn = signal.buttord(wp, ws, desired_passband_ripple_db, rs)
    sos = signal.butter(order, wn, btype="highpass", output="sos")
    return sos, order, wn


def design_lp(srate, passband_hz, sixdbcutoff_hz, desired_passband_ripple_db):
    nyq = srate / 2.0
    wp = passband_hz / nyq
    d = abs(passband_hz - sixdbcutoff_hz) / nyq
    ws = d + wp
    rs = 6.0
    order, wn = signal.buttord(wp, ws, desired_passband_ripple_db, rs)
    sos = signal.butter(order, wn, btype="lowpass", output="sos")
    return sos, order, wn


def design_bp(srate, inner_hz, outer_hz, desired_passband_ripple_db):
    nyq = srate / 2.0
    passband_w = np.asarray(inner_hz, dtype=float) / nyq
    stopband_w = np.asarray(outer_hz, dtype=float) / nyq
    rs = 6.0
    order, wn = signal.buttord(passband_w, stopband_w, desired_passband_ripple_db, rs)
    sos = signal.butter(order, wn, btype="bandpass", output="sos")
    return sos, order, wn


def summarize_response(label, sos, srate):
    w, h = signal.sosfreqz(sos, worN=int((srate / 2.0) * 1000), fs=srate)
    mag_db = 20.0 * np.log10(np.maximum(np.abs(h), 1e-12))
    cutoff_idx = np.argsort(np.abs(mag_db + 6.0))[:2]
    cutoff_hz = np.sort(w[cutoff_idx])
    print(label)
    print(f"  sections={sos.shape[0]} order={2 * sos.shape[0]}")
    print(f"  wn={np.asarray(cutoff_hz)}")


def main():
    srate = 62.5
    ripple = 0.1

    hp_sos, hp_order, hp_wn = design_hp(srate, passband_hz=0.3, sixdbcutoff_hz=0.2, desired_passband_ripple_db=ripple)
    lp_sos, lp_order, lp_wn = design_lp(srate, passband_hz=0.3, sixdbcutoff_hz=0.5, desired_passband_ripple_db=ripple)
    bp_sos, bp_order, bp_wn = design_bp(srate, inner_hz=[0.3, 1.5], outer_hz=[0.2, 2.0], desired_passband_ripple_db=ripple)

    print("Reference SciPy reproduction of rjg_tools iirsos design logic")
    print(f"fs={srate} ripple={ripple} dB")
    print("")
    print(f"highpass: buttord order={hp_order} wn={hp_wn}")
    print(f"lowpass:  buttord order={lp_order} wn={lp_wn}")
    print(f"bandpass: buttord order={bp_order} wn={bp_wn}")
    print("")

    summarize_response("hp response", hp_sos, srate)
    summarize_response("lp response", lp_sos, srate)
    summarize_response("bp response", bp_sos, srate)

    t = np.arange(0, 20, 1.0 / srate)
    x = (
        1.0 * np.sin(2 * np.pi * 0.1 * t)
        + 0.5 * np.sin(2 * np.pi * 1.0 * t)
        + 0.25 * np.sin(2 * np.pi * 2.0 * t)
    )
    y_hp = rjg_filt(x, hp_sos)
    y_lp = rjg_filt(x, lp_sos)
    y_bp = rjg_filt(x, bp_sos)
    print("")
    print("demo rms:")
    print(f"  raw={np.sqrt(np.mean(x * x)):.6f}")
    print(f"  hp ={np.sqrt(np.mean(y_hp * y_hp)):.6f}")
    print(f"  lp ={np.sqrt(np.mean(y_lp * y_lp)):.6f}")
    print(f"  bp ={np.sqrt(np.mean(y_bp * y_bp)):.6f}")


if __name__ == "__main__":
    main()
