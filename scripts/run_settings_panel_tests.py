"""Focused browser checks for labeled settings and permission drafts."""

import argparse
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def run_tests():
    web_root = Path(__file__).resolve().parents[1] / "server" / "web"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=os.environ.get("COMPANION_BROWSER_EXECUTABLE"),
        )
        try:
            page = browser.new_page()
            page.set_default_timeout(5000)
            page.set_content("""<dialog id="menu-dialog"></dialog>
<dialog id="panel-dialog"><h2 id="panel-title"></h2>
<p id="panel-description"></p><div id="panel-content"></div></dialog>
<p id="notice" role="alert"></p><p id="announcer" aria-live="polite"></p>""")
            page.evaluate("""() => {
              window.crypto.randomUUID = () => "fixture-" + Math.random();
              window.requests = [];
              window.savedSettings = {cwd:'.', sound:false, haptics:false,
                custom:{preserve:true},
                permissions:{allow:['unchanged']}};
              window.savedPolicy = {allow:['command(git)'],
                deny:['write(*)'], ask:[]};
              window.Companion = {state:{}, app:{sessionOptions:{},
                newChat:async()=>{},
                refreshSuggestions:async()=>{
                  const app = window.Companion.app;
                  const cwd = app.sessionOptions.cwd ||
                    window.Companion.state.settings.cwd || '.';
                  await window.Companion.api.request(
                    '/skills?cwd=' + encodeURIComponent(cwd));
                }},
                allowed:()=>true,
                api:{request:async(route, options={})=>{
                  window.requests.push({route,...options});
                  if (route === '/models') return {models:[{id:'one'}]};
                  if (route.startsWith('/files?')) return {
                    path:'.',entries:[{name:'report final.md',
                      path:'./report final.md',is_dir:false}]};
                  if (route.startsWith('/file?')) return {
                    path:window.filePath || './report final.md',
                    content:'text'};
                  if (route === '/settings') {
                    if (options.method === 'PATCH') {
                      Object.assign(window.savedSettings,
                        options.body.settings);
                    }
                    return {settings:structuredClone(window.savedSettings),
                      revision:7};
                  }
                  if (route === '/cli/policy') {
                    if (options.method === 'PATCH') {
                      window.savedPolicy = options.body.permissions;
                    }
                    return {permissions:structuredClone(window.savedPolicy),
                      revision:'policy-rev'};
                  }
                }}};
            }""")
            page.add_script_tag(path=str(web_root / "ui.js"))
            page.add_script_tag(path=str(web_root / "panels.js"))
            page.evaluate("Companion.panels.open('settings')")
            assert (
                page.locator("textarea").count() == 0
            ), "settings/policy must use native controls"
            unlabeled = page.locator("input,select").evaluate_all(
                "controls=>controls.filter(c=>!c.labels.length).length"
            )
            assert unlabeled == 0
            page.get_by_label("مجلد العمل الافتراضي", exact=True).focus()
            page.keyboard.press("Tab")
            assert page.get_by_label("النموذج الافتراضي", exact=True).evaluate(
                "field=>field===document.activeElement"
            )
            page.get_by_role("checkbox", name="نغمة انتهاء الرد").check()
            page.get_by_role(
                "button", name="حفظ الإعدادات", exact=True
            ).click()
            page.wait_for_function("requests.some(r=>r.method==='PATCH')")
            patch = page.evaluate(
                "requests.find(r=>r.route==='/settings'&&r.method==='PATCH')"
            )
            assert patch["body"]["settings"] == {"sound": True}, patch
            assert patch["headers"]["If-Match"] == "7"
            page.evaluate("Companion.panels.open('settings')")
            page.get_by_role("button", name="إضافة قاعدة", exact=True).click()
            page.get_by_label("القاعدة 3", exact=True).fill("read(project/*)")
            page.get_by_label("حكم القاعدة 3", exact=True).select_option("ask")
            page.get_by_role("button", name="حفظ أذون agy", exact=True).click()
            page.wait_for_function(
                "requests.some(r=>r.route==='/cli/policy'&&r.method==='PATCH')"
            )
            policy = page.evaluate(
                "requests.find(r=>r.route==='/cli/policy'"
                "&&r.method==='PATCH').body"
            )
            assert policy["permissions"] == {
                "allow": ["command(git)"],
                "deny": ["write(*)"],
                "ask": ["read(project/*)"],
            }
            assert policy["revision"] == "policy-rev"
            page.get_by_label("القاعدة 3", exact=True).fill("   ")
            before = page.evaluate("requests.length")
            page.get_by_role("button", name="حفظ أذون agy", exact=True).click()
            page.wait_for_function(
                "document.getElementById('notice').textContent.length>0"
            )
            assert page.evaluate("requests.length") == before
            assert (
                page.get_by_label("القاعدة 3", exact=True).get_attribute(
                    "aria-invalid"
                )
                == "true"
            )
            page.get_by_role(
                "button", name="حذف القاعدة 3", exact=True
            ).click()
            page.get_by_role("button", name="حفظ أذون agy", exact=True).click()
            page.wait_for_function(
                "requests.filter(r=>r.route==='/cli/policy'"
                "&&r.method==='PATCH').length===2"
            )
            assert page.evaluate("savedSettings.custom.preserve") is True
            page.evaluate("""() => {
              const prompt = document.createElement('textarea');
              prompt.id = 'prompt';
              document.body.append(prompt);
            }""")
            for path, expected in [
                ("./report final.md", '@"./report final.md" '),
                ("./report.md", "@./report.md "),
            ]:
                page.evaluate("path=>window.filePath=path", path)
                page.evaluate("document.getElementById('prompt').value=''")
                page.evaluate("Companion.panels.open('files')")
                page.get_by_role(
                    "button", name="ملف: report final.md", exact=True
                ).click()
                page.get_by_role(
                    "button", name="إدراج مسار الملف في الرسالة", exact=True
                ).click()
                assert page.locator("#prompt").input_value() == expected
            page.evaluate("path=>window.filePath=path", './bad"name.md')
            page.evaluate("document.getElementById('notice').textContent=''")
            page.evaluate("Companion.panels.open('files')")
            page.get_by_role(
                "button", name="ملف: report final.md", exact=True
            ).click()
            page.get_by_role(
                "button", name="إدراج مسار الملف في الرسالة", exact=True
            ).click()
            page.wait_for_function(
                "document.getElementById('notice').textContent.length>0"
            )
            assert page.locator("#prompt").input_value() == "@./report.md "
            page.evaluate("Companion.panels.open('settings')")
            page.get_by_label("مجلد العمل الافتراضي", exact=True).fill("work")
            page.get_by_role(
                "button", name="حفظ الإعدادات", exact=True
            ).click()
            page.wait_for_function(
                "requests.some(r=>r.route==='/skills?cwd=work')"
            )
            page.evaluate("""() => {
              const label = document.createElement('span');
              label.id = 'active-model'; document.body.append(label);
            }""")
            page.evaluate("Companion.panels.open('models')")
            page.get_by_label("مجلد العمل", exact=True).fill("chosen")
            page.get_by_role(
                "button", name="اعتماد الاختيار لمحادثة جديدة", exact=True
            ).click()
            page.wait_for_function(
                "requests.some(r=>r.route==='/skills?cwd=chosen')"
            )
            before = page.evaluate(
                "requests.filter(r=>r.route.startsWith('/skills?')).length"
            )
            page.evaluate("Companion.panels.open('settings')")
            page.get_by_label("مجلد العمل الافتراضي", exact=True).fill("other")
            page.get_by_role(
                "button", name="حفظ الإعدادات", exact=True
            ).click()
            page.wait_for_function("savedSettings.cwd==='other'")
            assert (
                page.evaluate(
                    "requests.filter(r=>r.route.startsWith('/skills?')).length"
                )
                == before
            )
            print("Settings, policy, file draft and cwd checks passed")
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    run_tests()


if __name__ == "__main__":
    main()
