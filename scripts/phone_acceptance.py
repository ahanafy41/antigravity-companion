"""Run live Companion acceptance on-device without exporting secrets."""

import argparse
import hashlib
import hmac
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import sys
import subprocess
import time
import urllib.error
import urllib.request
import uuid

TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


class CheckFailure(Exception):
    """A fixed, public-safe acceptance failure code."""


class Blocked(CheckFailure):
    """A missing prerequisite, never a successful test."""


def require(condition, code):
    if not condition:
        raise CheckFailure(code)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def atomic_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.with_name(path.name + ".staged")
    with staged.open("w", encoding="utf-8") as stream:
        json.dump(document, stream, ensure_ascii=True, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    staged.replace(path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        raise CheckFailure("redirect_refused")


class PhoneClient:
    def __init__(self, root):
        port = read_json(root / "settings.json").get("port", 7681)
        require(type(port) is int and 1 <= port <= 65535, "invalid_port")
        self.origin = "http://127.0.0.1:" + str(port)
        self.cookies = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            NoRedirect(),
            urllib.request.HTTPCookieProcessor(self.cookies),
        )
        self.csrf = ""
        self.authenticate(root)

    def authenticate(self, root):
        token = read_json(root / "android.json")["android_token"]
        nonce = secrets.token_hex(32)
        health = self.request("/health?android_nonce=" + nonce)
        expected = hmac.new(token.encode(), nonce.encode(), hashlib.sha256)
        require(
            hmac.compare_digest(
                expected.hexdigest(), health.get("android_proof", "")
            ),
            "health_hmac_mismatch",
        )
        owner = read_json(root / "instance.json")["instance_id"]
        require(health.get("instance_id") == owner, "health_owner_mismatch")
        session = self.request(
            "/api/v1/android/bootstrap",
            {},
            {"Authorization": "Bearer " + token},
        )
        self.csrf = session.get("csrf_token", "")
        require(bool(self.csrf) and bool(self.cookies), "bootstrap_invalid")

    def request(self, route, payload=None, extra_headers=None):
        headers = {"Origin": self.origin, "Content-Type": "application/json"}
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        headers.update(extra_headers or {})
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.origin + route, body, headers)
        with self.client.open(request, timeout=20) as response:
            return json.load(response)

    def replay(self, run_id, after=0):
        route = "/api/v1/runs/" + run_id + "/events?after=" + str(after)
        request = urllib.request.Request(
            self.origin + route, headers={"Origin": self.origin}
        )
        with self.client.open(request, timeout=20) as response:
            body = response.read(2 * 1024 * 1024).decode("utf-8")
        events = []
        for packet in body.split("\n\n"):
            fields = dict(
                line.split(":", 1)
                for line in packet.splitlines()
                if ":" in line and not line.startswith(":")
            )
            if "id" in fields and "data" in fields:
                events.append(
                    (
                        int(fields["id"]),
                        fields.get("event", "").strip(),
                        json.loads(fields["data"]),
                    )
                )
        return events

    def action(self, action, arguments=None):
        action_id = uuid.uuid4().hex
        if action not in ("tree", "select", "screenshot"):
            identity = self.request("/api/v1/device/epoch")
            epoch = identity.get("epoch", "")
            require(
                len(epoch) == 32 and all(char in "0123456789abcdef" for char in epoch),
                "device_journal_identity_invalid",
            )
            action_id = epoch + ":" + action_id
        outcome = self.request(
            "/api/v1/device/actions",
            {
                "action_id": action_id,
                "action": action,
                "args": arguments or {},
            },
        )
        require(outcome.get("status") == "completed", "device_action_failed")
        return outcome.get("result", {})


def process_snapshot():
    processes = {}
    for directory in Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            if directory.stat().st_uid != os.getuid():
                continue
            stat = (directory / "stat").read_text().rsplit(")", 1)[1].split()
            processes[int(directory.name)] = {
                "ppid": int(stat[1]),
                "start": stat[19],
                "cwd": (directory / "cwd").resolve(strict=True),
                "command": (directory / "cmdline").read_bytes(),
            }
        except (OSError, ValueError, IndexError):
            continue
    return processes


