/**
 * skills-plugins-manager.js - Skills & Plugins Management Engine for Antigravity Companion
 * Handles viewing, enabling, disabling AI skills and system plugins with TalkBack announcements.
 */

(function (root, factory) {
  const exportsObj = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (window) {
  'use strict';

  function escapeHtml(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  function playSuccessChime() {
    if (typeof window.playSuccessChime === 'function') {
      window.playSuccessChime();
    }
  }

  function playBeep(freq, dur) {
    if (typeof window.playBeep === 'function') {
      window.playBeep(freq, dur);
    }
  }

  function initSkillsPluginsManager() {
    const skillsDialog = document.getElementById('skills-dialog');
    const btnOpenSkills = document.getElementById('btn-open-skills');
    const btnCloseSkills = document.getElementById('btn-close-skills');
    const btnCloseSkillsTop = document.getElementById('btn-close-skills-top');
    const skillsListContainer = document.getElementById('skills-list-container');

    const pluginsDialog = document.getElementById('plugins-dialog');
    const btnOpenPlugins = document.getElementById('btn-open-plugins');
    const btnClosePlugins = document.getElementById('btn-close-plugins');
    const btnClosePluginsTop = document.getElementById('btn-close-plugins-top');
    const pluginsListContainer = document.getElementById('plugins-list-container');

    async function loadSkillsList() {
      if (!skillsListContainer) return;
      skillsListContainer.innerHTML = '<div class="main-style-176">جاري فحص المهارات...</div>';
      try {
        if (typeof window.mainV1Fetch !== 'function') return;
        const res = await window.mainV1Fetch('/api/skills/list');
        if (!res || !res.ok) throw new Error('فشل جلب المهارات');
        const data = await res.json();
        const skills = data.skills || [];
        if (skills.length === 0) {
          skillsListContainer.innerHTML = '<div class="main-style-176">لا توجد مهارات مثبتة في ~/.gemini/skills</div>';
          return;
        }

        skillsListContainer.innerHTML = '';
        skills.forEach(skill => {
          const card = document.createElement('div');
          card.style.cssText = 'background:var(--bg-card); border:1px solid ' + (skill.enabled ? 'var(--accent-green)' : 'var(--border-main)') + '; border-radius:8px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;';
          card.setAttribute('role', 'listitem');

          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'flex:1; min-width:0;';
          infoDiv.innerHTML = `
            <div class="main-style-191">
              <strong class="main-style-192">${escapeHtml(skill.name)}</strong>
              <span class="${(skill.enabled) ? "main-style-193" : "main-style-194"}">
                ${skill.enabled ? '🟢 مفعلة' : '⚪ معطلة'}
              </span>
            </div>
            <p class="main-style-195">
              ${escapeHtml(skill.description || 'مهارة مخصصة')}
            </p>
          `;

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'btn ' + (skill.enabled ? 'btn-danger' : 'btn-primary');
          toggleBtn.style.cssText = 'min-height:36px; padding:4px 14px; flex-shrink:0; font-size:0.88rem;';
          toggleBtn.setAttribute('aria-label', (skill.enabled ? 'تعطيل مهارة ' : 'تفعيل مهارة ') + skill.name);
          toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';

          toggleBtn.addEventListener('click', async () => {
            const nextState = !skill.enabled;
            toggleBtn.disabled = true;
            toggleBtn.textContent = '⏳ جاري...';
            try {
              const toggleRes = await window.mainV1Fetch('/api/skills/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: skill.id, enable: nextState })
              });
              if (toggleRes.ok) {
                playSuccessChime();
                const actMsg = nextState ? 'تم تفعيل مهارة ' : 'تم تعطيل مهارة ';
                announce(actMsg + skill.name);
                await loadSkillsList();
                if (typeof window.syncDynamicSlashCommandsGlobally === 'function') {
                  window.syncDynamicSlashCommandsGlobally();
                }
              } else {
                announce('تعذر تعديل حالة المهارة من الخادم');
                toggleBtn.disabled = false;
                toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';
              }
            } catch (err) {
              announce('حدث خطأ في الاتصال أثناء تعديل المهارة');
              toggleBtn.disabled = false;
              toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';
            }
          });

          card.appendChild(infoDiv);
          card.appendChild(toggleBtn);
          skillsListContainer.appendChild(card);
        });
      } catch (e) {
        console.error('Failed to load skills list:', e);
        skillsListContainer.innerHTML = '<div class="main-style-196">تعذر تحميل قائمة المهارات</div>';
        announce('تعذر تحميل قائمة المهارات');
      }
    }
    window.loadSkillsList = loadSkillsList;

    async function loadPluginsList() {
      if (!pluginsListContainer) return;
      pluginsListContainer.innerHTML = '<div class="main-style-176">جاري فحص الإضافات...</div>';
      try {
        if (typeof window.mainV1Fetch !== 'function') return;
        const res = await window.mainV1Fetch('/api/plugins/list');
        if (!res || !res.ok) throw new Error('فشل جلب الإضافات');
        const data = await res.json();
        const plugins = data.plugins || [];
        if (plugins.length === 0) {
          pluginsListContainer.innerHTML = '<div class="main-style-176">لا توجد إضافات مخصصة مثبتة في النظام</div>';
          return;
        }

        pluginsListContainer.innerHTML = '';
        plugins.forEach(plugin => {
          const card = document.createElement('div');
          card.style.cssText = 'background:var(--bg-card); border:1px solid ' + (plugin.enabled ? 'var(--accent-green)' : 'var(--border-main)') + '; border-radius:8px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;';
          card.setAttribute('role', 'listitem');

          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'flex:1; min-width:0;';

          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';

          const title = document.createElement('strong');
          title.style.cssText = 'color:var(--text-main); font-size:0.95rem;';
          title.textContent = plugin.name;

          const badge = document.createElement('span');
          badge.className = plugin.enabled ? 'main-style-193' : 'main-style-194';
          badge.textContent = plugin.enabled ? '🟢 مفعلة' : '⚪ معطلة';

          titleRow.appendChild(title);
          titleRow.appendChild(badge);

          const desc = document.createElement('div');
          desc.style.cssText = 'font-size:0.82rem; color:var(--text-muted); line-height:1.4;';
          desc.textContent = plugin.description || 'إضافة مخصصة لـ Antigravity';

          infoDiv.appendChild(titleRow);
          infoDiv.appendChild(desc);

          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'btn btn-sm ' + (plugin.enabled ? 'btn-secondary' : 'btn-primary');
          toggleBtn.style.cssText = 'min-width:85px; font-weight:700; flex-shrink:0;';
          toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
          toggleBtn.setAttribute('aria-label', (plugin.enabled ? 'تعطيل إضافة ' : 'تفعيل إضافة ') + plugin.name);

          toggleBtn.addEventListener('click', async () => {
            const nextState = !plugin.enabled;
            toggleBtn.disabled = true;
            toggleBtn.textContent = '⏳ جاري...';
            try {
              const toggleRes = await window.mainV1Fetch('/api/plugins/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: plugin.id, enabled: nextState })
              });
              if (toggleRes.ok) {
                playSuccessChime();
                const actMsg = nextState ? 'تم تفعيل إضافة ' : 'تم تعطيل إضافة ';
                announce(actMsg + plugin.name);
                await loadPluginsList();
              } else {
                playBeep(400, 0.2);
                announce('تعذر تعديل الإضافة من الخادم');
                toggleBtn.disabled = false;
                toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
              }
            } catch (err) {
              playBeep(400, 0.2);
              announce('حدث خطأ في الاتصال أثناء تعديل الإضافة');
              toggleBtn.disabled = false;
              toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
            }
          });

          card.appendChild(infoDiv);
          card.appendChild(toggleBtn);
          pluginsListContainer.appendChild(card);
        });
      } catch (e) {
        console.error('Failed to load plugins list:', e);
        pluginsListContainer.innerHTML = '<div class="main-style-196">تعذر تحميل قائمة الإضافات</div>';
        announce('تعذر تحميل قائمة الإضافات');
      }
    }
    window.loadPluginsList = loadPluginsList;

    if (btnOpenSkills && skillsDialog) {
      btnOpenSkills.addEventListener('click', async () => {
        skillsDialog.showModal();
        announce('تم فتح نافذة إدارة المهارات المثبتة');
        await loadSkillsList();
      });
    }
    if (btnCloseSkills && skillsDialog) {
      btnCloseSkills.addEventListener('click', () => skillsDialog.close());
    }
    if (btnCloseSkillsTop && skillsDialog) {
      btnCloseSkillsTop.addEventListener('click', () => skillsDialog.close());
    }

    if (btnOpenPlugins && pluginsDialog) {
      btnOpenPlugins.addEventListener('click', async () => {
        pluginsDialog.showModal();
        announce('تم فتح نافذة إدارة إضافات Antigravity');
        await loadPluginsList();
      });
    }
    if (btnClosePlugins && pluginsDialog) {
      btnClosePlugins.addEventListener('click', () => pluginsDialog.close());
    }
    if (btnClosePluginsTop && pluginsDialog) {
      btnClosePluginsTop.addEventListener('click', () => pluginsDialog.close());
    }
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSkillsPluginsManager);
    } else {
      initSkillsPluginsManager();
    }
  }

  return {
    loadSkillsList: window.loadSkillsList,
    loadPluginsList: window.loadPluginsList
  };
}));
