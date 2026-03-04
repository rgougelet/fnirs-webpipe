# Reference Intake Log

## Batch: 2026-03-04 (5 ZIPs from `references/`)

### 1) `ant_av_eeg-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/ant_av_eeg-master/ant_av_eeg-master`
- Size/scope: 189 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `deps/GeodeticToolbox` -> treat as `adapt_with_citation`
- Intake status: `in_review`

### 2) `darts-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/darts-master/darts-master`
- Size/scope: 61 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `deps/` present (license/source attribution not yet resolved)
- Intake status: `in_review`

### 3) `emg-main.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/emg-main/emg-main`
- Size/scope: 154 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `toolboxes/emg_feature_extraction_toolbox` (BSD-3-Clause) -> `adapt_with_citation`
  - `toolboxes/SampEn` (BSD-like license in `license.txt`) -> `adapt_with_citation`
- Intake status: `in_review`

### 4) `interp_epoch-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/interp_epoch-master/interp_epoch-master`
- Size/scope: 17 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies: none detected
- Intake status: `approved_with_adaptation`

### 5) `rjg_tools-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/rjg_tools-master/rjg_tools-master`
- Size/scope: 38 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies: none detected
- Intake status: `approved_with_adaptation`

## Notes
- Intake assumptions are based on your instruction that these repos are mostly your own code.
- Any nested `deps/`/`toolboxes/` components are treated as third-party unless confirmed otherwise.
- Before direct code lift from nested dependency folders, add/update `THIRD_PARTY_NOTICES.md`.