def identities(processes):
    return {(pid, process["start"]) for pid, process in processes.items()}


def owned_processes(processes, cwd):
    owned = {
        pid
        for pid, process in processes.items()
        if process["cwd"] == cwd
        and b"--input-format" in process["command"]
        and b"stream-json" in process["command"]
    }
    while True:
        expanded = owned | {
            pid
            for pid, process in processes.items()
            if process["ppid"] in owned
        }
        if expanded == owned:
            return {pid: processes[pid] for pid in owned}
        owned = expanded


class Acceptance:
    def __init__(self, arguments):
        self.arguments = arguments
        self.finished = False
        self.root = arguments.root.expanduser().resolve()
        digest = hashlib.sha256(str(arguments.report.resolve()).encode())
        self.private = (
            Path.home() / ".companion-acceptance" / digest.hexdigest()[:16]
        )
        self.private.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.private.chmod(0o700)
        self.state_path = self.private / "state.json"
        if self.state_path.exists():
            require(arguments.resume, "existing_state_requires_resume")
            self.state = read_json(self.state_path)
        else:
            self.state = {
                "nonce": "FIELD_" + secrets.token_hex(16),
                "checks": {},
            }
        self.client = PhoneClient(self.root)
        self.checks = self.state["checks"]
        for outcome in self.checks.values():
            if outcome["status"] == "in_progress":
                outcome.update(
                    status="blocked", error_code="interrupted_no_retry"
                )
        self.save()

    def save(self):
        atomic_json(self.state_path, self.state)
        self.state_path.chmod(0o600)
        report = public_report(self.checks)
        report["complete"] = self.finished
        report["phase"] = self.arguments.phase
        atomic_json(self.arguments.report, report)

    def finish_phase(self):
        self.finished = True
        self.save()

    def scenario(self, name, operation):
        existing = self.checks.get(name)
        if existing:
            return existing["status"] == "passed"
        self.checks[name] = {"status": "in_progress"}
        self.save()
        started = time.monotonic()
        try:
            operation()
            outcome = {"status": "passed", "evidence": {"verified": True}}
        except Blocked as failure:
            outcome = {"status": "blocked", "error_code": str(failure)}
        except CheckFailure as failure:
            outcome = {"status": "failed", "error_code": str(failure)}
        except (OSError, ValueError, KeyError, TypeError) as failure:
            # Public reports expose exception types, never server messages.
            outcome = {
                "status": "failed",
                "error_type": type(failure).__name__,
            }
        outcome["elapsed_seconds"] = round(time.monotonic() - started, 3)
        self.checks[name] = outcome
        self.save()
        print(name + ": " + outcome["status"], flush=True)
        return outcome["status"] == "passed"

    def session(self):
        return self.client.request(
            "/api/v1/sessions/" + self.state["session_id"]
        )

    def create_session(self):
        if "session_id" in self.state:
            return
        cwd = self.private / "workspace"
        cwd.mkdir(exist_ok=True, mode=0o700)
        if self.arguments.cwd:
            parent = self.arguments.cwd.expanduser().resolve()
            cwd = parent / ("companion-acceptance-" + secrets.token_hex(8))
            cwd.mkdir(mode=0o700)
        settings = self.client.request("/api/v1/settings")["settings"]
        roots = settings.get(
            "workspace_roots", settings.get("trustedWorkspaces", [])
        )
        if not isinstance(roots, list):
            raise Blocked("workspace_configuration_invalid")
        allowed = [Path(root).expanduser().resolve() for root in roots] or [
            Path.home()
        ]
        if not any(cwd == root or root in cwd.parents for root in allowed):
            raise Blocked("private_workspace_outside_configured_roots")
        options = {"cwd": str(cwd)}
        for key in ("model", "effort"):
            if isinstance(settings.get(key), str) and settings[key]:
                options[key] = settings[key]
        if self.arguments.model:
            options["model"] = self.arguments.model
        session = self.client.request("/api/v1/sessions", options)
        self.state.update(session_id=session["session_id"], cwd=str(cwd))
        self.save()

    def start_turn(self, name, prompt):
        require(name not in self.state, "turn_must_not_be_retried")
        request_id = uuid.uuid4().hex
        self.state[name] = {"request_id": request_id, "dispatching": True}
        self.save()
        response = self.client.request(
            "/api/v1/sessions/" + self.state["session_id"] + "/runs",
            {"message": prompt, "client_request_id": request_id},
        )
        self.state[name]["run_id"] = response["run_id"]
        self.save()
        return response["run_id"]

    def wait_turn(self, run_id):
        deadline = time.monotonic() + self.arguments.timeout
        while time.monotonic() < deadline:
            run = self.client.request("/api/v1/runs/" + run_id)
            if run.get("state") in TERMINAL:
                return run
            time.sleep(0.4)
        self.client.request("/api/v1/runs/" + run_id + "/cancel", {})
        raise CheckFailure("turn_timeout_cancelled_owned_run")

    def completed_turn(self, name, prompt, expected):
        run_id = self.start_turn(name, prompt)
        run = self.wait_turn(run_id)
        require(run.get("state") == "completed", "turn_not_completed")
        require(
            run.get("response", "").strip() == expected, "response_mismatch"
        )
        session = self.session()
        conversation = session.get("conversation_id")
        require(bool(conversation), "conversation_missing")
        previous = self.state.get("conversation_id")
        require(
            previous is None or previous == conversation,
            "conversation_changed",
        )
        self.state["conversation_id"] = conversation
        self.save()
        events = self.client.replay(run_id)
        require(
            bool(events) and events[-1][2].get("state") == "completed",
            "terminal_replay_missing",
        )
        cursor = events[0][0]
        repeated = self.client.replay(run_id, cursor)
        require(
            repeated == [event for event in events if event[0] > cursor],
            "sse_cursor_replay_mismatch",
        )

    def cancel_turn(self):
        sentinel = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(600)"],
            cwd=self.private,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            self.cancel_running_turn(sentinel)
        finally:
            sentinel.terminate()
            try:
                sentinel.wait(timeout=3)
            except subprocess.TimeoutExpired:
                sentinel.kill()
                sentinel.wait(timeout=3)

    def cancel_running_turn(self, sentinel):
        baseline = process_snapshot()
        require(bool(baseline), "process_inventory_unavailable")
        cwd = Path(self.state["cwd"])
        run_id = self.start_turn(
            "cancel_run",
            "Do not call tools. Write a very "
            "long numbered essay of 10000 lines about "
            "integers. Never finish before all lines.",
        )
        deadline = time.monotonic() + min(self.arguments.timeout, 20)
        owned = {}
        while time.monotonic() < deadline:
            run = self.client.request("/api/v1/runs/" + run_id)
            require(run.get("state") == "running", "cancel_window_missed")
            owned = owned_processes(process_snapshot(), cwd)
            if owned:
                break
            time.sleep(0.2)
        if not owned:
            self.client.request("/api/v1/runs/" + run_id + "/cancel", {})
            raise Blocked("owned_process_not_observable")
        require(sentinel.poll() is None, "unrelated_sentinel_not_alive")
        self.client.request("/api/v1/runs/" + run_id + "/cancel", {})
        run = self.wait_turn(run_id)
        require(run.get("state") == "cancelled", "cancel_not_confirmed")
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            remaining = identities(process_snapshot())
            if not (identities(owned) & remaining):
                break
            time.sleep(0.2)
        require(not identities(owned) & remaining, "owned_process_survived")
        require(sentinel.poll() is None, "unrelated_sentinel_was_killed")
        require(
            self.session().get("conversation_id")
            == self.state["conversation_id"],
            "cancel_changed_conversation",
        )

    def chat(self):
        if not self.scenario("chat_session", self.create_session):
            return
        nonce = self.state["nonce"]
        turns = [
            (
                "chat_initial",
                lambda: self.completed_turn(
                    "initial_run",
                    "Remember "
                    + nonce
                    + ". Reply only READY. Do not call tools.",
                    "READY",
                ),
            ),
            (
                "chat_recall",
                lambda: self.completed_turn(
                    "recall_run",
                    "Reply only with the FIELD_ token I asked you "
                    "to remember. Do not call tools.",
                    nonce,
                ),
            ),
            ("chat_cancel", self.cancel_turn),
            (
                "chat_resume",
                lambda: self.completed_turn(
                    "resume_run",
                    "Reply only with the FIELD_ token I asked you "
                    "to remember before the cancelled essay. "
                    "Do not call tools.",
                    nonce,
                ),
            ),
        ]
        dependency_ok = True
        for name, operation in turns:
            if dependency_ok:
                dependency_ok = self.scenario(name, operation)
            elif name not in self.checks:
                self.checks[name] = {
                    "status": "blocked",
                    "error_code": "dependency_failed",
                }
                self.save()

    def tree(self):
        snapshot = self.client.action("tree")
        require(
            isinstance(snapshot.get("root"), dict)
            and bool(snapshot.get("snapshot_id")),
            "tree_invalid",
        )
        return snapshot

    def menu_click(self):
        snapshot = self.tree()
        candidates = [
            node
            for node in nodes(snapshot["root"])
            if node.get("clickable")
            and node_text(node) in ("القائمة", "فتح القائمة")
        ]
        if len(candidates) != 1:
            raise Blocked("safe_menu_target_missing")
        arguments = target_arguments(snapshot, candidates[0])
        performed = self.client.action("click", arguments)
        require(performed.get("performed") is True, "click_not_performed")
        time.sleep(0.5)
        require(menu_visible(self.tree()), "menu_did_not_open")

    def menu_back(self):
        if not menu_visible(self.tree()):
            raise Blocked("menu_not_open")
        performed = self.client.action("back")
        require(performed.get("performed") is True, "back_not_performed")
        time.sleep(0.5)
        snapshot = self.tree()
        require(not menu_visible(snapshot), "menu_still_open")
        require(
            any(
                node_text(node) == "القائمة"
                for node in nodes(snapshot["root"])
            ),
            "back_left_companion",
        )

    def scroll(self):
        snapshot = self.tree()
        if not menu_visible(snapshot):
            raise Blocked("safe_menu_not_open_for_scroll")
        candidates = [
            node for node in nodes(snapshot["root"]) if node.get("scrollable")
        ]
        if len(candidates) != 1:
            raise Blocked("safe_scroll_target_ambiguous")
        require(
            any(
                node_text(node) == "القائمة"
                for node in nodes(snapshot["root"])
            ),
            "companion_foreground_not_verified",
        )
        before = visible_signature({"root": candidates[0]})
        arguments = target_arguments(snapshot, candidates[0])
        arguments["direction"] = "forward"
        performed = self.client.action("scroll", arguments)
        require(performed.get("performed") is True, "scroll_not_performed")
        time.sleep(0.5)
        after = self.tree()
        moved = [
            node for node in nodes(after["root"]) if node.get("scrollable")
        ]
        require(
            menu_visible(after) and len(moved) == 1, "scroll_target_changed"
        )
        require(
            visible_signature({"root": moved[0]}) != before,
            "scroll_did_not_change_visible_content",
        )

    def voice_snapshot(self):
        sessions = self.client.request("/api/v1/sessions")["sessions"]
        return {
            session["session_id"]: sorted(session.get("runs", []))
            for session in sessions
        }

    def voice_before(self):
        def remember():
            self.state["voice_baseline"] = self.voice_snapshot()
            self.save()

        self.scenario("voice_baseline", remember)

    def voice_after(self):
        def compare():
            require("voice_baseline" in self.state, "voice_baseline_missing")
            require(
                self.voice_snapshot() == self.state["voice_baseline"],
                "voice_created_or_sent_chat_turn",
            )

        self.scenario("voice_no_auto_send", compare)

    def device(self):
        if self.scenario("device_menu_click", self.menu_click):
            self.scenario("device_scroll", self.scroll)
            self.scenario("device_menu_back", self.menu_back)
        else:
            for name in ("device_scroll", "device_menu_back"):
                self.checks.setdefault(
                    name,
                    {"status": "blocked", "error_code": "dependency_failed"},
                )
            self.save()


