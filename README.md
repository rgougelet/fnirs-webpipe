# fnirs-webpipe

fnirs-webpipe is a browser based, client side pipeline for exploratory and reproducible fNIRS data analysis.

All computation occurs locally in the user's browser. Data are never uploaded to a server.

Desktop-only scope: this project does not target mobile layouts or mobile capture.

Current pipeline controls expose these ordered steps:
- Input signal domain: `Intensity (a.u.)` or `Delta OD`
- Butterworth filtering
- Interval trimming
- Plot view selection (raw, trimmed, or both)

## Filter Duration Guidance
Low-frequency filter edges are constrained mainly by recording duration, not by FFT padding.

- A useful rule of thumb is `1 / f` seconds for one cycle of a frequency `f`.
- `0.1 Hz` needs about `10 s` for one cycle.
- `0.01 Hz` needs about `100 s` for one cycle.
- One cycle is only a minimum. Several cycles are preferred for stable behavior near the slowest edge.

Sample rate still matters for the upper end:

- With `fs = 62.5 Hz`, Nyquist is `31.25 Hz`.
- Upper filter edges should stay comfortably below Nyquist.

## Usage
Open the web app and load a NIRx data folder as a zip file.

## Local UI workflow
For faster visual iteration:

1. Install tooling:
`npm install`

2. Install Playwright browser:
`npm run ui:install`

3. Run local app server:
`npm run serve`

4. Capture desktop screenshot (dark mode default):
`npm run ui:capture`

Optional light mode capture:
`npm run ui:capture:light`

By default, capture will try to auto-load the newest ZIP from `../NIRx` (fallback: `%USERPROFILE%/Desktop/NIRx`) before taking screenshots.

Optional overrides:
- `node scripts/capture-ui.mjs --zip=../NIRx/2026-02-18_002.zip`
- `node scripts/capture-ui.mjs --nirx-dir=../NIRx`

Screenshots are written to `screenshots/`.

## Codex workflow
Use the repo launcher instead of starting Codex manually:

```powershell
npm run codex
```

This resumes the most recent Codex session in this repo with inline terminal
scrollback enabled. It also writes a PowerShell transcript to `chat_histories/`.

Useful variants:

- `npm run codex:new` starts a new session.
- `npm run codex:pick` opens Codex's resume picker.
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-session.ps1 -NoTranscript` resumes without writing a transcript.

If the Codex TUI was exited with `/exit`, restart with `npm run codex`; it uses
`codex resume --last`, so you should not need to copy the conversation ID.

## Status
Active development.

License: CC BY-NC 4.0
