# Antigravity Companion - Complete OTA Update Guide & Release Protocol

This document details the architecture and operational procedures for releasing updates and maintaining the In-App Update Engine for Antigravity Companion.

## 1. Architecture Highlights
- **Repository**: `https://github.com/ahanafy41/antigravity-companion`
- **Releases API**: `https://api.github.com/repos/ahanafy41/antigravity-companion/releases/latest`
- **Signing Keystore**: `app/keystore/antigravity-release-key.jks` (PKCS12, 30-year validity, permanent key)
- **Installer Mechanism**: `androidx.core.content.FileProvider` granting read permissions to Android Package Installer (`Intent.ACTION_VIEW` on `application/vnd.android.package-archive`).
- **Streaming Downloader**: OkHttp 4.12.0 streaming directly to a `.tmp` file, atomically renamed to `app-release.apk` upon verification.
- **Accessibility**: 100% WCAG 2.2 AAA & WAI-ARIA compliant, TalkBack & Jieshuo friendly, zero emoji clutter.

## 2. Release Steps for Any Future Update
When creating a new release:
1. Edit `app/build.gradle`:
   - Increment `versionCode` (e.g. `4`).
   - Update `versionName` (e.g. `"1.2.1"`).
2. Edit `.github/workflows/build-apk.yml`:
   - Set tag to new version (`v1.2.1`).
3. Edit `project_spec.json`:
   - Update `"version": "1.2.1"`.
4. If `server/web/index.html` was edited:
   - Sync to `app/src/main/assets/server/web/index.html`
   - Sync to `app/src/main/assets/web/index.html`
   - Sync to `~/.antigravity-server/web/index.html`
5. Run automated validation:
   - `python3 /data/data/com.termux/files/home/.gemini/config/skills/universal-software-agency/scripts/validate_code.py --strict --human-grade .`
6. Commit and Push:
   ```bash
   git add -A
   git commit -m "feat(vX.Y.Z): <description>"
   git push origin main
   ```
7. GitHub Actions builds signed `app-release.apk` and publishes the release.
8. Existing companion apps on devices check `releases/latest`, see the newer version, download it, and prompt the user to install in-place seamlessly.
