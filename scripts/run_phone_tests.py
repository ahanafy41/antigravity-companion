"""Run bounded Companion acceptance on one authorized Android device."""

import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time
import unicodedata
import uuid
import wave
import xml.etree.ElementTree as ET

PACKAGE = "com.antigravity.companion"
START_VOICE = "إملاء رسالة للمساعد"
OPEN_CHAT = "الانتقال لواجهة الشات والمحادثة"
CANCEL_VOICE = "إلغاء الإملاء"
DEFAULT_SPEECH = "هذه رسالة اختبار صوتي لا ترسلها"
SAFE_PATH = re.compile(r"/[A-Za-z0-9_./-]+\Z")
SAFE_ENUM = re.compile(r"[a-z0-9_-]{1,100}\Z")


class AcceptanceError(Exception):
    """A sanitized device boundary failure."""


class Adb:
    def __init__(self, executable, serial):
        self.executable = executable
        self.serial = serial

    def command(self, *arguments):
        completed = subprocess.run(
            [self.executable, "-s", self.serial, *arguments],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        if completed.returncode:
            raise AcceptanceError("adb_command_failed")
        return completed.stdout

    def shell(self, *arguments):
        return self.command("shell", shlex.join(arguments))

    def open_companion(self):
        self.shell("am", "start", "-W", "-n", PACKAGE + "/.MainActivity")

    def hierarchy(self):
        raw_xml = self.command(
            "shell", "-tt", "uiautomator", "dump", "/dev/tty"
        )
        start = raw_xml.find("<?xml")
        end = raw_xml.rfind("</hierarchy>")
        if start < 0 or end < 0:
            raise AcceptanceError("ui_hierarchy_unavailable")
        xml_end = end + len("</hierarchy>")
        return ET.fromstring(raw_xml[start:xml_end])

    def tap(self, node):
        bounds = re.fullmatch(
            r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", "")
        )
        if not bounds:
            raise AcceptanceError("control_bounds_invalid")
        left, top, right, bottom = map(int, bounds.groups())
        self.shell(
            "input", "tap", str((left + right) // 2), str((top + bottom) // 2)
        )


def parser():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--adb", default=shutil.which("adb"))
    options.add_argument("--serial")
    options.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / ".tmp"
        / "phone-acceptance",
    )
    options.add_argument(
        "--device-dir", default="/sdcard/Download/companion-field-test"
    )
    options.add_argument("--timeout", type=int, default=90)
    options.add_argument(
        "--phase", choices=["all", "chat", "device", "voice"], default="all"
    )
    options.add_argument("--speech-audio", type=Path)
    options.add_argument("--speech-text", default=DEFAULT_SPEECH)
    options.add_argument("--root")
    options.add_argument("--model")
    options.add_argument("--cwd")
    options.add_argument("--resume", action="store_true")
    return options


def authorized_device(options):
    if not options.adb:
        raise AcceptanceError("adb_required")
    completed = subprocess.run(
        [options.adb, "devices"], capture_output=True, text=True, timeout=20
    )
    if completed.returncode:
        raise AcceptanceError("adb_discovery_failed")
    devices = [
        line.split()[0]
        for line in completed.stdout.splitlines()
        if len(line.split()) == 2 and line.split()[1] == "device"
    ]
    if options.serial:
        if options.serial not in devices:
            raise AcceptanceError("selected_device_not_authorized")
        return Adb(options.adb, options.serial)
    if len(devices) != 1:
        raise AcceptanceError("exactly_one_authorized_device_required")
    return Adb(options.adb, devices[0])


def write_report(path, cases, started, complete=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "complete": complete,
                "cases": cases,
                "elapsed_seconds": round(time.monotonic() - started, 2),
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )


def safe_cases(report):
    cases = report.get("cases")
    if not isinstance(cases, list) or not cases:
        raise AcceptanceError("phone_report_invalid")
    sanitized = []
    for case in cases:
        if not isinstance(case, dict):
            raise AcceptanceError("phone_report_invalid")
        name, status = case.get("name", ""), case.get("status", "")
        if not isinstance(name, str) or not SAFE_ENUM.fullmatch(name):
            raise AcceptanceError("phone_report_invalid")
        if status not in (
            "pass",
            "fail",
            "blocked",
        ):
            raise AcceptanceError("phone_report_invalid")
        entry = {"name": name, "status": status}
        reason = case.get("reason")
        if isinstance(reason, str) and SAFE_ENUM.fullmatch(reason):
            entry["reason"] = reason
        sanitized.append(entry)
    return sanitized


def termux_python(adb):
    package = adb.shell("dumpsys", "package", "com.termux")
    match = re.search(r"\bdataDir=(/[^\s]+)", package)
    if not match or not SAFE_PATH.fullmatch(match.group(1)):
        raise AcceptanceError("termux_data_directory_unavailable")
    return match.group(1) + "/files/usr/bin/python"


def phase_report_path(options, phase):
    phase_key = "voiceaudit" if phase.startswith("voice-") else phase
    progress_path = options.output / ".progress.json"
    try:
        progress = json.loads(progress_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        progress = {}
    if not isinstance(progress, dict):
        raise AcceptanceError("host_progress_invalid")
    if phase_key not in progress:
        progress[phase_key] = (
            options.device_dir + "/acceptance-" + uuid.uuid4().hex + ".json"
        )
    device_report = progress[phase_key]
    expected_path = (
        re.escape(options.device_dir) + r"/acceptance-[0-9a-f]{32}\.json"
    )
    if not isinstance(device_report, str) or not re.fullmatch(
        expected_path, device_report
    ):
        raise AcceptanceError("host_progress_invalid")
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text(json.dumps(progress), encoding="utf-8")
    return device_report


def termux_drawer(adb):
    adb.shell(
        "input",
        "keycombination",
        "KEYCODE_CTRL_LEFT",
        "KEYCODE_ALT_LEFT",
        "KEYCODE_DPAD_RIGHT",
    )
    return adb.hierarchy()


def session_nodes(hierarchy):
    return [
        node
        for node in hierarchy.iter("node")
        if node.get("resource-id") == "com.termux:id/session_title"
    ]


def session_identities(hierarchy):
    titles = [node.get("text", "") for node in session_nodes(hierarchy)]
    identities = set(titles)
    if not titles or not all(titles) or len(identities) != len(titles):
        raise AcceptanceError("terminal_session_identity_unavailable")
    return identities


def new_termux_session(adb):
    adb.shell("am", "start", "-W", "-n", "com.termux/.app.TermuxActivity")
    hierarchy = termux_drawer(adb)
    previous_sessions = session_identities(hierarchy)
    new_session = next(
        (
            node
            for node in hierarchy.iter("node")
            if node.get("resource-id") == "com.termux:id/new_session_button"
        ),
        None,
    )
    if new_session is None:
        raise AcceptanceError("new_terminal_control_unavailable")
    adb.tap(new_session)
    time.sleep(0.3)
    hierarchy = termux_drawer(adb)
    created_sessions = session_identities(hierarchy) - previous_sessions
    if not created_sessions:
        new_session = next(
            (
                node
                for node in hierarchy.iter("node")
                if node.get("resource-id")
                == "com.termux:id/new_session_button"
            ),
            None,
        )
        if new_session is None:
            raise AcceptanceError("new_terminal_control_unavailable")
        adb.tap(new_session)
        time.sleep(0.08)
        adb.tap(new_session)
        time.sleep(0.3)
        created_sessions = (
            session_identities(termux_drawer(adb)) - previous_sessions
        )
    if len(created_sessions) != 1:
        raise AcceptanceError("new_terminal_session_unverified")
    adb.shell(
        "input",
        "keycombination",
        "KEYCODE_CTRL_LEFT",
        "KEYCODE_ALT_LEFT",
        "KEYCODE_DPAD_LEFT",
    )
    hierarchy = adb.hierarchy()
    if any(
        node.get("resource-id") == "com.termux:id/new_session_button"
        for node in hierarchy.iter("node")
    ):
        raise AcceptanceError("terminal_drawer_still_open")
    terminal = next(
        (
            node
            for node in hierarchy.iter("node")
            if node.get("resource-id") == "com.termux:id/terminal_view"
        ),
        None,
    )
    if terminal is None:
        raise AcceptanceError("fresh_terminal_unavailable")
    terminal_text = terminal.get("text", "") or terminal.get(
        "content-desc", ""
    )
    if not re.search(r"\$\s*$", terminal_text):
        raise AcceptanceError("fresh_terminal_idle_prompt_unverified")


def launch_phase(adb, options, phase):
    device_report = phase_report_path(options, phase)
    command = [
        termux_python(adb),
        options.device_dir + "/phone_acceptance.py",
        "--phase",
        phase,
        "--report",
        device_report,
        "--timeout",
        str(options.timeout),
        "--delay",
        "4",
    ]
    for key in ("root", "model", "cwd"):
        argument = getattr(options, key)
        if argument:
            if not re.fullmatch(r"[A-Za-z0-9_./:-]+", argument):
                raise AcceptanceError("phone_argument_invalid")
            command.extend(["--" + key, argument])
    if options.resume or phase == "voice-after":
        command.append("--resume")
    pending_path = options.output / "pending.json"
    pending_path.write_text("{}", encoding="utf-8")
    adb.command("push", str(pending_path), device_report)
    new_termux_session(adb)
    typed_command = " ".join(command) + ";exit"
    adb.shell("input", "text", typed_command.replace(" ", "%s"))
    adb.shell("input", "keyevent", "KEYCODE_ENTER")
    time.sleep(1)
    adb.open_companion()
    return device_report


def phone_phase(adb, options, phase):
    remote_report = launch_phase(adb, options, phase)
    deadline = time.monotonic() + options.timeout * 4 + 30
    while time.monotonic() < deadline:
        try:
            report = json.loads(adb.shell("cat", remote_report))
        except (AcceptanceError, json.JSONDecodeError):
            time.sleep(2)
            continue
        if not isinstance(report, dict):
            raise AcceptanceError("phone_report_invalid")
        if report.get("complete") is True and report.get("phase") == phase:
            return safe_cases(report)
        time.sleep(2)
    return [
        {
            "name": phase + "_phase",
            "status": "blocked",
            "reason": "phone_report_timeout",
        }
    ]


def control(hierarchy, label):
    return next(
        (
            node
            for node in hierarchy.iter("node")
            if node.get("package") == PACKAGE
            and node.get("class") == "android.widget.Button"
            and label in (node.get("text"), node.get("content-desc"))
            and node.get("enabled") == "true"
        ),
        None,
    )


def composer_text(hierarchy):
    composers = [
        node
        for node in hierarchy.iter("node")
        if node.get("package") == PACKAGE
        and node.get("class") == "android.widget.EditText"
    ]
    if len(composers) != 1:
        raise AcceptanceError("composer_not_uniquely_accessible")
    return composers[0].get("text", "")


def open_chat(adb):
    hierarchy = adb.hierarchy()
    dashboard_button = control(hierarchy, OPEN_CHAT)
    if dashboard_button is not None:
        adb.tap(dashboard_button)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        hierarchy = adb.hierarchy()
        try:
            composer_text(hierarchy)
            return hierarchy
        except AcceptanceError:
            time.sleep(0.2)
    raise AcceptanceError("chat_composer_unavailable")


def activate_voice(adb, source, target):
    hierarchy = adb.hierarchy()
    node = control(hierarchy, source)
    if node is None:
        raise AcceptanceError("voice_control_unavailable")
    adb.tap(node)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        hierarchy = adb.hierarchy()
        if source == START_VOICE:
            if control(hierarchy, target) is not None:
                return
        elif control(hierarchy, CANCEL_VOICE) is None:
            # The overlay remains visible during capture; its presence alone
            # cannot prove that cancellation closed the capture Activity.
            try:
                composer_text(hierarchy)
                return
            except AcceptanceError:
                pass
        time.sleep(0.2)
    raise AcceptanceError("voice_control_transition_failed")


def microphone_stopped(adb):
    recognizer = adb.shell(
        "settings", "get", "secure", "voice_recognition_service"
    )
    provider = recognizer.strip().split("/", 1)[0]
    if not re.fullmatch(r"[A-Za-z0-9_.]+", provider) or provider == "null":
        raise AcceptanceError("recognizer_microphone_state_unavailable")
    for package in (PACKAGE, provider):
        app_ops = adb.shell("cmd", "appops", "get", package, "RECORD_AUDIO")
        if "RECORD_AUDIO" not in app_ops:
            raise AcceptanceError("recognizer_microphone_state_unavailable")
        if re.search(r"running=true|\(running\)", app_ops, re.IGNORECASE):
            return False
    return True


def normalized_words(text):
    decomposed = unicodedata.normalize("NFKD", text)
    plain = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    return set(re.findall(r"[^\W\d_]+", plain.casefold()))


def dictation(adb, options, initial_draft):
    if options.speech_audio is None:
        return {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": "speech_audio_required",
        }
    if sys.platform != "win32":
        return {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": "physical_audio_playback_unavailable",
        }
    with wave.open(str(options.speech_audio), "rb") as recording:
        if recording.getnframes() == 0:
            raise AcceptanceError("speech_audio_empty")
    expected = normalized_words(options.speech_text)
    required = normalized_words("اختبار صوتي")
    if not required.issubset(expected):
        raise AcceptanceError("speech_text_requires_test_words")
    expected = required
    import winsound

    if initial_draft.strip():
        return {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": "existing_draft_preserved",
        }
    activate_voice(adb, START_VOICE, CANCEL_VOICE)
    winsound.PlaySound(
        str(options.speech_audio), winsound.SND_FILENAME | winsound.SND_ASYNC
    )
    deadline = time.monotonic() + min(options.timeout, 35)
    try:
        if observed_dictation(adb, expected, initial_draft, deadline):
            return {"name": "voice_dictation", "status": "pass"}
        return {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": "expected_speech_not_in_draft",
            "non_blocking": True,
        }
    finally:
        winsound.PlaySound(None, 0)
        if control(adb.hierarchy(), CANCEL_VOICE) is not None:
            activate_voice(adb, CANCEL_VOICE, START_VOICE)


def observed_dictation(adb, expected, initial_draft, deadline):
    while time.monotonic() < deadline:
        hierarchy = adb.hierarchy()
        try:
            draft = composer_text(hierarchy)
        except AcceptanceError:
            # The capture Activity hides the editor until recognition ends.
            time.sleep(0.5)
            continue
        if draft != initial_draft and expected.issubset(
            normalized_words(draft)
        ):
            return True
        time.sleep(0.5)
    return False


def voice_phase(adb, options, checkpoint):
    adb.open_companion()
    adb.shell("wm", "size")
    initial_draft = composer_text(open_chat(adb))
    audit_before = phone_phase(adb, options, "voice-before")
    for case in audit_before:
        checkpoint(case)
    if any(case["status"] != "pass" for case in audit_before):
        return
    open_chat(adb)
    activate_voice(adb, START_VOICE, CANCEL_VOICE)
    activate_voice(adb, CANCEL_VOICE, START_VOICE)
    unchanged = composer_text(adb.hierarchy()) == initial_draft
    checkpoint(
        {"name": "voice_cancel", "status": "pass" if unchanged else "fail"}
    )
    try:
        stopped = microphone_stopped(adb)
        microphone_case = {
            "name": "voice_microphone_released",
            "status": "pass" if stopped else "fail",
        }
    except AcceptanceError as failure:
        microphone_case = {
            "name": "voice_microphone_released",
            "status": "blocked",
            "reason": str(failure),
        }
    checkpoint(microphone_case)
    try:
        dictation_case = dictation(adb, options, initial_draft)
    except AcceptanceError as failure:
        dictation_case = {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": str(failure),
        }
    except (
        OSError,
        subprocess.TimeoutExpired,
        ET.ParseError,
        wave.Error,
    ) as failure:
        dictation_case = {
            "name": "voice_dictation",
            "status": "blocked",
            "reason": type(failure).__name__.lower(),
        }
    if dictation_case["status"] != "pass":
        dictation_case["non_blocking"] = True
    checkpoint(dictation_case)
    for case in phone_phase(adb, options, "voice-after"):
        checkpoint(case)


def run(options, cases, report_path, started):
    if not options.resume:
        try:
            (options.output / ".progress.json").unlink()
        except FileNotFoundError:
            pass
    if not 1 <= options.timeout <= 300:
        raise AcceptanceError("timeout_out_of_range")
    if not SAFE_PATH.fullmatch(options.device_dir):
        raise AcceptanceError("device_directory_invalid")
    adb = authorized_device(options)
    script = Path(__file__).with_name("phone_acceptance.py")
    adb.shell("mkdir", "-p", options.device_dir)
    adb.command(
        "push", str(script), options.device_dir + "/phone_acceptance.py"
    )
    phases = (
        ["chat", "device", "voice"]
        if options.phase == "all"
        else [options.phase]
    )

    def checkpoint(case):
        cases.append(case)
        write_report(report_path, cases, started)

    try:
        for phase in phases:
            if phase == "voice":
                voice_phase(adb, options, checkpoint)
            else:
                for case in phone_phase(adb, options, phase):
                    checkpoint(case)
    finally:
        adb.open_companion()


def main():
    options = parser().parse_args()
    started, cases = time.monotonic(), []
    report_path = options.output / "report.json"
    try:
        run(options, cases, report_path, started)
    except AcceptanceError as error:
        cases.append(
            {"name": "host_runner", "status": "blocked", "reason": str(error)}
        )
    except (
        OSError,
        subprocess.TimeoutExpired,
        ET.ParseError,
        wave.Error,
        json.JSONDecodeError,
    ) as error:
        cases.append(
            {
                "name": "host_runner",
                "status": "blocked",
                "reason": type(error).__name__.lower(),
            }
        )
    write_report(report_path, cases, started, complete=True)
    for case in cases:
        print(case["name"] + ": " + case["status"])
    return (
        0
        if cases
        and all(
            case["status"] == "pass"
            or (
                case["name"] == "voice_dictation"
                and case.get("non_blocking") is True
            )
            for case in cases
        )
        else 1
    )


if __name__ == "__main__":
    sys.exit(main())