def nodes(root):
    yield root
    for child in root.get("children", []):
        yield from nodes(child)


def node_text(node):
    return (node.get("text") or node.get("content_description") or "").strip()


def target_arguments(snapshot, node):
    return {
        "snapshot_id": snapshot["snapshot_id"],
        "element_id": node["element_id"],
    }


def menu_visible(snapshot):
    return any(
        node_text(node) == "إغلاق القائمة" for node in nodes(snapshot["root"])
    )


def visible_signature(snapshot):
    visible = [
        (node_text(node), node.get("bounds"))
        for node in nodes(snapshot["root"])
    ]
    return hashlib.sha256(
        json.dumps(visible, sort_keys=True).encode()
    ).digest()


def public_report(checks):
    statuses = {
        "passed": "pass",
        "failed": "fail",
        "blocked": "blocked",
        "in_progress": "blocked",
    }
    cases = []
    for name, outcome in checks.items():
        case = {"name": name, "status": statuses[outcome["status"]]}
        if outcome.get("error_code"):
            case["reason"] = outcome["error_code"]
        elif outcome.get("error_type"):
            case["reason"] = outcome["error_type"]
        if "elapsed_seconds" in outcome:
            case["elapsed_seconds"] = outcome["elapsed_seconds"]
        if outcome.get("evidence", {}).get("verified") is True:
            case["evidence"] = {"verified": True}
        cases.append(case)
    return {
        "schema": 1,
        "complete": all(
            outcome["status"] != "in_progress" for outcome in checks.values()
        ),
        "cases": cases,
    }


