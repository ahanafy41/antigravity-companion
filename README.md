# Antigravity Companion

An Android shell and local web interface for `agy` chat and its available CLI functions. Python runs in Termux; Android and the browser use the local server, whose default port is 7681. Conversations and settings stay in local files; no cloud database is required.

The current lean architecture follows the maintainer's [RFC](docs/lean-companion-architecture-rfc.md) and [specification](docs/lean-companion-spec.json). See the [implementation report](docs/lean-companion-report.md) for verification and remaining device acceptance.

## Install and run

Install Python, put `agy` on PATH, and install [requirements.txt](requirements.txt). Android also needs Termux, the RUN_COMMAND permission and your chosen allow-external-apps setting. Setup preserves existing conversations and configuration; it does not silently enable that Termux setting.

One example, from the project root:

```bash
python -m pip install -r requirements.txt
python server/server.py
```

Open the local address printed by the server. The local browser receives an HttpOnly, SameSite=Strict session after connection, Host and Origin checks; state-changing requests require CSRF. This boundary trusts local programs. CLI account login and model authorization remain with `agy`; unavailable functions show an explanation.

For a fixed Termux release, use its ZIP, manifest, signature, pinned public certificate, OpenSSL (`openssl-tool` in Termux), and Python requirements. The installer verifies file integrity, paths and certificate before selecting a release atomically. Data lives outside releases; rollback keeps newer data. Restart the owned process after changing the selected release. See [release and recovery](docs/release-and-recovery.md).

## Android and chat

Android opens the bundled HTTPS dashboard through WebViewAssetLoader. It has five core controls: chat, one start/stop toggle, diagnostics, updates, and setup under its own heading. One Arabic status describes server availability. Diagnostics checks Termux installation, RUN_COMMAND permission and server connectivity.

The app's AccessibilityService, local automation WebSocket on 8765, and native voice capture/TTS have been retired. Browser speech synthesis, WebAudio and haptics remain independent features. Semantic controls, Arabic labels, live announcements and keyboard focus remain; TalkBack and Jieshuo acceptance still requires a real phone.

Chat and the dashboard retain the approved main interface. Settings preserve drafts, revision conflict protection and partial-save feedback. Local history can be read offline; sending requires the server. The Service Worker caches no API paths and does not replay pending requests after reconnection.

The native bridge restricts navigation and messages to the main frame and approved bundled/server origins. Modern private requests require HMAC verification before credential bootstrap. Modern shutdown uses the session Cookie, CSRF and Origin, without POST replay or redirects. Legacy readiness allows display without sending private Bearer credentials; legacy shutdown retains its existing API contract.

`debug` uses its separate package identity. `release` requires the original signing key and private environment values. Keys stay outside Git; no release is published automatically. [server/version.json](server/version.json) records release identity. User settings live in settings.json under data-dir; unknown values survive saves.

## CLI reference

| Tool | Inputs and purpose |
|---|---|
| server/server.py | --help; --host, --port, --data-dir: run the local API |
| scripts/doctor.py | --doctor: inspect the CLI/Termux environment and server connection |
| scripts/run_phone_tests.py | --help; --phase all/dashboard/chat, --adb, --serial, --output, --device-dir, --timeout, --root, --model, --cwd, --resume: host ADB acceptance |
| scripts/phone_acceptance.py | --help; --phase chat, --report, --root, --timeout, --delay, --model, --cwd, --resume: on-device chat API acceptance |
| scripts/phase1_preflight.py | --help; --strict: check CLI help and local HTTP contracts |
| scripts/prepare_web_release.py | --check: verify the static cache revision |
| scripts/sync_android_web.py | --help; --check, --source, --destination: mirror canonical web assets |
| scripts/run_android_web_asset_tests.py | --help; --apk: verify local and packaged web assets |
| scripts/package_release.py | --version, --output, --keystore: prepare a signed fixed release |
| scripts/install_release.py | --archive, --manifest, --signature, --root; --rollback, --verify-selected: verify and select a release |

Retired device/voice acceptance phases and speech-audio flags are rejected. Reports exclude private tokens and screen content. Browser development checks use [requirements-dev.txt](requirements-dev.txt); COMPANION_BROWSER_EXECUTABLE selects an existing browser without downloading one. [SKILL.md](SKILL.md) documents the repository tools.

## Contribute

Read the [current plan](docs/lean-companion-plan.md), [project state](project_state.md), and [CHANGELOG.md](CHANGELOG.md). Send a focused issue with reproduction steps and sanitized version details, or a small pull request with verification evidence. Remove credentials and private chat content from reports.

Current contributor: **Kamal Yaser**; [email](mailto:kamalyaser31@gmail.com), [Telegram](https://t.me/kamalyaser31). Original application attribution to Ahmed Hanafy is preserved.
