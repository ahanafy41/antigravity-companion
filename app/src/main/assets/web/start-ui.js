(async function () {
function reportError(error) {
  announce('تعذر الفعل: ' + error.message);
}

        function announce(text) {
            const el = document.getElementById('live-announcer');
            if (el) {
                el.textContent = text;
            }
        }

        let serverReady = false;
        let statusRevision = 0;
        let serverBusy = false;
        const serverButton = document.getElementById('btn-wake-server');
        const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

        function showServerStatus(ready) {
            serverReady = ready;
            const status = document.getElementById('badge-server');
            status.className = 'status-box ' + (ready ? 'badge-active' : 'badge-inactive');
            status.textContent = 'خادم تيرمكس: ' + (ready ? 'نشط ومتصل' : 'متوقف');
            serverButton.id = ready ? 'btn-stop-server' : 'btn-wake-server';
            serverButton.textContent = ready ? 'إيقاف الخادم' : 'تشغيل الخادم';
            serverButton.className = 'btn ' + (ready ? 'btn-danger' : 'btn-success');
        }

        async function checkStatus() {
            const revision = ++statusRevision;
            const bridge = window.AntigravityBridge;
            try {
                const ready = bridge?.isTermuxServerReady
                    ? await bridge.isTermuxServerReady() === true
                    : await window.mainV1.healthy();
                if (revision !== statusRevision) return null;
                showServerStatus(ready);
                return ready;
            } catch (error) {
                if (revision !== statusRevision) return null;
                showServerStatus(false);
                return false;
            }
        }

        async function setupTermux() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.copySetupCommand === 'function') {
                await window.AntigravityBridge.copySetupCommand();
                announce('تم نسخ كود التجهيز في الحافظة بنجاح، جاري فتح Termux...');
                await pause(400);
                if (typeof window.AntigravityBridge.openTermuxApp === 'function') {
                    await window.AntigravityBridge.openTermuxApp();
                }
            } else {
                await navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/ahanafy41/antigravity-companion/main/setup.sh | bash');
                alert('تم نسخ كود التجهيز إلى الحافظة');
            }
        }

        async function changeServerState(start) {
            if (serverBusy) return false;
            if (start && !window.AntigravityBridge?.triggerServerWakeup) {
                announce('تشغيل الخادم متاح داخل التطبيق؛ شغّله عبر Termux ثم أعد فتح الصفحة.');
                return false;
            }
            serverBusy = true;
            ++statusRevision;
            serverButton.setAttribute('aria-disabled', 'true');
            announce(start ? 'جارٍ تشغيل خادم تيرمكس...' : 'جارٍ إيقاف خادم تيرمكس...');
            try {
                if (start) {
                    await window.AntigravityBridge.triggerServerWakeup();
                } else {
                    if (window.AntigravityBridge?.stopServer) {
                        try {
                            await window.AntigravityBridge.stopServer();
                        } catch (bridgeErr) {
                            console.warn('AntigravityBridge.stopServer failed, continuing with direct shutdown:', bridgeErr);
                        }
                    }
                    try {
                        await window.mainV1Fetch('/api/shutdown', {method: 'POST'});
                    } catch (fetchErr) {
                        // Server might already be stopped or unreachable
                    }
                    showServerStatus(false);
                }
                for (let attempt = 0; attempt < (start ? 15 : 8); attempt++) {
                    await pause(start ? 800 : 500);
                    if (await checkStatus() === start) {
                        announce(start ? 'خادم تيرمكس نشط ومتصل.' : 'خادم تيرمكس متوقف الآن.');
                        return true;
                    }
                }
                announce(start ? 'تعذر تشغيل الخادم تلقائياً. تأكد من تفعيل إذن تشغيل أوامر Termux من إعدادات التطبيق أو شغّله يدوياً من Termux.' : 'لم يتأكد إيقاف الخادم؛ أعد فتح الصفحة لفحص الحالة.');
                return false;
            } catch (error) {
                announce(error.message || 'حدث خطأ أثناء تنفيذ الأمر.');
                return false;
            } finally {
                serverBusy = false;
                serverButton.removeAttribute('aria-disabled');
            }
        }

        let isNavigatingToChat = false;
        async function goToChat() {
            if (isNavigatingToChat || serverBusy) return;
            isNavigatingToChat = true;
            try {
                let ready = await checkStatus();
                if (ready === null) return;
                if (!ready) ready = await changeServerState(true);
                if (!ready) return;
                announce('جارٍ فتح الشات والمحادثة...');
                if (window.AntigravityBridge?.loadChatUrl) {
                    await window.AntigravityBridge.loadChatUrl();
                } else {
                    window.location.href = '/';
                }
            } finally {
                isNavigatingToChat = false;
            }
        }

        let diagnosticsBusy = false;
        function showDiagnostics(result) {
            const labels = {
                termux_installed: 'تثبيت Termux',
                termux_run_command_permission: 'صلاحية تشغيل أوامر Termux',
                server_connectivity: 'اتصال خادم تيرمكس'
            };
            const checks = Array.isArray(result?.checks) ? result.checks : [];
            const values = Object.keys(labels).map(name => {
                const matches = checks.filter(item => item?.check === name);
                return matches.length === 1 && typeof matches[0].passed === 'boolean' ? matches[0].passed : null;
            });
            const complete = checks.length === 3 && values.every(value => value !== null);
            const issues = values.filter(value => value === false).length;
            const consistent = complete && result.issues_count === issues &&
                result.status === (issues ? 'NEEDS_ATTENTION' : 'HEALTHY');
            const lines = Object.values(labels).map((label, index) => label + ': ' +
                (values[index] === true ? 'سليم' : values[index] === false ? 'يحتاج إلى إصلاح' : 'تعذر التحقق'));
            const summary = !consistent ? 'تعذر التحقق من اكتمال التشخيص؛ أعد الفحص.' :
                issues ? 'اكتمل التشخيص؛ عدد الأعطال: ' + issues + '.' : 'اكتمل التشخيص؛ الفحوص الثلاثة سليمة.';
            const out = document.getElementById('diag-output');
            out.classList.remove('start-style-1');
            out.textContent = lines.join('\n') + '\n' + summary;
            announce(out.textContent);
        }

        async function runDiagnostics() {
            if (diagnosticsBusy) return;
            diagnosticsBusy = true;
            const button = document.getElementById('btn-run-diag');
            button.setAttribute('aria-disabled', 'true');
            announce('جارٍ فحص Termux واتصال الخادم...');
            try {
                if (!window.AntigravityBridge?.runDiagnostics) {
                    showDiagnostics(null);
                    return;
                }
                const outcome = await window.AntigravityBridge.runDiagnostics();
                let parsed = outcome;
                if (typeof outcome === 'string') {
                    try { parsed = JSON.parse(outcome); }
                    catch (error) { parsed = null; }
                }
                showDiagnostics(parsed);
            } catch (error) {
                showDiagnostics(null);
                throw error;
            } finally {
                diagnosticsBusy = false;
                button.removeAttribute('aria-disabled');
            }
        }

        async function checkAppUpdate() {
            announce('جاري التحقق من التحديثات...');
            const statusEl = document.getElementById('update-status');
            if (statusEl) statusEl.textContent = 'جاري الاتصال بخادم التحديثات...';

            if (window.AntigravityBridge && typeof window.AntigravityBridge.checkForUpdate === 'function') {
                await window.AntigravityBridge.checkForUpdate();
            } else {
                if (statusEl) statusEl.textContent = 'خاصية التحديث متاحة فقط داخل تطبيق الأندرويد.';
            }
        }

        window.onUpdateCheckResult = function(info) {
            const statusEl = document.getElementById('update-status');
            if (!info) { reportError(new Error('لم يصل جواب فحص الإصدار.')); return; }
            if (!(info.isUpdateAvailable || info.hasUpdate)) {
                if (statusEl) statusEl.textContent = 'أنت تستخدم أحدث إصدار بالفعل (' + (info ? info.currentVersion : '') + ')';
                announce('أنت تستخدم أحدث إصدار بالفعل.');
                return;
            }
            if (statusEl) {
                statusEl.replaceChildren();
                const label = document.createElement('strong');
                label.className = 'start-style-3';
                label.textContent = 'تحديث جديد متاح: ' + info.latestVersion;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-success start-style-4';
                button.textContent = 'تثبيت التحديث الآن';
                button.addEventListener('click', () => downloadUpdate(info.downloadUrl).catch(reportError));
                statusEl.append(label, document.createElement('br'), button);
            }
            announce('يوجد تحديث جديد متاح: ' + info.latestVersion);
        };

        window.onUpdateCheckError = function(err) {
            const statusEl = document.getElementById('update-status');
            if (statusEl) statusEl.textContent = 'تعذر التحقق من التحديث: ' + (err.error || err.message || String(err));
            announce('تعذر التحقق من التحديث.');
        };

        async function downloadUpdate(url) {
            announce('بدء تنزيل التحديث...');
            if (window.AntigravityBridge && typeof window.AntigravityBridge.startUpdateDownload === 'function') {
                try {
                    await window.AntigravityBridge.startUpdateDownload(url || '');
                } catch(e) {
                    await window.AntigravityBridge.startUpdateDownload();
                }
            }
        }

        window.onUpdateProgress = function(percent) {
            const statusEl = document.getElementById('update-status');
            if (statusEl) statusEl.textContent = 'جاري تنزيل التحديث: ' + percent + '%';
        };

        async function openAppSettings() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.openAppSettings === 'function') {
                await window.AntigravityBridge.openAppSettings();
            } else if (window.AntigravityBridge && typeof window.AntigravityBridge.openSettings === 'function') {
                await window.AntigravityBridge.openSettings();
            } else {
                announce('إعدادات التطبيق متاحة فقط داخل تطبيق Android.');
            }
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) checkStatus().catch(reportError);
        });
        window.addEventListener('focus', () => {
            checkStatus().catch(reportError);
        });

        setInterval(() => {
            if (!document.hidden && !serverBusy) {
                checkStatus().catch(reportError);
            }
        }, 4000);

        async function initializeDashboard() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.getAppVersion === 'function') {
                try {
                    const ver = await window.AntigravityBridge.getAppVersion();
                    if (ver) {
                        const lbl = document.getElementById('app-version-label');
                        if (lbl) lbl.textContent = 'Antigravity Companion v' + ver;
                    }
                } catch(e) {}
            }
            await checkStatus();
        }
        initializeDashboard().catch(reportError);

function bindSingleAction(id, action) {
    const button = document.getElementById(id);
    if (!button) return;
    let busy = false;
    button.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        button.setAttribute('aria-disabled', 'true');
        try { await action(); }
        catch (error) { reportError(error); }
        finally {
            busy = false;
            button.removeAttribute('aria-disabled');
        }
    });
}

document.getElementById("btn-go-chat").addEventListener("click", () => goToChat().catch(reportError));
serverButton.addEventListener("click", () => changeServerState(!serverReady).catch(reportError));
bindSingleAction("btn-setup-termux", setupTermux);
bindSingleAction("btn-app-settings", openAppSettings);
document.getElementById("btn-run-diag").addEventListener("click", () => runDiagnostics().catch(reportError));
bindSingleAction("btn-check-update", checkAppUpdate);

})().catch(error => {
  const status = document.getElementById('live-announcer');
  if (status) status.textContent = 'تعذر بدء لوحة التحكم: ' + error.message;
});
