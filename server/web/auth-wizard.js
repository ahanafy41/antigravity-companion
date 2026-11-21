/**
 * auth-wizard.js - Accessible Auth Wizard Controller for Antigravity Companion
 * Manages Google Account sign-in, OAuth verification codes, terms acceptance, and session badges.
 */

(function (root, factory) {
  const exportsObj = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (window) {
  'use strict';

  function announce(txt) {
    if (typeof window.announce === 'function') {
      window.announce(txt);
      return;
    }
    const ann = document.getElementById('sr-announcer');
    if (ann) {
      ann.textContent = '';
      setTimeout(() => { ann.textContent = txt; }, 50);
    }
  }

  function initAuthWizard() {
    const authWizardDialog = document.getElementById('auth-wizard-dialog');
    const btnOpenAuthWizard = document.getElementById('btn-open-auth-wizard');
    const btnHeaderAuth = document.getElementById('btn-header-auth');
    const headerAuthBadge = document.getElementById('header-auth-badge');
    const drawerAuthBadge = document.getElementById('drawer-auth-badge');
    const btnCloseAuthWizard = document.getElementById('btn-close-auth-wizard');
    const btnCloseAuthWizardTop = document.getElementById('btn-close-auth-wizard-top');

    const authCardBadge = document.getElementById('auth-card-badge');
    const authCardDesc = document.getElementById('auth-card-desc');
    const btnStartAuthWizard = document.getElementById('btn-start-auth-wizard');
    const btnAuthLogout = document.getElementById('btn-auth-logout');

    const authStepIdle = document.getElementById('auth-step-idle');
    const authStepCode = document.getElementById('auth-step-code');
    const authStepTerms = document.getElementById('auth-step-terms');
    const authStepLoading = document.getElementById('auth-step-loading');
    const authLoadingText = document.getElementById('auth-loading-text');

    const btnOpenGoogleLoginUrl = document.getElementById('btn-open-google-login-url');
    const authCodeInput = document.getElementById('auth-code-input');
    const btnSubmitAuthCode = document.getElementById('btn-submit-auth-code');
    const btnCancelAuthWizard = document.getElementById('btn-cancel-auth-wizard');
    const btnAcceptAuthTerms = document.getElementById('btn-accept-auth-terms');
    const btnDeclineAuthTerms = document.getElementById('btn-decline-auth-terms');

    let authPollTimer = null;

    function openAuthWizard() {
      if (!authWizardDialog) return;
      if (typeof authWizardDialog.showModal === 'function') {
        authWizardDialog.showModal();
      }
      announce('تم فتح نافذة حساب Google ومصادقة الوكيل');
      checkAuthStatus(false);
    }
    window.openAuthWizard = openAuthWizard;

    async function checkAuthStatus(silent) {
      try {
        if (typeof window.mainV1Fetch !== 'function') return null;
        const res = await window.mainV1Fetch('/api/auth/status');
        if (!res || !res.ok) return null;
        const data = await res.json();
        const auth = data.auth || {};
        const wizard = data.wizard || {};

        if (auth.authenticated === null) {
          if (headerAuthBadge) headerAuthBadge.textContent = 'الحساب لدى agy';
          if (drawerAuthBadge) drawerAuthBadge.textContent = 'حالة الحساب غير متاحة آليًا';
          if (btnHeaderAuth) btnHeaderAuth.setAttribute('aria-label', 'إدارة حساب agy في الطرفية الأصلية');
        } else if (auth.logged_in && auth.is_valid) {
          const emailDisplay = auth.email ? auth.email.split('@')[0] : 'متصل';
          try {
            if (auth.email) localStorage.setItem('antigravity_user_email', auth.email);
          } catch(e){}
          if (headerAuthBadge) headerAuthBadge.textContent = '👤 ' + emailDisplay;
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'متصل (' + (auth.email || '') + ')';
            drawerAuthBadge.style.color = '#10b981';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'حساب جوجل مسجل ونشط: ' + (auth.email || ''));
          }
        } else if (auth.logged_in && !auth.is_valid) {
          if (headerAuthBadge) headerAuthBadge.textContent = '⚠️ الجلسة منتهية';
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'منتهي الصلاحية';
            drawerAuthBadge.style.color = '#f59e0b';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'جلسة الحساب منتهية الصلاحية، اضغط لتجديد تسجيل الدخول');
          }
        } else {
          try {
            localStorage.removeItem('antigravity_user_email');
          } catch(e){}
          if (headerAuthBadge) headerAuthBadge.textContent = 'تسجيل الدخول';
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'غير مسجل';
            drawerAuthBadge.style.color = '#06b6d4';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'تسجيل الدخول بحساب Google');
          }
        }

        if (authWizardDialog && authWizardDialog.open) {
          updateAuthWizardUI(auth, wizard);
        }

        if (wizard.is_running && wizard.state !== 'SUCCESS' && wizard.state !== 'ERROR') {
          if (!authPollTimer) {
            authPollTimer = setInterval(() => checkAuthStatus(true), 1500);
          }
        } else {
          if (authPollTimer) {
            clearInterval(authPollTimer);
            authPollTimer = null;
          }
        }

        return data;
      } catch (err) {
        console.error('Error fetching auth status:', err);
        return null;
      }
    }
    window.checkAuthStatus = checkAuthStatus;

    function updateAuthWizardUI(auth, wizard) {
      if (!authCardBadge || !authCardDesc) return;
      if (auth.authenticated === null) {
        authCardBadge.textContent = 'الحساب لدى agy';
        authCardDesc.textContent = (wizard && wizard.message) || 'أتمّ إدارة الحساب في طرفية agy؛ حالته غير متاحة آليًا.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        return;
      }

      if (authStepIdle) authStepIdle.style.display = 'none';
      if (authStepCode) authStepCode.style.display = 'none';
      if (authStepTerms) authStepTerms.style.display = 'none';
      if (authStepLoading) authStepLoading.style.display = 'none';

      if (wizard && wizard.is_running) {
        if (wizard.state === 'STARTING') {
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = wizard.prompt_message || '⏳ جاري تهيئة جلسة تسجيل الدخول...';
          }
        } else if (wizard.state === 'WAITING_FOR_CODE') {
          if (authStepCode) {
            authStepCode.style.display = 'block';
            if (btnOpenGoogleLoginUrl) {
              if (wizard.auth_url) {
                btnOpenGoogleLoginUrl.href = wizard.auth_url;
                btnOpenGoogleLoginUrl.removeAttribute('aria-disabled');
                btnOpenGoogleLoginUrl.style.opacity = '1';
                btnOpenGoogleLoginUrl.style.pointerEvents = 'auto';
                btnOpenGoogleLoginUrl.textContent = 'فتح صفحة Google للمصادقة';
              } else {
                btnOpenGoogleLoginUrl.href = '#';
                btnOpenGoogleLoginUrl.setAttribute('aria-disabled', 'true');
                btnOpenGoogleLoginUrl.style.opacity = '0.6';
                btnOpenGoogleLoginUrl.style.pointerEvents = 'none';
                btnOpenGoogleLoginUrl.textContent = '⏳ جاري تحضير الرابط...';
              }
            }
          }
        } else if (wizard.state === 'WAITING_FOR_TERMS') {
          if (authStepTerms) {
            authStepTerms.style.display = 'block';
          }
        }
        authCardBadge.textContent = 'جاري المصادقة';
        authCardBadge.style.background = '#3b82f6';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = wizard.prompt_message || 'جلسة تسجيل الدخول قيد التنفيذ في الخلفية.';
        return;
      }

      if (auth.logged_in && auth.is_valid) {
        authCardBadge.textContent = 'نشط ومصرح';
        authCardBadge.style.background = '#10b981';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'تم تسجيل الدخول بنجاح بحساب: ' + (auth.email || 'معتمد') + (auth.expiry ? ' (تنتهي في: ' + auth.expiry.substring(0, 10) + ')' : '');
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تبديل الحساب أو إعادة التسجيل';
        if (btnAuthLogout) btnAuthLogout.style.display = 'inline-block';
      } else if (auth.logged_in && !auth.is_valid) {
        authCardBadge.textContent = 'الجلسة منتهية';
        authCardBadge.style.background = '#f59e0b';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'انتهت صلاحية جلسة الحساب (' + (auth.email || '') + '). يرجى إعادة تسجيل الدخول لتجديد التوكن.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تجديد تسجيل الدخول بحساب Google';
        if (btnAuthLogout) btnAuthLogout.style.display = 'inline-block';
      } else {
        authCardBadge.textContent = 'غير مسجل';
        authCardBadge.style.background = '#6b7280';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'لم يتم تسجيل أي حساب Google حتى الآن. اضغط على الزر أدناه لبدء التسجيل بسهولة.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تسجيل الدخول بحساب Google';
        if (btnAuthLogout) btnAuthLogout.style.display = 'none';
      }
    }
    window.updateAuthWizardUI = updateAuthWizardUI;

    if (btnOpenAuthWizard && authWizardDialog) {
      btnOpenAuthWizard.addEventListener('click', openAuthWizard);
    }
    if (btnHeaderAuth && authWizardDialog) {
      btnHeaderAuth.addEventListener('click', openAuthWizard);
    }
    if (btnCloseAuthWizard && authWizardDialog) {
      btnCloseAuthWizard.addEventListener('click', () => {
        if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
        authWizardDialog.close();
      });
    }
    if (btnCloseAuthWizardTop && authWizardDialog) {
      btnCloseAuthWizardTop.addEventListener('click', () => {
        if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
        authWizardDialog.close();
      });
    }

    if (btnOpenGoogleLoginUrl) {
      btnOpenGoogleLoginUrl.addEventListener('click', (e) => {
        e.preventDefault();
        const href = btnOpenGoogleLoginUrl.getAttribute('href');
        if (!href || href === '#' || href === 'javascript:void(0)') {
          announce('رابط تسجيل الدخول قيد التحضير، يرجى الانتظار ثوانٍ معدودة');
          return;
        }
        announce('جاري فتح صفحة تسجيل الدخول في متصفح الهاتف الخارجي');
        window.mainV1Fetch('/api/auth/open_browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: href })
        }).catch((err) => {
          console.error('Failed to trigger open_browser:', err);
        });
      });
    }

    if (btnStartAuthWizard) {
      btnStartAuthWizard.addEventListener('click', async () => {
        try {
          if (authStepIdle) authStepIdle.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري تهيئة رابط المصادقة من جوجل...';
          }
          if (btnOpenGoogleLoginUrl) {
            btnOpenGoogleLoginUrl.href = '#';
            btnOpenGoogleLoginUrl.setAttribute('aria-disabled', 'true');
            btnOpenGoogleLoginUrl.style.opacity = '0.6';
            btnOpenGoogleLoginUrl.style.pointerEvents = 'none';
            btnOpenGoogleLoginUrl.textContent = '⏳ جاري تحضير الرابط...';
          }
          announce('جاري بدء جلسة تسجيل الدخول');
          const response = await window.mainV1Fetch('/api/auth/start', { method: 'POST' });
          const handoff = await response.json();
          announce(handoff.message || handoff.error);
          if (authLoadingText) authLoadingText.textContent = handoff.message || handoff.error;
          checkAuthStatus(false);
        } catch (err) {
          announce('حدث خطأ أثناء بدء تسجيل الدخول');
          console.error(err);
        }
      });
    }

    if (btnSubmitAuthCode) {
      btnSubmitAuthCode.addEventListener('click', async () => {
        const code = (authCodeInput ? authCodeInput.value : '').trim();
        if (!code) {
          announce('يرجى إدخال أو لصق كود المصادقة أولاً');
          if (authCodeInput) authCodeInput.focus();
          return;
        }
        try {
          if (authStepCode) authStepCode.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري إرسال الكود والتحقق من التراخيص...';
          }
          announce('جاري التحقق من الكود وتفعيل الترخيص');
          await window.mainV1Fetch('/api/auth/input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
          });
          if (authCodeInput) authCodeInput.value = '';
          checkAuthStatus(false);
        } catch (err) {
          announce('فشل إرسال كود المصادقة');
          console.error(err);
        }
      });
    }

    if (btnAcceptAuthTerms) {
      btnAcceptAuthTerms.addEventListener('click', async () => {
        try {
          if (authStepTerms) authStepTerms.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري اعتماد الموافقة على شروط الترخيص...';
          }
          announce('تم إرسال الموافقة على اتفاقية الترخيص');
          await window.mainV1Fetch('/api/auth/accept_terms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: true })
          });
          checkAuthStatus(false);
        } catch (err) {
          announce('فشل إرسال الموافقة على الشروط');
          console.error(err);
        }
      });
    }

    if (btnDeclineAuthTerms) {
      btnDeclineAuthTerms.addEventListener('click', async () => {
        try {
          announce('تم رفض الشروط وإلغاء العملية');
          await window.mainV1Fetch('/api/auth/accept_terms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: false })
          });
          checkAuthStatus(false);
        } catch (err) {
          console.error(err);
        }
      });
    }

    if (btnCancelAuthWizard) {
      btnCancelAuthWizard.addEventListener('click', async () => {
        try {
          announce('تم إلغاء عملية تسجيل الدخول');
          await window.mainV1Fetch('/api/auth/cancel', { method: 'POST' });
          checkAuthStatus(false);
        } catch (err) {
          console.error(err);
        }
      });
    }

    if (btnAuthLogout) {
      btnAuthLogout.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من رغبتك في تسجيل الخروج ومسح بيانات الجلسة؟')) {
          return;
        }
        try {
          announce('جاري تسجيل الخروج ومسح الجلسة');
          const res = await window.mainV1Fetch('/api/auth/logout', { method: 'POST' });
          const data = await res.json();
          announce(data.message || data.error || 'لم تتأكد نتيجة الخروج.');
          checkAuthStatus(false);
          if (typeof window.loadQuotaData === 'function') {
            window.loadQuotaData(true);
          }
        } catch (err) {
          announce('فشل تسجيل الخروج');
          console.error(err);
        }
      });
    }

    // Auto check status on boot
    checkAuthStatus(true);
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAuthWizard);
    } else {
      initAuthWizard();
    }
  }

  return {
    initAuthWizard,
    openAuthWizard: window.openAuthWizard,
    checkAuthStatus: window.checkAuthStatus,
    updateAuthWizardUI: window.updateAuthWizardUI
  };
}));
