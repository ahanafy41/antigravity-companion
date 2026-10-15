(async function () {
await window.mainV1.ready;
function reportError(error) {
  announce('تعذر الفعل: ' + error.message);
}

        function announce(text) {
            const el = document.getElementById('live-announcer');
            if (el) {
                el.textContent = text;
            }
        }

        async function checkStatus() {
            announce('جاري فحص حالة الخدمات...');
            const badgeA11y = document.getElementById('badge-a11y');
            const badgeWs = document.getElementById('badge-ws');
            const badgeServer = document.getElementById('badge-server');

            let a11yActive = false;
            let ws8765Ready = false;
            let py7681Ready = await window.mainV1.healthy();
            const bridge = window.AntigravityBridge;

            if (bridge) {
                if (typeof bridge.isAccessibilityActive === 'function') {
                    a11yActive = await bridge.isAccessibilityActive();
                }
                if (typeof bridge.isAutomationServerReady === 'function') {
                    ws8765Ready = await bridge.isAutomationServerReady();
                }
                if (typeof bridge.isTermuxServerReady === 'function') {
                    py7681Ready = await bridge.isTermuxServerReady();
                }
            }

            badgeA11y.className = 'status-badge ' + (a11yActive ? 'badge-active' : 'badge-inactive');
            badgeA11y.textContent = a11yActive ? 'مفعلة' : 'معطلة';

            badgeWs.className = 'status-badge ' + (ws8765Ready ? 'badge-active' : 'badge-inactive');
            badgeWs.textContent = ws8765Ready ? 'متصل' : 'غير متصل';

            badgeServer.className = 'status-badge ' + (py7681Ready ? 'badge-active' : 'badge-inactive');
            badgeServer.textContent = py7681Ready ? 'نشط وجاهز' : 'غير نشط (متوقف)';

            announce('حالة النظام: خدمة الوصول ' + (a11yActive ? 'مفعلة' : 'معطلة') +
                     '، وخادم الأتمتة ' + (ws8765Ready ? 'متصل' : 'غير متصل') +
                     '، وخادم تيرمكس ' + (py7681Ready ? 'نشط وجاهز' : 'متوقف'));
        }

        async function openA11ySettings() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.openSettings === 'function') {
                await window.AntigravityBridge.openSettings();
                announce('تم فتح إعدادات إمكانية الوصول');
            } else {
                alert('الجسر الأصلي غير متوفر');
            }
        }

        async function setupTermux() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.copySetupCommand === 'function') {
                await window.AntigravityBridge.copySetupCommand();
                announce('تم نسخ كود التجهيز في الحافظة بنجاح، جاري فتح Termux...');
                setTimeout(async function() {
                    if (typeof window.AntigravityBridge.openTermuxApp === 'function') {
                        await window.AntigravityBridge.openTermuxApp();
                    }
                }, 400);
            } else {
                await navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/ahanafy41/antigravity-companion/main/setup.sh | bash');
                alert('تم نسخ كود التجهيز إلى الحافظة');
            }
        }

        async function wakeServer() {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.triggerServerWakeup === 'function') {
                await window.AntigravityBridge.triggerServerWakeup();
                announce('تم إرسال أمر إيقاظ خادم تيرمكس في الخلفية');
                setTimeout(checkStatus, 2000);
            } else {
                announce('الجسر الأصلي غير متوفر لإيقاظ الخادم');
            }
        }

        async function stopServer() {
            if (!confirm('هل تريد إيقاف خادم تيرمكس نهائياً؟')) {
                return;
            }
            announce('جاري إيقاف خادم تيرمكس نهائياً...');
            const badgeServer = document.getElementById('badge-server');
            if (badgeServer) {
                badgeServer.className = 'status-badge badge-pending';
                badgeServer.textContent = 'جاري الإيقاف...';
            }
            const stopped = await window.mainV1Fetch('/api/shutdown', { method: 'POST' });
            if (!stopped.ok) { reportError(new Error((await stopped.json()).error)); return; }
            let attempts = 0;
            const pollInterval = setInterval(async function() {
                attempts++;
                let ready = true;
                if (window.AntigravityBridge && typeof window.AntigravityBridge.isTermuxServerReady === 'function') {
                    ready = await window.AntigravityBridge.isTermuxServerReady();
                } else {
                    ready = await window.mainV1.healthy();
                }
                if (!ready || attempts >= 8) {
                    clearInterval(pollInterval);
                    await checkStatus();
                    announce(!ready ? 'خادم تيرمكس متوقف الآن.' : 'لم يتأكد إيقاف الخادم؛ أعد فحص الحالة.');
                }
            }, 500);
        }

        let isNavigatingToChat = false;
        async function goToChat() {
            if (isNavigatingToChat) return;

            let bridgeAvailable = !!(window.AntigravityBridge);
            let py7681Ready = await window.mainV1.healthy();
            if (bridgeAvailable && typeof window.AntigravityBridge.isTermuxServerReady === 'function') {
                py7681Ready = await window.AntigravityBridge.isTermuxServerReady();
            }

            if (py7681Ready) {
                announce('جاري فتح واجهة الشات والمحادثة...');
                if (bridgeAvailable && typeof window.AntigravityBridge.loadChatUrl === 'function') {
                    await window.AntigravityBridge.loadChatUrl();
                } else {
                    window.location.href = '/';
                }
                return;
            }

            isNavigatingToChat = true;
            announce('خادم تيرمكس غير نشط حالياً. جاري تشغيله تلقائياً والانتظار ثوانٍ...');
            const badgeServer = document.getElementById('badge-server');
            if (badgeServer) {
                badgeServer.className = 'status-badge badge-pending';
                badgeServer.textContent = 'جاري البدء...';
            }

            if (bridgeAvailable && typeof window.AntigravityBridge.triggerServerWakeup === 'function') {
                await window.AntigravityBridge.triggerServerWakeup();
            }

            let attempts = 0;
            const maxAttempts = 15;
            const pollInterval = setInterval(async function() {
                attempts++;
                let readyNow = false;
                if (window.AntigravityBridge && typeof window.AntigravityBridge.isTermuxServerReady === 'function') {
                    readyNow = await window.AntigravityBridge.isTermuxServerReady();
                }

                if (readyNow) {
                    clearInterval(pollInterval);
                    isNavigatingToChat = false;
                    announce('تم تشغيل خادم تيرمكس بنجاح، جاري فتح الشات الآن...');
                    if (window.AntigravityBridge && typeof window.AntigravityBridge.loadChatUrl === 'function') {
                        await window.AntigravityBridge.loadChatUrl();
                    } else {
                        window.location.href = '/';
                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    isNavigatingToChat = false;
                    announce('استغرق تشغيل الخادم وقتاً أطول. يمكنك نسخ كود التجهيز أو تشغيله يدوياً عبر Termux.');
                    checkStatus();
                }
            }, 800);
        }

        async function runDiagnostics() {
            const out = document.getElementById('diag-output');
            announce('جاري تشغيل الفحص والتشخيص الشامل...');
            if (window.AntigravityBridge && typeof window.AntigravityBridge.runDiagnostics === 'function') {
                const jsonStr = await window.AntigravityBridge.runDiagnostics();
                try {
                    const parsed = JSON.parse(jsonStr);
                    out.style.display = 'block';
                    out.textContent = JSON.stringify(parsed, null, 2);
                    announce('اكتمل التشخيص. الحالة العامة: ' + (parsed.status || 'مكتمل'));
                } catch(e) {
                    out.style.display = 'block';
                    out.textContent = jsonStr;
                }
            } else {
                out.style.display = 'block';
                out.textContent = 'أداة التشخيص المدمجة غير متوفرة حالياً خارج التطبيق.';
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
                await window.AntigravityBridge.startUpdateDownload(url);
            }
        }

        window.onUpdateProgress = function(percent) {
            const statusEl = document.getElementById('update-status');
            if (statusEl) statusEl.textContent = 'جاري تنزيل التحديث: ' + percent + '%';
        };

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
            setTimeout(() => checkStatus().catch(reportError), 400);
        }
        initializeDashboard().catch(reportError);

document.getElementById("btn-refresh-status").addEventListener("click", () => checkStatus().catch(reportError));
document.getElementById("btn-go-chat").addEventListener("click", () => goToChat().catch(reportError));
document.getElementById("btn-wake-server").addEventListener("click", () => wakeServer().catch(reportError));
document.getElementById("btn-stop-server").addEventListener("click", () => stopServer().catch(reportError));
document.getElementById("btn-setup-termux").addEventListener("click", () => setupTermux().catch(reportError));
document.getElementById("btn-open-a11y").addEventListener("click", () => openA11ySettings().catch(reportError));
document.getElementById("btn-run-diag").addEventListener("click", () => runDiagnostics().catch(reportError));
document.getElementById("btn-check-update").addEventListener("click", () => checkAppUpdate().catch(reportError));

})().catch(error => {
  const status = document.getElementById('live-announcer');
  if (status) status.textContent = 'تعذر بدء لوحة التحكم: ' + error.message;
});
