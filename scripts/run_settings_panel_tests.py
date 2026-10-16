"""Focused browser checks for active settings, policy and file drafts."""

import argparse
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from playwright.sync_api import sync_playwright


def run_tests():
    web_root = Path(__file__).resolve().parents[1] / "server" / "web"
    requests = []
    saved_settings = {
        "cwd": "/workspace",
        "model": "one",
        "agent": "",
        "effort": "medium",
        "mode": "accept-edits",
        "sound": False,
        "haptics": False,
        "trustedWorkspaces": ["/workspace"],
        "custom": {"preserve": True},
    }
    saved_policy = {
        "permissions": {
            "allow": ["command(git)"],
            "deny": ["write(*)"],
            "ask": ["read(project/*)"],
        },
        "revision": "policy-rev",
    }
    revision = 7
    file_path = "/workspace/report final.md"

    def respond(route):
        nonlocal revision, saved_policy
        request = route.request
        url_path = urlsplit(request.url).path
        payload = request.post_data_json if request.post_data else None
        requests.append(
            {
                "route": request.url,
                "method": request.method,
                "body": payload,
                "headers": request.headers,
            }
        )
        allowed_methods = {"GET", "HEAD"}
        if url_path in {"/api/v1/settings", "/api/v1/cli/policy"}:
            allowed_methods.add("PATCH")
        if url_path == "/api/v1/client/visibility":
            allowed_methods.add("POST")
        if request.method not in allowed_methods:
            route.fulfill(status=405, json={"message": "Unexpected method"})
            return
        if url_path.startswith("/api/v1/"):
            endpoint = url_path.removeprefix("/api/v1")
            if endpoint == "/auth/session":
                result = {"csrf_token": "test-csrf"}
            elif endpoint == "/settings":
                if request.method == "PATCH":
                    assert request.headers["if-match"] == f'"{revision}"'
                    assert request.headers["x-csrf-token"] == "test-csrf"
                    saved_settings.update(payload["settings"])
                    revision += 1
                result = {"settings": saved_settings, "revision": revision}
            elif endpoint == "/cli/policy":
                if request.method == "PATCH":
                    assert payload["revision"] == saved_policy["revision"]
                    saved_policy = {
                        "permissions": payload["permissions"],
                        "revision": "policy-saved",
                    }
                result = saved_policy
            elif endpoint == "/models":
                result = {"models": [{"id": "one", "name": "One"}]}
            elif endpoint == "/agents":
                result = {"agents": []}
            elif endpoint == "/commands":
                result = {"commands": []}
            elif endpoint == "/files":
                result = {
                    "path": "/workspace",
                    "entries": [
                        {
                            "name": Path(file_path).name,
                            "path": file_path,
                            "is_dir": False,
                        }
                    ],
                }
            elif endpoint == "/client/visibility":
                result = {"status": "ok"}
            elif endpoint == "/auth/status":
                result = {"authenticated": None, "pending": False}
            elif endpoint in {"/tasks", "/local-tasks"}:
                result = {"tasks": [], "subagents": []}
            elif endpoint in {"/mcp", "/plugins", "/skills"}:
                result = {"servers": [], "plugins": [], "skills": []}
            else:
                route.fulfill(status=404, json={"message": endpoint})
                return
            route.fulfill(json=result)
            return
        if url_path == "/health":
            route.fulfill(json={"status": "ok"})
            return
        relative = "index.html" if url_path == "/" else url_path.lstrip("/")
        asset = (web_root / relative).resolve()
        if not asset.is_relative_to(web_root) or not asset.is_file():
            route.fulfill(status=404, body="Not found")
            return
        route.fulfill(
            body=asset.read_bytes(),
            content_type=mimetypes.guess_type(asset.name)[0]
            or "application/octet-stream",
        )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=os.environ.get("COMPANION_BROWSER_EXECUTABLE"),
        )
        try:
            context = browser.new_context(service_workers="block")
            page = context.new_page()
            page.set_default_timeout(5000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route("**/*", respond)
            page.goto("http://localhost/")

            def open_settings():
                page.locator("#btn-toggle-drawer").click()
                page.locator("#btn-open-settings").click()
                page.locator("#field-model").wait_for()

            open_settings()
            assert (
                page.get_by_label("النموذج النشط", exact=True).input_value()
                == "one"
            )
            page.get_by_label("النموذج النشط", exact=True).focus()
            page.keyboard.press("Tab")
            assert page.get_by_label("الوكيل النشط", exact=True).evaluate(
                "field=>field===document.activeElement"
            )
            unnamed = page.locator(
                "#settings-dialog input, " "#settings-dialog select"
            ).evaluate_all(
                "controls=>controls.filter(c=>!c.labels.length && "
                "!c.getAttribute('aria-label')).length"
            )
            assert unnamed == 0
            page.locator("label[for=field-voice-tones]").click()
            page.locator("#btn-save-settings").click()
            page.locator("#settings-dialog").wait_for(state="hidden")
            settings_write = next(
                entry
                for entry in requests
                if urlsplit(entry["route"]).path == "/api/v1/settings"
                and entry["method"] == "PATCH"
            )
            assert settings_write["body"] == {"settings": {"sound": True}}
            assert settings_write["headers"]["if-match"] == '"7"'
            assert saved_settings["custom"]["preserve"] is True

            open_settings()
            page.get_by_role(
                "button",
                name="حذف التصريح الدائم للأمر command(git)",
                exact=True,
            ).click()
            page.wait_for_function(
                "!document.querySelector('#settings-dialog code')"
            )
            policy_write = next(
                entry
                for entry in requests
                if urlsplit(entry["route"]).path == "/api/v1/cli/policy"
                and entry["method"] == "PATCH"
            )
            assert policy_write["body"] == {
                "permissions": {
                    "allow": [],
                    "deny": ["write(*)"],
                    "ask": ["read(project/*)"],
                },
                "revision": "policy-rev",
            }
            page.evaluate("window.Companion.ui.dismissTopDialog()")
            for file_path in (
                "/workspace/report final.md",
                "/workspace/report.md",
                '/workspace/bad"name.md',
            ):
                page.locator("#ai-prompt-input").fill("@")
                page.locator("#at-autocomplete-popup [role=option]").filter(
                    has_text=Path(file_path).name
                ).click()
                expected = "@" + json.dumps(file_path) + " "
                assert (
                    page.locator("#ai-prompt-input").input_value() == expected
                )
            file_requests = [
                entry
                for entry in requests
                if urlsplit(entry["route"]).path == "/api/v1/files"
            ]
            assert file_requests
            assert all(
                "path=%2Fworkspace%2F" in entry["route"]
                for entry in file_requests
            )
            visibility_writes = [
                entry
                for entry in requests
                if entry["method"] == "POST"
                and urlsplit(entry["route"]).path
                == "/api/v1/client/visibility"
            ]
            for entry in visibility_writes:
                assert set(entry["body"]) == {"client_id", "visible"}
                assert UUID(entry["body"]["client_id"]).version == 4
                assert isinstance(entry["body"]["visible"], bool)
                assert entry["headers"]["x-csrf-token"] == "test-csrf"
            writes = [
                (entry["method"], urlsplit(entry["route"]).path)
                for entry in requests
                if entry["method"] not in {"GET", "HEAD"}
                and (entry["method"], urlsplit(entry["route"]).path)
                != ("POST", "/api/v1/client/visibility")
            ]
            assert writes == [
                ("PATCH", "/api/v1/settings"),
                ("PATCH", "/api/v1/cli/policy"),
            ], writes
            assert errors == [], errors
            print(
                "Active settings labels/Tab, partial save, policy ownership, "
                "file quoting and workspace scope passed"
            )
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    run_tests()


if __name__ == "__main__":
    main()