def report_setup_failure(arguments, outcome):
    report = public_report({"setup": outcome})
    report["phase"] = arguments.phase
    atomic_json(arguments.report, report)


def parse_arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path.home() / ".antigravity-server"
    )
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=90)
    parser.add_argument(
        "--phase",
        choices=("chat", "device", "voice-before", "voice-after"),
        required=True,
    )
    parser.add_argument("--delay", type=float, default=4)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--model")
    parser.add_argument("--cwd", type=Path)
    arguments = parser.parse_args()
    if not 1 <= arguments.timeout <= 600:
        parser.error("--timeout must be between 1 and 600 seconds")
    if not 0 <= arguments.delay <= 30:
        parser.error("--delay must be between 0 and 30 seconds")
    return arguments


def main():
    os.umask(0o077)
    arguments = parse_arguments()
    try:
        time.sleep(arguments.delay)
        acceptance = Acceptance(arguments)
        getattr(acceptance, arguments.phase.replace("-", "_"))()
        acceptance.finish_phase()
        phase_checks = [
            outcome
            for name, outcome in acceptance.checks.items()
            if name.startswith(arguments.phase.split("-")[0] + "_")
        ]
        return (
            0
            if phase_checks
            and all(outcome["status"] == "passed" for outcome in phase_checks)
            else 1
        )
    except CheckFailure as failure:
        report_setup_failure(
            arguments, {"status": "failed", "error_code": str(failure)}
        )
        print("acceptance: " + str(failure), file=sys.stderr)
    except (OSError, ValueError, KeyError, TypeError) as failure:
        report_setup_failure(
            arguments,
            {"status": "failed", "error_type": type(failure).__name__},
        )
        print("acceptance: " + type(failure).__name__, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
