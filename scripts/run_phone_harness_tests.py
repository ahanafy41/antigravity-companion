"""Check lean dashboard navigation and named chat editor selection."""

from pathlib import Path
import runpy
import xml.etree.ElementTree as ET

runner = runpy.run_path(str(Path(__file__).with_name("run_phone_tests.py")))
PACKAGE = runner["PACKAGE"]


def hierarchy(*controls):
    root = ET.Element("hierarchy")
    for attributes in controls:
        ET.SubElement(
            root, "node", {"package": PACKAGE, "enabled": "true", **attributes}
        )
    return root


CHAT_BUTTON = {
    "class": "android.widget.Button",
    "text": runner["OPEN_CHAT"],
}
COMPOSER = {
    "class": "android.widget.EditText",
    "content-desc": "اكتب رسالتك",
    "text": "preserved draft",
    "enabled": "true",
    "focusable": "true",
}


class Device:
    """An XML device boundary with delayed WebView navigation."""

    def __init__(self):
        self.screen = "dashboard"
        self.polls = 0

    def hierarchy(self):
        if self.screen == "dashboard":
            return hierarchy(CHAT_BUTTON)
        self.polls += 1
        if self.polls == 1:
            return hierarchy()
        return hierarchy(
            {"class": "android.widget.EditText", "text": "search"}, COMPOSER
        )

    def tap(self, node):
        assert node.get("text") == CHAT_BUTTON["text"]
        self.screen = "chat"


def test_named_composer_ignores_other_editors():
    screen = hierarchy(
        {"class": "android.widget.EditText", "text": "search"}, COMPOSER
    )
    assert runner["composer_text"](screen) == "preserved draft"
    for controls in (
        (),
        ({**COMPOSER, "package": "other.app"},),
        ({**COMPOSER, "enabled": "false"},),
        ({**COMPOSER, "focusable": "false"},),
        (COMPOSER, COMPOSER),
    ):
        try:
            runner["composer_text"](hierarchy(*controls))
        except runner["AcceptanceError"]:
            continue
        raise AssertionError("Missing or ambiguous composer accepted")


def test_chat_navigation_waits_for_named_editor():
    device = Device()
    screen = runner["open_chat"](device)
    assert device.polls == 2
    assert runner["composer_text"](screen) == "preserved draft"
    assert (
        runner["control"](
            hierarchy({**CHAT_BUTTON, "package": "other.app"}),
            runner["OPEN_CHAT"],
        )
        is None
    )


def test_dashboard_requires_one_server_toggle():
    class DashboardDevice:
        def __init__(self, toggles):
            self.toggles = toggles

        def open_companion(self):
            pass

        def hierarchy(self):
            labels = [
                runner["OPEN_CHAT"],
                "فحص وإصلاح الأعطال",
                "فحص التحديثات",
                "تجهيز Termux لأول مرة",
                *self.toggles,
            ]
            return hierarchy(
                *(
                    {"class": "android.widget.Button", "text": label}
                    for label in labels
                )
            )

    for toggles, expected in (
        (["تشغيل الخادم"], "pass"),
        (["إيقاف الخادم"], "pass"),
        (["تشغيل الخادم", "تشغيل الخادم"], "fail"),
        (["إيقاف الخادم", "إيقاف الخادم"], "fail"),
        (["تشغيل الخادم", "إيقاف الخادم"], "fail"),
        ([], "fail"),
    ):
        cases = runner["dashboard_phase"](DashboardDevice(toggles))
        assert len(cases) == 5
        assert all(case["status"] == "pass" for case in cases[:4])
        assert cases[-1]["status"] == expected


def main():
    test_named_composer_ignores_other_editors()
    test_chat_navigation_waits_for_named_editor()
    test_dashboard_requires_one_server_toggle()
    print(
        "PASS lean phone harness: named focusable editor, delayed navigation, "
        "five dashboard actions"
    )


if __name__ == "__main__":
    main()
