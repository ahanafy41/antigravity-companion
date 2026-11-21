/**
 * Antigravity Companion App - Dynamic Schema-Driven Settings & Realtime Live Sync Engine
 * Clean Architecture Modular Engine
 *
 * Provides dynamic schema generation, settings normalization, realtime dirty tracking,
 * optimistic live synchronization, conflict resolution (409), and full screen-reader support.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SettingsEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

    class DynamicSettingsEngine {
      constructor(options) {
        this.opts = options || {};
        const doc = this.opts.document || (typeof document !== 'undefined' ? document : null);
        this.doc = doc;
        this.dialog = doc ? doc.getElementById('settings-dialog') : null;
        this.form = doc ? doc.getElementById('dynamic-settings-form') : null;
        this.fieldsContainer = doc ? doc.getElementById('dynamic-settings-fields') : null;
        this.skeleton = doc ? doc.getElementById('dynamic-settings-skeleton') : null;
        this.syncBadge = doc ? doc.getElementById('settings-sync-badge') : null;
        this.btnSave = doc ? doc.getElementById('btn-save-settings') : null;
        this.btnReset = doc ? doc.getElementById('btn-reset-settings') : null;
        this.btnClose = doc ? doc.getElementById('btn-close-dialog') : null;
        this.btnCloseTop = doc ? doc.getElementById('btn-close-dialog-top') : null;

        this.announce = this.opts.announce || (typeof announce === 'function' ? announce : function(m) { if (typeof console !== 'undefined') console.log('[Announce]', m); });
        this.playSuccessChime = this.opts.playSuccessChime || (typeof playSuccessChime === 'function' ? playSuccessChime : function() {});
        this.fetchApi = this.opts.fetchApi || (typeof window !== 'undefined' && this.fetchApi ? this.fetchApi : (typeof fetch !== 'undefined' ? fetch : null));
        this.syncActiveModelDisplay = this.opts.syncActiveModelDisplay || (typeof syncActiveModelDisplay === 'function' ? syncActiveModelDisplay : function() {});
        this.syncReasoningEffortDisplay = this.opts.syncReasoningEffortDisplay || (typeof syncReasoningEffortDisplay === 'function' ? syncReasoningEffortDisplay : function() {});

        this.state = {};
        this.initialState = {};
        this.baseline = null;
        this.saveRequest = null;
        this.remoteRequest = null;
        this.remoteGeneration = 0;
        this.models = [];
        this.agents = [];
        this.dirtyFields = new Set();
        this.broadcast = null;
        this.syncPollInterval = null;

        this.initBroadcast();
        this.bindEvents();
      }

      initBroadcast() {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          this.broadcast = window.mainV1?.settingsBroadcast;
          if (!this.broadcast) return;
          this.broadcast.onmessage = (e) => {
            if (e.data && e.data.type === 'SETTINGS_UPDATED') {
              this.handleExternalSync();
            }
          };
        }
      }

      getSchema() {
        return [
          {
            section: 'general',
            legend: 'إعدادات النموذج',
            fields: [
              {
                id: 'field-model',
                key: 'model',
                type: 'select_models',
                label: 'النموذج النشط',
                hint: 'نموذج الذكاء الاصطناعي المستخدم للجلسة.',
                default: ''
              },
              {
                id: 'field-agent', key: 'agent', type: 'select', label: 'الوكيل النشط',
                hint: 'وكيل من قائمة CLI الفعلية.',
                options: [{value: '', label: 'الوكيل الافتراضي'}, ...this.agents.map(a => ({value: a.id || a.name, label: a.name || a.id}))]
              },
              {
                id: 'field-mode',
                key: 'mode',
                type: 'select',
                label: 'نمط التنفيذ',
                hint: 'تنفيذ الأوامر مباشرة أو تخطيط مسبق.',
                options: [
                  { value: 'accept-edits', label: 'تنفيذ مباشر (accept-edits)' },
                  { value: 'plan', label: 'تخطيط مسبق (plan)' }
                ],
                default: 'accept-edits'
              },
              {
                id: 'field-effort',
                key: 'effort',
                type: 'select',
                label: 'مستوى التفكير',
                hint: 'عمق التفكير للنماذج الداعمة.',
                options: [
                  { value: 'medium', label: 'متوسط (افتراضي)' },
                  { value: 'low', label: 'منخفض (إجابات سريعة)' },
                  { value: 'high', label: 'عميق (مهام معقدة)' },
                  { value: 'xhigh', label: 'أعمق (xhigh)' },
                  { value: 'max', label: 'أقصى عمق' }
                ],
                default: 'medium'
              }
            ]
          },
          {
            section: 'sandbox_permissions',
            legend: 'الأمان والصلاحيات',
            fields: [
              {
                id: 'field-autopilot',
                key: 'autopilot',
                type: 'switch',
                label: 'الطيار الآلي',
                hint: 'تشغيل الأدوات المعتمدة بدون طلب تأكيد لكل خطوة.',
                colorBorder: 'var(--accent-cyan)',
                default: true
              },
              {
                id: 'field-sandbox',
                key: 'sandbox',
                type: 'switch',
                label: 'عزل الطرفية (Sandbox)',
                hint: 'تشغيل الأوامر داخل بيئة معزولة.',
                colorBorder: 'var(--accent-red)',
                default: false
              },
              {
                id: 'field-allow-non-workspace',
                key: 'allowNonWorkspaceAccess',
                type: 'switch',
                label: 'الوصول خارج المجلد',
                hint: 'السماح بفحص الملفات خارج مجلد العمل الحالي.',
                colorBorder: 'var(--accent-purple)',
                default: true
              },
              {
                id: 'field-perm-commands',
                key: 'allow_commands',
                type: 'switch',
                label: 'تشغيل الأوامر (Terminal)',
                hint: 'السماح بتنفيذ أوامر التيرمنال.',
                colorBorder: 'var(--accent-green)',
                default: true
              },
              {
                id: 'field-perm-file-write',
                key: 'allow_write',
                type: 'switch',
                label: 'تعديل الملفات',
                hint: 'السماح بإنشاء وتعديل الملفات.',
                colorBorder: '#58a6ff',
                default: true
              },
              {
                id: 'field-perm-web-access',
                key: 'allow_web',
                type: 'switch',
                label: 'تصفح الويب',
                hint: 'السماح بالبحث وقراءة صفحات الإنترنت.',
                colorBorder: 'var(--accent-cyan)',
                default: true
              },
              {
                id: 'field-perm-subagents',
                key: 'allow_subagent',
                type: 'switch',
                label: 'الوكلاء الفرعيون',
                hint: 'السماح بتشغيل وكلاء في الخلفية.',
                colorBorder: 'var(--accent-purple)',
                default: true
              },
              {
                id: 'field-perm-schedule',
                key: 'allow_schedule',
                type: 'switch',
                label: 'المؤقتات والمهام المجدولة',
                hint: 'السماح بجدولة المؤقتات ومهام الخلفية.',
                colorBorder: 'var(--accent-red)',
                default: false
              },
              {
                id: 'field-whitelist-rules',
                type: 'whitelist_manager',
                label: 'الأوامر المصرح بها دائماً'
              }
            ]
          },
          {
            section: 'trusted_workspaces',
            legend: 'مجلدات العمل الموثوقة',
            fields: [
              {
                id: 'field-trusted-workspaces',
                key: 'trustedWorkspaces',
                type: 'array_chips',
                label: 'مجلدات العمل',
                hint: 'المسارات المصرح للوكيل بالعمل داخلها.',
                default: []
              }
            ]
          },
          {
            section: 'accessibility_feedback',
            legend: 'إمكانية الوصول والتنبيهات',
            fields: [
              {
                id: 'field-voice-tones',
                key: 'tones_enabled',
                type: 'switch',
                label: 'نغمات التنبيه التفاعلية',
                hint: 'تشغيل نغمة صوتية عند بدء وانتهاء تنفيذ الأوامر.',
                default: true
              },
              {
                id: 'field-voice-haptic',
                key: 'haptic_enabled',
                type: 'switch',
                label: 'الاهتزاز اللمسي',
                hint: 'اهتزاز خفيف لتأكيد الإجراءات على الهواتف الداعمة.',
                default: true
              },
              {
                id: 'field-voice-speech',
                key: 'speech_enabled',
                type: 'switch',
                label: 'النطق الصوتي للمتصفح (Speech)',
                hint: 'قراءة الردود صوتياً بمحرك المتصفح. ⚠️ يُفضل إيقافه إن كنت تستخدم TalkBack أو Jieshuo.',
                default: false
              },

            ]
          },
          {
            section: 'system_resources',
            legend: 'استهلاك النظام والتحديثات',
            fields: [
              {
                id: 'field-quota-metric',
                type: 'resource_summary',
                label: 'استهلاك الموارد'
              },
              {
                id: 'field-system-update',
                type: 'system_update',
                label: 'تحديث Antigravity CLI'
              }
            ]
          }
        ];
      }

      async fetchRemoteData(discardDraft = false) {
        if (this.remoteRequest) return this.remoteRequest;
        this.setSyncStatus('syncing', 'Syncing...');
        const generation = this.remoteGeneration;
        const pending = (async () => {
          const responses = await Promise.allSettled([
            this.fetchApi('/api/ai/models'), this.fetchApi('/api/ai/settings'),
            this.fetchApi('/api/ai/agents')
          ]);
          const [modelsRes, settingsRes, agentsRes] = responses.map(response => response.status === 'fulfilled' ? response.value : null);
          const readCatalog = async (response, key) => {
            if (!response?.ok) throw new Error('تعذر جلب القائمة');
            const listing = await response.json();
            const entries = key ? listing?.[key] : listing;
            if (!Array.isArray(entries)) throw new Error('قائمة غير صالحة');
            return entries;
          };
          const catalogs = await Promise.allSettled([readCatalog(modelsRes), readCatalog(agentsRes, 'agents')]);
          if (!settingsRes?.ok) throw new Error('تعذر جلب الإعدادات');
          const raw = await settingsRes.json();
          if (generation !== this.remoteGeneration) return false;
          if (catalogs[0].status === 'fulfilled') {
            this.models = catalogs[0].value;
            if (Array.isArray(catalogs[0].value) && catalogs[0].value.length > 0) {
              if (typeof window !== 'undefined') window._cachedModels = catalogs[0].value;
            }
          }
          if (catalogs[1].status === 'fulfilled') this.agents = catalogs[1].value;
          const normalized = this.normalizeSettings(raw);
          if (discardDraft) this.dirtyFields.clear();
          if (discardDraft || (!this.dirtyFields.size && !this.saveRequest)) {
            this.initialState = JSON.parse(JSON.stringify(normalized));
            this.baseline = {revision: settingsRes.headers.get('X-Settings-Revision'),
              policyRevision: settingsRes.headers.get('X-Policy-Revision'), permissions: raw.permissions};
          }
          Object.keys(normalized).forEach(key => {
            if (!this.dirtyFields.has(key)) this.state[key] = normalized[key];
          });
          this.setSyncStatus(this.dirtyFields.size ? 'idle' : 'saved', this.dirtyFields.size ? 'تغييرات لم تُحفظ' : '● Live Synced');
          if (typeof this.syncActiveModelDisplay === 'function' && this.state.model) this.syncActiveModelDisplay(this.state.model);
          if (typeof this.syncReasoningEffortDisplay === 'function' && this.state.effort) this.syncReasoningEffortDisplay(this.state.effort);
          return true;
        })().catch(err => {
          if (generation !== this.remoteGeneration) return false;
          console.error('Failed fetching settings schema:', err);
          this.setSyncStatus('idle', this.dirtyFields.size ? 'تعذر الاتصال؛ تغييرات لم تُحفظ' : 'Offline / Cache');
          return false;
        }).finally(() => { if (this.remoteRequest === pending) this.remoteRequest = null; });
        this.remoteRequest = pending;
        return pending;
      }

      normalizeSettings(raw) {
        const perms = raw.permissions?.allow || [];
        const isSafe = raw.safe_mode !== undefined ? !!raw.safe_mode : (raw.autopilot !== undefined ? !raw.autopilot : true);
        return {
          model: raw.model || '',
          agent: raw.agent || '',
          allow_schedule: raw.allow_schedule !== undefined ? !!raw.allow_schedule : (perms.includes('schedule') || perms.includes('schedule(*)')),
          effort: raw.effort || 'medium',
          autopilot: raw.autopilot !== undefined ? !!raw.autopilot : !isSafe,
          safe_mode: isSafe,
          allow_commands: raw.allow_commands !== undefined ? !!raw.allow_commands : (perms.includes('command') || perms.includes('command(*)')),
          allow_write: raw.allow_write !== undefined ? !!raw.allow_write : (perms.includes('file_write') || perms.includes('write_file(*)')),
          allow_web: raw.allow_web !== undefined ? !!raw.allow_web : (perms.includes('web_access') || perms.includes('read_url(*)')),
          allow_subagent: raw.allow_subagent !== undefined ? !!raw.allow_subagent : (perms.includes('subagents') || perms.includes('invoke_subagent(*)')),
          mode: raw.mode || 'accept-edits',
          sandbox: !!raw.sandbox,
          allowNonWorkspaceAccess: raw.allowNonWorkspaceAccess !== undefined ? !!raw.allowNonWorkspaceAccess : true,
          whitelist: Array.isArray(raw.whitelist) ? [...raw.whitelist] : [...perms],
          tones_enabled: raw.tones_enabled !== undefined ? !!raw.tones_enabled : true,
          haptic_enabled: raw.haptic_enabled !== undefined ? !!raw.haptic_enabled : true,
          speech_enabled: raw.speech_enabled !== undefined ? !!raw.speech_enabled : false,

          trustedWorkspaces: Array.isArray(raw.trustedWorkspaces) ? [...raw.trustedWorkspaces] : []
        };
      }

      render() {
        if (!this.fieldsContainer) return;
        this.fieldsContainer.innerHTML = '';
        const schema = this.getSchema();

        schema.forEach(sec => {
          const fieldset = (this.doc || document).createElement('fieldset');
          fieldset.className = 'form-section-fieldset';
          fieldset.id = `fieldset-${sec.section}`;

          const legend = (this.doc || document).createElement('legend');
          legend.className = 'form-section-legend';
          legend.textContent = sec.legend;
          fieldset.appendChild(legend);

          sec.fields.forEach(f => {
            const fieldEl = this.buildFieldElement(f);
            if (fieldEl) fieldset.appendChild(fieldEl);
          });

          this.fieldsContainer.appendChild(fieldset);
        });

        if (this.skeleton) this.skeleton.style.display = 'none';
        this.fieldsContainer.style.display = 'block';
      }

      buildFieldElement(f) {
        const container = (this.doc || document).createElement('div');
        container.className = 'form-group';
        const unsupported = false;

        if (f.type === 'select_models') {
          const label = (this.doc || document).createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = (this.doc || document).createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          this.models.forEach(m => {
            const opt = (this.doc || document).createElement('option');
            opt.value = m.id || m.name;
            opt.setAttribute('data-id', m.id || '');
            opt.textContent = m.name + (m.tag ? ` (${m.tag})` : '');
            if (this.state.model && (this.state.model === m.name || this.state.model === m.id)) {
              opt.selected = true;
            }
            select.appendChild(opt);
          });

          select.addEventListener('change', (e) => {
            this.state.model = e.target.value;
            this.dirtyFields.add('model');
            this.announce(`Selected Model: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = (this.doc || document).createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'select') {
          const label = (this.doc || document).createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = (this.doc || document).createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          f.options.forEach(optData => {
            const opt = (this.doc || document).createElement('option');
            opt.value = optData.value;
            opt.textContent = optData.label;
            if (this.state[f.key] === optData.value) opt.selected = true;
            select.appendChild(opt);
          });

          select.addEventListener('change', (e) => {
            this.state[f.key] = e.target.value;
            this.dirtyFields.add(f.key);
            this.announce(`${f.label}: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = (this.doc || document).createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'text' || f.type === 'password') {
          const label = (this.doc || document).createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const input = (this.doc || document).createElement('input');
          input.type = f.type;
          input.id = f.id;
          input.className = 'form-control';
          input.value = this.state[f.key] || '';
          if (f.placeholder) input.placeholder = f.placeholder;
          input.setAttribute('aria-describedby', `${f.id}-hint`);

          input.addEventListener('input', (e) => {
            this.state[f.key] = e.target.value.trim();
            this.dirtyFields.add(f.key);
            this.debouncedSave();
          });

          const hint = (this.doc || document).createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(input);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'switch') {
          container.className = 'form-switch-row';
          if (f.colorBorder) container.style.borderRight = `3px solid ${f.colorBorder}`;

          const textCol = (this.doc || document).createElement('div');
          textCol.className = 'form-switch-text';

          const label = (this.doc || document).createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-switch-title';
          label.textContent = f.label;

          const desc = (this.doc || document).createElement('div');
          desc.id = `${f.id}-desc`;
          desc.className = 'form-switch-desc';
          desc.textContent = f.hint;

          textCol.appendChild(label);
          textCol.appendChild(desc);

          const switchBox = (this.doc || document).createElement('label');
          switchBox.className = 'switch-control';

          const input = (this.doc || document).createElement('input');
          input.type = 'checkbox';
          input.id = f.id;
          input.checked = !!this.state[f.key];
          input.disabled = !!f.disabled;
          input.setAttribute('role', 'switch');
          input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
          input.setAttribute('aria-describedby', `${f.id}-desc`);

          const slider = (this.doc || document).createElement('span');
          slider.className = 'switch-slider';

          input.addEventListener('change', (e) => {
            const val = e.target.checked;
            this.state[f.key] = val;
            this.dirtyFields.add(f.key);
            input.setAttribute('aria-checked', val ? 'true' : 'false');
            this.announce(`${f.label} is now ${val ? 'Enabled' : 'Disabled'}`);
            this.debouncedSave();
          });

          switchBox.appendChild(input);
          switchBox.appendChild(slider);

          container.appendChild(textCol);
          container.appendChild(switchBox);
          return container;
        }

        if (f.type === 'array_chips') {
          const label = (this.doc || document).createElement('label');
          label.htmlFor = `${f.id}-input`;
          label.className = 'form-label';
          label.textContent = f.label;

          const chipContainer = (this.doc || document).createElement('div');
          chipContainer.id = `${f.id}-list`;
          chipContainer.className = 'chip-array-container';
          chipContainer.setAttribute('role', 'list');
          chipContainer.setAttribute('aria-label', f.label);

          const renderChips = () => {
            chipContainer.innerHTML = '';
            const items = this.state[f.key] || [];
            if (items.length === 0) {
              chipContainer.innerHTML = '<span class="main-style-162">No paths defined.</span>';
              return;
            }
            items.forEach((itemVal, idx) => {
              const chip = (this.doc || document).createElement('span');
              chip.className = 'chip-item';
              chip.setAttribute('role', 'listitem');
              chip.textContent = itemVal;

              const removeBtn = (this.doc || document).createElement('button');
              removeBtn.type = 'button';
              removeBtn.className = 'chip-btn-remove';
              removeBtn.innerHTML = '&times;';
              removeBtn.setAttribute('aria-label', `Remove workspace ${itemVal}`);
              removeBtn.addEventListener("click", () => {
                this.state[f.key].splice(idx, 1);
                this.dirtyFields.add(f.key);
                renderChips();
                this.announce(`Removed workspace ${itemVal}`);
              });

              chip.appendChild(removeBtn);
              chipContainer.appendChild(chip);
            });
          };

          const addBox = (this.doc || document).createElement('div');
          addBox.className = 'chip-add-box';

          const addInput = (this.doc || document).createElement('input');
          addInput.type = 'text';
          addInput.id = `${f.id}-input`;
          addInput.className = 'chip-add-input';
          addInput.placeholder = '/data/data/com.termux/files/home/my-project';
          addInput.setAttribute('aria-label', 'New workspace path to trust');

          const addBtn = (this.doc || document).createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'chip-add-btn';
          addBtn.textContent = '➕ Add Path';
          addBtn.addEventListener("click", () => {
            const val = addInput.value.trim();
            if (val) {
              if (!this.state[f.key]) this.state[f.key] = [];
              if (!this.state[f.key].includes(val)) {
                this.state[f.key].push(val);
                this.dirtyFields.add(f.key);
                renderChips();
                this.announce(`Added trusted workspace ${val}`);
                addInput.value = '';
              }
            }
          });

          addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBtn.click();
            }
          });

          addBox.appendChild(addInput);
          addBox.appendChild(addBtn);

          const hint = (this.doc || document).createElement('p');
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          renderChips();
          container.appendChild(label);
          container.appendChild(chipContainer);
          container.appendChild(addBox);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'resource_summary') {
          container.innerHTML = `
            <div class="main-style-163">
              <span class="main-style-164">Model Tokens & Quotas</span>
              <button type="button" id="btn-dyn-open-quota" class="btn-icon-sm main-style-165" aria-label="Open official quota details">📊 Quota Details</button>
            </div>
            <div class="main-style-166">
              <div class="main-style-118">
                <span>Context Window Used:</span>
                <strong id="dyn-context-text">0 / 1,048,576 tokens (0%)</strong>
              </div>
              <div class="mini-progress-track main-style-167"><div class="mini-progress-fill main-style-168" id="dyn-context-fill"></div></div>
            </div>
          `;

          setTimeout(() => {
            const btnQ = container && typeof container.querySelector === 'function' ? container.querySelector('#btn-dyn-open-quota') : null;
            const qDlg = (this.doc || document).getElementById('quota-dialog');
            if (btnQ && qDlg) {
              btnQ.addEventListener("click", () => {
                if (this.dialog) this.dialog.close();
                qDlg.showModal();
                this.announce('Opened Quota Details modal');
                if (typeof loadQuotaData === 'function') loadQuotaData();
              });
            }
          }, 0);

          return container;
        }

        if (f.type === 'whitelist_manager') {
          container.className = 'form-group';
          const label = (this.doc || document).createElement('label');
          label.className = 'form-label';
          label.textContent = f.label || 'Auto-Approved Commands Whitelist';

          const hint = (this.doc || document).createElement('p');
          hint.className = 'form-hint';
          hint.textContent = 'أوامر التيرمنال المصرح بها دائماً دون الحاجة لطلب إذن. يمكنك حذف أي أمر لإعادة طلب الإذن قبل تنفيذه.';

          const listContainer = (this.doc || document).createElement('div');
          listContainer.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:8px;';

          const renderWhitelist = () => {
            listContainer.innerHTML = '';
            const rules = this.state.whitelist || [];
            if (rules.length === 0) {
              listContainer.innerHTML = '<div class="main-style-169">لا توجد أوامر مخصصة مصرح بها دائماً حالياً.</div>';
              return;
            }
            rules.forEach(ruleStr => {
              const row = (this.doc || document).createElement('div');
              row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; background:var(--bg-card); border:1px solid var(--border-main); border-radius:6px;';

              const codeSpan = (this.doc || document).createElement('code');
              codeSpan.style.cssText = 'font-size:0.8rem; color:var(--accent-cyan); word-break:break-all; font-family:var(--font-mono);';
              codeSpan.textContent = ruleStr;

              const delBtn = (this.doc || document).createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'btn-icon-sm';
              delBtn.style.cssText = 'background:rgba(255, 123, 114, 0.15); color:var(--accent-red); border:1px solid var(--accent-red); border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; flex-shrink:0;';
              delBtn.setAttribute('aria-label', `حذف التصريح الدائم للأمر ${ruleStr}`);
              delBtn.textContent = '❌ حذف';
              delBtn.addEventListener("click", async () => {
                try {
                  if (this._debounceTimer) clearTimeout(this._debounceTimer);
                  if (this.saveRequest) await this.saveRequest;
                  delBtn.disabled = true;
                  const res = await this.fetchApi('/api/ai/permissions/whitelist/remove', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ rule: ruleStr })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    this.state.whitelist = data.whitelist || [];
                    if (data.baseline) this.baseline = data.baseline;
                    if (data.settings && data.settings.revision) this.state.revision = data.settings.revision;
                    renderWhitelist();
                    this.announce(`تم حذف التصريح الدائم للأمر ${ruleStr}`);
                    if (this.dirtyFields.size) {
                      this.debouncedSave();
                    }
                  }
                } catch (e) {
                  console.error(e);
                }
              });

              row.appendChild(codeSpan);
              row.appendChild(delBtn);
              listContainer.appendChild(row);
            });
          };

          const addBox = (this.doc || document).createElement('div');
          addBox.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
          const addInput = (this.doc || document).createElement('input');
          addInput.type = 'text';
          addInput.className = 'form-control';
          addInput.placeholder = 'مثال: command(git *) أو command(ls)';
          addInput.setAttribute('aria-label', 'إضافة أمر مصرح به دائماً');
          const addBtn = (this.doc || document).createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'btn btn-secondary';
          addBtn.style.cssText = 'flex-shrink:0;';
          addBtn.textContent = '➕ إضافة تصريح';
          addBtn.addEventListener('click', async () => {
            const val = (addInput.value || '').trim();
            if (val) {
              try {
                if (this._debounceTimer) clearTimeout(this._debounceTimer);
                if (this.saveRequest) await this.saveRequest;
                addBtn.disabled = true;
                const res = await this.fetchApi('/api/ai/permissions/whitelist/add', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ rule: val })
                });
                if (res.ok) {
                  const data = await res.json();
                  this.state.whitelist = data.whitelist || [];
                  if (data.baseline) this.baseline = data.baseline;
                  if (data.settings && data.settings.revision) this.state.revision = data.settings.revision;
                  renderWhitelist();
                  this.announce(`تمت إضافة التصريح الدائم: ${val}`);
                  addInput.value = '';
                  if (this.dirtyFields.size) {
                    this.debouncedSave();
                  }
                }
              } catch (e) {
                console.error(e);
              } finally {
                addBtn.disabled = false;
              }
            }
          });
          addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBtn.click();
            }
          });
          addBox.appendChild(addInput);
          addBox.appendChild(addBtn);

          renderWhitelist();
          container.appendChild(label);
          container.appendChild(hint);
          container.appendChild(listContainer);
          container.appendChild(addBox);
          return container;
        }

        if (f.type === 'system_update') {
          container.className = 'form-group';
          container.style.cssText = 'background:rgba(255,255,255,0.02); border:1px solid var(--border-main); border-radius:8px; padding:12px; margin-top:10px;';
          container.innerHTML = `
            <div class="main-style-163">
              <span class="main-style-170">🚀 Antigravity CLI Version & System Update</span>
              <span id="dyn-cli-ver-badge" class="badge main-style-171">فحص...</span>
            </div>
            <p class="form-hint main-style-172">يمكنك التحقق من وجود إصدار أحدث لأداة Antigravity CLI وتحديثها في الخلفية بضغطة واحدة.</p>
            <div class="main-style-173">
              <button type="button" id="btn-dyn-update-cli" class="btn btn-primary main-style-174" aria-label="تحديث Antigravity CLI إلى أحدث إصدار">
                🔄 تحديث Antigravity CLI الآن
              </button>
              <span id="dyn-update-status" role="status" aria-live="polite" class="main-style-175"></span>
            </div>
          `;

          setTimeout(async () => {
            if (!container || typeof container.querySelector !== 'function') return;
            const verBadge = container.querySelector('#dyn-cli-ver-badge');
            const btnUpdate = container.querySelector('#btn-dyn-update-cli');
            const statusSpan = container.querySelector('#dyn-update-status');
            try {
              const res = await this.fetchApi('/api/system/version');
              if (res.ok) {
                const vData = await res.json();
                if (verBadge) verBadge.textContent = vData.version || 'v1.x';
              }
            } catch (e) {}

            if (btnUpdate) {
              btnUpdate.addEventListener("click", async () => {
                if (btnUpdate.disabled) return;
                btnUpdate.disabled = true;
                if (statusSpan) statusSpan.textContent = '⏳ جاري تنزيل وتثبيت التحديث...';
                this.announce('جاري تنزيل وتثبيت تحديث Antigravity CLI في الخلفية');
                try {
                  const uRes = await this.fetchApi('/api/system/update', { method: 'POST' });
                  const uData = await uRes.json();
                  if (uRes.ok && uData.status === 'unchanged') {
                    if (statusSpan) statusSpan.textContent = 'انتهى الأمر؛ نسخة CLI لم تتغير.';
                    this.announce('انتهى الأمر؛ نسخة CLI لم تتغير.');
                  } else if (uRes.ok && uData.status === 'ok') {
                    if (statusSpan) statusSpan.textContent = '✓ تم التحديث بنجاح! يرجى إعادة تشغيل الجلسة.';
                    this.announce('تم تحديث Antigravity CLI بنجاح');
                  } else {
                    if (statusSpan) statusSpan.textContent = 'الإصدار الحالي هو الأحدث، أو تعذر الاتصال بالسيرفر.';
                    this.announce(statusSpan.textContent);
                  }
                } catch (err) {
                  if (statusSpan) statusSpan.textContent = 'تعذر إجراء التحديث.';
                  this.announce('تعذر إجراء التحديث');
                } finally {
                  btnUpdate.disabled = false;
                }
              });
            }
          }, 0);

          return container;
        }

        return null;
      }

      setSyncStatus(status, text) {
        if (!this.syncBadge) return;
        this.syncBadge.className = `sync-badge sync-badge-${status}`;
        this.syncBadge.textContent = text;
      }

      async handleExternalSync() {
        (typeof window !== 'undefined' && window.mainV1?.invalidateSettings && window.mainV1.invalidateSettings());
        this.remoteGeneration++;
        this.remoteRequest = null;
        const refreshed = await this.fetchRemoteData();
        if (refreshed && this.dialog?.open) {
          const focused = document.activeElement;
          const focusedId = focused?.id;
          const textDraft = focused?.tagName === 'INPUT' && focused.type === 'text' ? focused.value : null;
          const selection = textDraft !== null ? [focused.selectionStart, focused.selectionEnd] : null;
          this.render();
          if (focusedId && document.activeElement === document.body) {
            const replacement = document.getElementById(focusedId);
            if (replacement && textDraft !== null) replacement.value = textDraft;
            replacement?.focus();
            if (replacement && selection) replacement.setSelectionRange(...selection);
          }
        }
      }

      async save(closeDialog = false) {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        if (this.saveRequest) {
          const saved = await this.saveRequest;
          if (!saved) return;
          if (this.dirtyFields.size) return this.save(closeDialog);
          if (closeDialog && this.dialog) this.dialog.close();
          return;
        }
        const writable = [
          'model', 'agent', 'effort', 'mode', 'sandbox', 'autopilot', 'safe_mode',
          'allowNonWorkspaceAccess', 'allow_commands', 'allow_write', 'allow_web',
          'allow_subagent', 'allow_schedule', 'tones_enabled', 'haptic_enabled',
          'speech_enabled', 'trustedWorkspaces', 'whitelist'
        ];
        const payload = JSON.parse(JSON.stringify(Object.fromEntries([...this.dirtyFields]
          .filter(key => writable.includes(key)).map(key => [key, this.state[key]]))));
        if (!Object.keys(payload).length) {
          this.setSyncStatus('saved', 'لا تغيير للحفظ');
          if (closeDialog && this.dialog) this.dialog.close();
          return;
        }
        this.setSyncStatus('syncing', 'Saving...');
        this.remoteGeneration++;
        const pending = (async () => {
          const res = await this.fetchApi('/api/ai/settings', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload), settingsBaseline: this.baseline
          });
          const outcome = await res.json();
          const confirmed = outcome.savedFields || [];
          if (confirmed.length) this.remoteGeneration++;
          const accepted = outcome.settings ? this.normalizeSettings(outcome.settings) : {};
          confirmed.forEach(key => {
            this.initialState[key] = accepted[key];
            if (JSON.stringify(this.state[key]) === JSON.stringify(payload[key])) this.dirtyFields.delete(key);
          });
          if (outcome.baseline && confirmed.length) {
            this.baseline ||= {};
            if (outcome.baseline.revision) this.baseline.revision = outcome.baseline.revision;
            if (outcome.baseline.policyRevision) this.baseline.policyRevision = outcome.baseline.policyRevision;
            if (outcome.baseline.permissions) this.baseline.permissions = outcome.baseline.permissions;
          }
          if (!res.ok) throw new Error(res.status === 409 ? (confirmed.length ? 'حُفظ بعض التغييرات؛ تعارض الحفظ في الباقي؛ أعد تحميل الإعدادات لمراجعة تغييراتك' : 'تعارض الحفظ؛ أعد تحميل الإعدادات لمراجعة تغييراتك') :
            (confirmed.length ? 'حُفظ بعض التغييرات وبقي بعضها دون حفظ' : `تعذر الحفظ؛ رمز الخطأ ${res.status}`));
          this.setSyncStatus(this.dirtyFields.size ? 'idle' : 'saved', this.dirtyFields.size ? 'تغييرات لم تُحفظ' : '● Settings Applied');
          if (closeDialog && !this.dirtyFields.size) {
            if (typeof playSuccessChime === 'function') this.playSuccessChime();
            this.announce('Antigravity settings saved and applied successfully');
            if (this.dialog) this.dialog.close();
          }
          return true;
        })().catch(err => {
          console.error('Settings save failed:', err);
          this.setSyncStatus('idle', err.message);
          this.announce(err.message);
          return false;
        }).finally(() => { if (this.saveRequest === pending) this.saveRequest = null; });
        this.saveRequest = pending;
        return pending;
      }

      debouncedSave() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.save(false);
        }, 350);
      }

      bindEvents() {
        if (this.btnSave) {
          this.btnSave.addEventListener('click', () => this.save(true));
        }

        if (this.btnReset) {
          this.btnReset.addEventListener('click', async () => {
            if (this.saveRequest) await this.saveRequest;
            (typeof window !== 'undefined' && window.mainV1?.invalidateSettings && window.mainV1.invalidateSettings());
            this.remoteGeneration++;
            this.remoteRequest = null;
            const reloaded = await this.fetchRemoteData(true);
            this.render();
            this.announce(reloaded ? 'Settings reset to loaded state' : 'تعذر تحميل الإعدادات؛ بقيت تغييراتك دون مساس');
          });
        }

        const btnOpen = (this.doc || document).getElementById('btn-open-settings');
        if (btnOpen && this.dialog) {
          btnOpen.addEventListener('click', async () => {
            if (this.skeleton) this.skeleton.style.display = 'flex';
            if (this.fieldsContainer) this.fieldsContainer.style.display = 'none';
            this.dialog.showModal();
            await this.fetchRemoteData();
            this.render();
            this.announce('Opened Antigravity Dynamic Settings');
          });
        }

        if (this.btnClose && this.dialog) {
          this.btnClose.addEventListener('click', () => this.dialog.close());
        }
        if (this.btnCloseTop && this.dialog) {
          this.btnCloseTop.addEventListener('click', () => this.dialog.close());
        }

        this.syncPollInterval = setInterval(() => {
          if (((this.doc || document).visibilityState) === 'visible' && (!this.dialog || !this.dialog.open)) {
            this.fetchRemoteData();
          }
        }, 30000);
      }

      destroy() {
        if (this.syncPollInterval) clearInterval(this.syncPollInterval);
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        if (this.broadcast && typeof this.broadcast.close === 'function') {
          this.broadcast.close();
        }
      }
    }


  return {
    DynamicSettingsEngine: DynamicSettingsEngine,
    createSettingsEngine: function (options) {
      return new DynamicSettingsEngine(options);
    }
  };
});
