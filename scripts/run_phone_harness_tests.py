"""Check phone harness accessibility selection and capture cancellation."""

from pathlib import Path
import runpy
import time
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


OVERLAY = {
    "class": "android.widget.Button",
    "text": "إملاء",
    "content-desc": "إملاء رسالة للمساعد",
}
CANCEL = {"class": "android.widget.Button", "text": "إلغاء الإملاء"}
COMPOSER = {"class": "android.widget.EditText", "text": "preserved draft"}
DASHBOARD = {
    "class": "android.widget.Button",
    "text": "الانتقال لواجهة الشات والمحادثة",
}


class Device:
    def __init__(self):
        self.screen = "dashboard"
        self.cancel_pending = False
        self.capture_polls = 0

    def hierarchy(self):
        if self.screen == "dashboard":
            return hierarchy(OVERLAY, DASHBOARD)
        if self.screen == "capture":
            if self.cancel_pending:
                self.capture_polls += 1
                if self.capture_polls == 2:
                    self.screen = "chat"
                    return hierarchy(OVERLAY, COMPOSER)
            return hierarchy(OVERLAY, CANCEL)
        return hierarchy(OVERLAY, COMPOSER)

    def tap(self, node):
        if node.get("text") == DASHBOARD["text"]:
            self.screen = "chat"
        elif node.get("content-desc") == OVERLAY["content-desc"]:
            self.screen = "capture"
        elif node.get("text") == CANCEL["text"]:
            self.cancel_pending = True
        else:
            raise AssertionError("Unexpected control")


def main():
    device = Device()
    chat = runner["open_chat"](device)
    assert runner["composer_text"](chat) == "preserved draft"
    assert runner["control"](chat, runner["START_VOICE"]) is not None
    impostor = hierarchy({**OVERLAY, "package": "other.app"})
    assert runner["control"](impostor, runner["START_VOICE"]) is None
    runner["activate_voice"](
        device, runner["START_VOICE"], runner["CANCEL_VOICE"]
    )
    assert device.screen == "capture"
    runner["activate_voice"](
        device, runner["CANCEL_VOICE"], runner["START_VOICE"]
    )
    assert device.capture_polls == 2
    assert runner["composer_text"](device.hierarchy()) == "preserved draft"

    class RecognizingDevice:
        def __init__(self):
            self.polls = 0

        def hierarchy(self):
            self.polls += 1
            if self.polls == 1:
                return hierarchy(OVERLAY, CANCEL)
            return hierarchy(OVERLAY, {**COMPOSER, "text": "اختبار صوتي"})

    recognizing = RecognizingDevice()
    assert runner["observed_dictation"](
        recognizing, {"اختبار", "صوتي"}, "", time.monotonic() + 2
    )
    assert recognizing.polls == 2
    print(
        "PASS phone harness: public accessibility name, dashboard navigation, "
        "capture cancellation wait, preserved draft"
    )


if __name__ == "__main__":
    main()
