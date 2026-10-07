// ==============================================================================
// Dynamic Schema-Driven Settings & Realtime Live Sync Engine
// Accessible tab navigation, dynamic inputs, validation & instant auto-save
// ==============================================================================

    // DYNAMIC SCHEMA-DRIVEN SETTINGS & REALTIME LIVE SYNC ENGINE
    // ==========================================================================
    class DynamicSettingsEngine {
      constructor() {
        this.dialog = document.getElementById('settings-dialog');
        this.form = document.getElementById('dynamic-settings-form');
        this.fieldsContainer = document.getElementById('dynamic-settings-fields');
        this.skeleton = document.getElementById('dynamic-settings-skeleton');
        this.syncBadge = document.getElementById('settings-sync-badge');
        this.btnSave = document.getElementById('btn-save-settings');
        this.btnReset = document.getElementById('btn-reset-settings');
        this.btnClose = document.getElementById('btn-close-dialog');
        this.btnCloseTop = document.getElementById('btn-close-dialog-top');

        this.state = {};
        this.initialState = {};
        this.models = [];
        this.dirtyFields = new Set();
        this.broadcast = null;
        this.syncPollInterval = null;

        this.initBroadcast();
        this.bindEvents();
      }

      initBroadcast() {
        if ('BroadcastChannel' in window) {
          this.broadcast = new BroadcastChannel('agy_settings_sync');
          this.broadcast.onmessage = (e) => {
            if (e.data && e.data.type === 'SETTINGS_UPDATED') {
              this.handleExternalSync(e.data.settings);
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
                default: 'Gemini 3.8 Flash (Medium)'
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
                default: ['/data/data/com.termux/files/home']
              }
            ]
          },
          {
            section: 'accessibility_feedback',
            legend: 'إمكانية الوصول والتنبيهات',
            fields: [
              {
                id: 'field-voice-speech',
                key: 'speech_enabled',
                type: 'switch',
                label: 'النطق الصوتي الداخلي',
                hint: 'قراءة الردود صوتياً (يُفضل إيقافه لمستخدمي TalkBack أو Jieshuo).',
                default: false
              },
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
                hint: 'اهتزاز خفيف لتأكيد الإجراءات.',
                default: true
              }
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

      async fetchRemoteData() {
        this.setSyncStatus('syncing', 'Syncing...');
        try {
          const [modelsRes, settingsRes] = await Promise.all([
            fetch('/api/ai/models'),
            fetch('/api/ai/settings')
          ]);

          if (modelsRes.ok) {
            this.models = await modelsRes.json();
          }

          if (settingsRes.ok) {
            const raw = await settingsRes.json();
            this.state = this.normalizeSettings(raw);
            this.initialState = JSON.parse(JSON.stringify(this.state));
            this.setSyncStatus('saved', '● Live Synced');
            if (typeof syncActiveModelDisplay === 'function' && this.state.model) {
              syncActiveModelDisplay(this.state.model);
            }
            if (typeof syncReasoningEffortDisplay === 'function' && this.state.effort) {
              syncReasoningEffortDisplay(this.state.effort);
            }
          }
        } catch (err) {
          console.error('Failed fetching settings schema:', err);
          this.setSyncStatus('idle', 'Offline / Cache');
        }
      }

      normalizeSettings(raw) {
        const perms = raw.permissions?.allow || [];
        const isSafe = !!raw.safe_mode;
        return {
          model: raw.model || 'Gemini 3.8 Flash (Medium)',
          effort: raw.effort || 'medium',
          autopilot: raw.autopilot !== undefined ? !!raw.autopilot : !isSafe,
          allow_commands: raw.allow_commands !== undefined ? !!raw.allow_commands : (perms.includes('command') || perms.includes('command(*)')),
          allow_write: raw.allow_write !== undefined ? !!raw.allow_write : (perms.includes('file_write') || perms.includes('write_file(*)')),
          allow_web: raw.allow_web !== undefined ? !!raw.allow_web : (perms.includes('web_access') || perms.includes('read_url(*)')),
          allow_subagent: raw.allow_subagent !== undefined ? !!raw.allow_subagent : (perms.includes('subagents') || perms.includes('invoke_subagent(*)')),
          mode: raw.mode || 'accept-edits',
          sandbox: !!raw.sandbox,
          allowNonWorkspaceAccess: raw.allowNonWorkspaceAccess !== undefined ? !!raw.allowNonWorkspaceAccess : true,
          whitelist: Array.isArray(raw.whitelist) ? [...raw.whitelist] : [],
          speech_enabled: !!raw.speech_enabled,
          tones_enabled: raw.tones_enabled !== undefined ? !!raw.tones_enabled : true,
          haptic_enabled: raw.haptic_enabled !== undefined ? !!raw.haptic_enabled : true,
          trustedWorkspaces: Array.isArray(raw.trustedWorkspaces) ? [...raw.trustedWorkspaces] : ['/data/data/com.termux/files/home']
        };
      }

      render() {
        if (!this.fieldsContainer) return;
        this.fieldsContainer.innerHTML = '';
        const schema = this.getSchema();

        schema.forEach(sec => {
          const fieldset = document.createElement('fieldset');
          fieldset.className = 'form-section-fieldset';
          fieldset.id = `fieldset-${sec.section}`;

          const legend = document.createElement('legend');
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
        const container = document.createElement('div');
        container.className = 'form-group';

        if (f.type === 'select_models') {
          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = document.createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          this.models.forEach(m => {
            const opt = document.createElement('option');
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
            announce(`Selected Model: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = document.createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'select') {
          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = document.createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          f.options.forEach(optData => {
            const opt = document.createElement('option');
            opt.value = optData.value;
            opt.textContent = optData.label;
            if (this.state[f.key] === optData.value) opt.selected = true;
            select.appendChild(opt);
          });

          select.addEventListener('change', (e) => {
            this.state[f.key] = e.target.value;
            this.dirtyFields.add(f.key);
            announce(`${f.label}: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = document.createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'switch') {
          container.className = 'form-switch-row';
          if (f.colorBorder) container.style.borderRight = `3px solid ${f.colorBorder}`;

          const textCol = document.createElement('div');
          textCol.className = 'form-switch-text';

          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-switch-title';
          label.textContent = f.label;

          const desc = document.createElement('div');
          desc.id = `${f.id}-desc`;
          desc.className = 'form-switch-desc';
          desc.textContent = f.hint;

          textCol.appendChild(label);
          textCol.appendChild(desc);

          const switchBox = document.createElement('label');
          switchBox.className = 'switch-control';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.id = f.id;
          input.checked = !!this.state[f.key];
          input.setAttribute('role', 'switch');
          input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
          input.setAttribute('aria-describedby', `${f.id}-desc`);

          const slider = document.createElement('span');
          slider.className = 'switch-slider';

          input.addEventListener('change', (e) => {
            const val = e.target.checked;
            this.state[f.key] = val;
            this.dirtyFields.add(f.key);
            input.setAttribute('aria-checked', val ? 'true' : 'false');
            announce(`${f.label} is now ${val ? 'Enabled' : 'Disabled'}`);
            this.debouncedSave();
          });

          switchBox.appendChild(input);
          switchBox.appendChild(slider);

          container.appendChild(textCol);
          container.appendChild(switchBox);
          return container;
        }

        if (f.type === 'array_chips') {
          const label = document.createElement('label');
          label.htmlFor = `${f.id}-input`;
          label.className = 'form-label';
          label.textContent = f.label;

          const chipContainer = document.createElement('div');
          chipContainer.id = `${f.id}-list`;
          chipContainer.className = 'chip-array-container';
          chipContainer.setAttribute('role', 'list');
          chipContainer.setAttribute('aria-label', f.label);

          const renderChips = () => {
            chipContainer.innerHTML = '';
            const items = this.state[f.key] || [];
            if (items.length === 0) {
              chipContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">No paths defined.</span>';
              return;
            }
            items.forEach((itemVal, idx) => {
              const chip = document.createElement('span');
              chip.className = 'chip-item';
              chip.setAttribute('role', 'listitem');
              chip.textContent = itemVal;

              const removeBtn = document.createElement('button');
              removeBtn.type = 'button';
              removeBtn.className = 'chip-btn-remove';
              removeBtn.innerHTML = '&times;';
              removeBtn.setAttribute('aria-label', `Remove workspace ${itemVal}`);
              removeBtn.onclick = () => {
                this.state[f.key].splice(idx, 1);
                this.dirtyFields.add(f.key);
                renderChips();
                announce(`Removed workspace ${itemVal}`);
              };

              chip.appendChild(removeBtn);
              chipContainer.appendChild(chip);
            });
          };

          const addBox = document.createElement('div');
          addBox.className = 'chip-add-box';

          const addInput = document.createElement('input');
          addInput.type = 'text';
          addInput.id = `${f.id}-input`;
          addInput.className = 'chip-add-input';
          addInput.placeholder = '/data/data/com.termux/files/home/my-project';
          addInput.setAttribute('aria-label', 'New workspace path to trust');

          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'chip-add-btn';
          addBtn.textContent = '➕ Add Path';
          addBtn.onclick = () => {
            const val = addInput.value.trim();
            if (val) {
              if (!this.state[f.key]) this.state[f.key] = [];
              if (!this.state[f.key].includes(val)) {
                this.state[f.key].push(val);
                this.dirtyFields.add(f.key);
                renderChips();
                announce(`Added trusted workspace ${val}`);
                addInput.value = '';
              }
            }
          };

          addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBtn.click();
            }
          });

          addBox.appendChild(addInput);
          addBox.appendChild(addBtn);

          const hint = document.createElement('p');
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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; color:var(--accent-cyan); font-size:0.92rem;">Model Tokens & Quotas</span>
              <button type="button" id="btn-dyn-open-quota" class="btn-icon-sm" style="background:var(--bg-card); color:var(--accent-purple); border:1px solid var(--accent-purple); padding:3px 10px; border-radius:6px; cursor:pointer; font-weight:700;" aria-label="Open official quota details">📊 Quota Details</button>
            </div>
            <div style="background: rgba(0,0,0,0.35); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem;">
                <span>Context Window Used:</span>
                <strong id="dyn-context-text">0 / 1,048,576 tokens (0%)</strong>
              </div>
              <div class="mini-progress-track" style="width: 100%; height: 8px;"><div class="mini-progress-fill" id="dyn-context-fill" style="width: 0%; height: 100%;"></div></div>
            </div>
          `;

          setTimeout(() => {
            const btnQ = container.querySelector('#btn-dyn-open-quota');
            const qDlg = document.getElementById('quota-dialog');
            if (btnQ && qDlg) {
              btnQ.onclick = () => {
                if (this.dialog) this.dialog.close();
                qDlg.showModal();
                announce('Opened Quota Details modal');
                if (typeof loadQuotaData === 'function') loadQuotaData();
              };
            }
          }, 0);

          return container;
        }

        if (f.type === 'whitelist_manager') {
          container.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-label';
          label.textContent = f.label || 'Auto-Approved Commands Whitelist';

          const hint = document.createElement('p');
          hint.className = 'form-hint';
          hint.textContent = 'أوامر التيرمنال المصرح بها دائماً دون الحاجة لطلب إذن. يمكنك حذف أي أمر لإعادة طلب الإذن قبل تنفيذه.';

          const listContainer = document.createElement('div');
          listContainer.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:8px;';

          const renderWhitelist = () => {
            listContainer.innerHTML = '';
            const rules = this.state.whitelist || [];
            if (rules.length === 0) {
              listContainer.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">لا توجد أوامر مخصصة مصرح بها دائماً حالياً.</div>';
              return;
            }
            rules.forEach(ruleStr => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; background:var(--bg-card); border:1px solid var(--border-main); border-radius:6px;';
              
              const codeSpan = document.createElement('code');
              codeSpan.style.cssText = 'font-size:0.8rem; color:var(--accent-cyan); word-break:break-all; font-family:var(--font-mono);';
              codeSpan.textContent = ruleStr;

              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'btn-icon-sm';
              delBtn.style.cssText = 'background:rgba(255, 123, 114, 0.15); color:var(--accent-red); border:1px solid var(--accent-red); border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; flex-shrink:0;';
              delBtn.setAttribute('aria-label', `حذف التصريح الدائم للأمر ${ruleStr}`);
              delBtn.textContent = '❌ حذف';
              delBtn.onclick = async () => {
                try {
                  delBtn.disabled = true;
                  const res = await fetch('/api/ai/permissions/whitelist/remove', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ rule: ruleStr })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    this.state.whitelist = data.whitelist || [];
                    renderWhitelist();
                    announce(`تم حذف التصريح الدائم للأمر ${ruleStr}`);
                  }
                } catch (e) {
                  console.error(e);
                }
              };

              row.appendChild(codeSpan);
              row.appendChild(delBtn);
              listContainer.appendChild(row);
            });
          };

          renderWhitelist();
          container.appendChild(label);
          container.appendChild(hint);
          container.appendChild(listContainer);
          return container;
        }

        if (f.type === 'system_update') {
          container.className = 'form-group';
          container.style.cssText = 'background:rgba(255,255,255,0.02); border:1px solid var(--border-main); border-radius:8px; padding:12px; margin-top:10px;';
          container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; color:var(--accent-green); font-size:0.92rem;">🚀 Antigravity CLI Version & System Update</span>
              <span id="dyn-cli-ver-badge" class="badge" style="background:var(--bg-tertiary); font-family:var(--font-mono); font-size:0.78rem;">فحص...</span>
            </div>
            <p class="form-hint" style="margin-bottom:10px;">يمكنك التحقق من وجود إصدار أحدث لأداة Antigravity CLI وتحديثها في الخلفية بضغطة واحدة.</p>
            <div style="display:flex; gap:10px; align-items:center;">
              <button type="button" id="btn-dyn-update-cli" class="btn btn-primary" style="font-size:0.82rem; padding:6px 14px;" aria-label="تحديث Antigravity CLI إلى أحدث إصدار">
                🔄 تحديث Antigravity CLI الآن
              </button>
              <span id="dyn-update-status" style="font-size:0.8rem; color:var(--text-muted);" role="status" aria-live="polite"></span>
            </div>
          `;

          setTimeout(async () => {
            const verBadge = container.querySelector('#dyn-cli-ver-badge');
            const btnUpdate = container.querySelector('#btn-dyn-update-cli');
            const statusSpan = container.querySelector('#dyn-update-status');
            try {
              const res = await fetch('/api/system/version');
              if (res.ok) {
                const vData = await res.json();
                if (verBadge) verBadge.textContent = vData.version || 'v1.x';
              }
            } catch (e) {}

            if (btnUpdate) {
              btnUpdate.onclick = async () => {
                if (btnUpdate.disabled) return;
                btnUpdate.disabled = true;
                if (statusSpan) statusSpan.textContent = '⏳ جاري تنزيل وتثبيت التحديث...';
                announce('جاري تنزيل وتثبيت تحديث Antigravity CLI في الخلفية');
                try {
                  const uRes = await fetch('/api/system/update', { method: 'POST' });
                  const uData = await uRes.json();
                  if (uRes.ok && uData.status === 'ok') {
                    if (statusSpan) statusSpan.textContent = '✓ تم التحديث بنجاح! يرجى إعادة تشغيل الجلسة.';
                    announce('تم تحديث Antigravity CLI بنجاح');
                  } else {
                    if (statusSpan) statusSpan.textContent = 'الإصدار الحالي هو الأحدث، أو تعذر الاتصال بالسيرفر.';
                    announce(statusSpan.textContent);
                  }
                } catch (err) {
                  if (statusSpan) statusSpan.textContent = 'تعذر إجراء التحديث.';
                  announce('تعذر إجراء التحديث');
                } finally {
                  btnUpdate.disabled = false;
                }
              };
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

      handleExternalSync(newSettings) {
        if (!this.dialog || !this.dialog.open) {
          this.state = this.normalizeSettings(newSettings);
          return;
        }
        const normalized = this.normalizeSettings(newSettings);
        Object.keys(normalized).forEach(k => {
          if (!this.dirtyFields.has(k)) {
            this.state[k] = normalized[k];
          }
        });
        this.render();
        this.setSyncStatus('saved', '● Live Synced');
      }

      async save(closeDialog = false) {
        this.setSyncStatus('syncing', 'Saving...');
        const payload = {
          model: this.state.model,
          effort: this.state.effort,
          mode: this.state.mode || 'accept-edits',
          sandbox: !!this.state.sandbox,
          allowNonWorkspaceAccess: this.state.allowNonWorkspaceAccess !== undefined ? !!this.state.allowNonWorkspaceAccess : true,
          autopilot: !!this.state.autopilot,
          safe_mode: !this.state.autopilot,
          allow_commands: !!this.state.allow_commands,
          allow_write: !!this.state.allow_write,
          allow_web: !!this.state.allow_web,
          allow_subagent: !!this.state.allow_subagent,
          allow_schedule: !!this.state.allow_schedule,
          speech_enabled: !!this.state.speech_enabled,
          tones_enabled: !!this.state.tones_enabled,
          haptic_enabled: !!this.state.haptic_enabled,
          trustedWorkspaces: this.state.trustedWorkspaces
        };

        try {
          const res = await fetch('/api/ai/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const data = await res.json();
            this.dirtyFields.clear();
            this.setSyncStatus('saved', '● Settings Applied');
            if (closeDialog) {
              if (typeof playSuccessChime === 'function') playSuccessChime();
              announce('Antigravity settings saved and applied successfully');
              if (this.dialog) this.dialog.close();
            }
            if (this.broadcast) {
              this.broadcast.postMessage({ type: 'SETTINGS_UPDATED', settings: data.settings || payload });
            }
          } else {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
        } catch (err) {
          console.error('Settings save failed:', err);
          this.setSyncStatus('idle', 'Save Failed');
          if (closeDialog) {
            announce('Error: Failed to save settings to server');
          }
        }
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
          this.btnReset.addEventListener('click', () => {
            this.state = JSON.parse(JSON.stringify(this.initialState));
            this.dirtyFields.clear();
            this.render();
            announce('Settings reset to loaded state');
          });
        }

        const btnOpen = document.getElementById('btn-open-settings');
        if (btnOpen && this.dialog) {
          btnOpen.addEventListener('click', async () => {
            if (this.skeleton) this.skeleton.style.display = 'flex';
            if (this.fieldsContainer) this.fieldsContainer.style.display = 'none';
            this.dialog.showModal();
            await this.fetchRemoteData();
            this.render();
            announce('Opened Antigravity Dynamic Settings');
          });
        }

        if (this.btnClose && this.dialog) {
          this.btnClose.addEventListener('click', () => this.dialog.close());
        }
        if (this.btnCloseTop && this.dialog) {
          this.btnCloseTop.addEventListener('click', () => this.dialog.close());
        }

        this.syncPollInterval = setInterval(() => {
          if (document.visibilityState === 'visible' && (!this.dialog || !this.dialog.open)) {
            this.fetchRemoteData();
          }
        }, 30000);
      }
    }

    const dynamicSettingsEngine = new DynamicSettingsEngine();

// Global exports
window.DynamicSettingsEngine = DynamicSettingsEngine;
window.dynamicSettingsEngine = dynamicSettingsEngine;
