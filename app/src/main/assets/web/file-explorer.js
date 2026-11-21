/**
 * Antigravity Companion App - File Explorer & Storage Navigator
 * Clean Architecture Modular Engine
 *
 * Provides accessible file browsing, directory navigation, active project workspace
 * selection, new project creation, file inspection, and direct send-to-agent actions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FileExplorerManager = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function defaultEscapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createFileExplorerManager(options) {
    const opts = options || {};
    const escapeHtml = opts.escapeHtml || defaultEscapeHtml;
    const announce = opts.announce || function (msg) {
      if (typeof console !== 'undefined') console.log('[Announce]', msg);
    };
    const playSuccessChime = opts.playSuccessChime || function () {};
    const playBeep = opts.playBeep || function () {};
    const fetchApi = opts.fetchApi || (typeof window !== 'undefined' && window.mainV1Fetch ? window.mainV1Fetch : fetch);
    const onSelectProject = opts.onSelectProject || function () {};
    const onSendFileToPrompt = opts.onSendFileToPrompt || function () {};

    let showHiddenFiles = false;
    try {
      if (typeof localStorage !== 'undefined') {
        showHiddenFiles = localStorage.getItem('companion_show_hidden_files') === '1';
      }
    } catch (_) {}

    let lastKnownStorages = [];
    let currentExplorerDir = '';
    let currentActiveFilePath = '';

    // DOM references
    let doc = opts.document || (typeof document !== 'undefined' ? document : null);
    let filesDialog = null;
    let filesListContainer = null;
    let fileViewerContainer = null;
    let fileViewerContent = null;
    let fileViewerTitle = null;
    let btnBackToFiles = null;
    let aiInput = null;

    function bindDom(customDoc) {
      if (customDoc) doc = customDoc;
      if (!doc) return;

      filesDialog = doc.getElementById('files-dialog');
      filesListContainer = doc.getElementById('files-list-container');
      fileViewerContainer = doc.getElementById('file-viewer-container');
      fileViewerContent = doc.getElementById('file-viewer-content');
      fileViewerTitle = doc.getElementById('file-viewer-title');
      btnBackToFiles = doc.getElementById('btn-back-to-files');
      aiInput = doc.getElementById('ai-prompt-input');

      const btnOpenFiles = doc.getElementById('btn-open-files');
      const btnOpenFilesBottom = doc.getElementById('btn-open-files-bottom');
      const btnCloseFiles = doc.getElementById('btn-close-files');
      const btnCloseFilesTop = doc.getElementById('btn-close-files-top');
      const btnSendFileToPrompt = doc.getElementById('btn-send-file-to-prompt');
      const btnCopyFilePath = doc.getElementById('btn-copy-file-path');

      const openFilesModal = async () => {
        await loadDirectory();
        if (filesDialog && typeof filesDialog.showModal === 'function') {
          filesDialog.showModal();
        }
        announce('تم فتح مستعرض ملفات المشروع');
      };

      if (btnOpenFiles) btnOpenFiles.addEventListener('click', openFilesModal);
      if (btnOpenFilesBottom) btnOpenFilesBottom.addEventListener('click', openFilesModal);

      if (btnCloseFiles && filesDialog) {
        btnCloseFiles.addEventListener('click', () => {
          if (typeof filesDialog.close === 'function') filesDialog.close();
        });
      }
      if (btnCloseFilesTop && filesDialog) {
        btnCloseFilesTop.addEventListener('click', () => {
          if (typeof filesDialog.close === 'function') filesDialog.close();
        });
      }

      if (btnSendFileToPrompt) {
        btnSendFileToPrompt.addEventListener('click', () => {
          if (!currentActiveFilePath) return;
          if (filesDialog && typeof filesDialog.close === 'function') filesDialog.close();
          const fileName = currentActiveFilePath.split('/').pop() || currentActiveFilePath;
          onSendFileToPrompt(currentActiveFilePath, fileName);
          if (aiInput) {
            aiInput.value = 'يرجى قراءة وفحص الملف التالي والتعامل معه: ' + currentActiveFilePath;
            if (typeof aiInput.focus === 'function') aiInput.focus();
            announce('تم إدراج مسار الملف ' + fileName + ' في حقل طلب الوكيل');
            playSuccessChime();
          }
        });
      }

      if (btnCopyFilePath) {
        btnCopyFilePath.addEventListener('click', () => {
          if (!currentActiveFilePath) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentActiveFilePath).then(() => {
              playBeep(880, 0.08);
              announce('تم نسخ مسار الملف الكامل');
              btnCopyFilePath.textContent = '✓ تم النسخ';
              setTimeout(() => { btnCopyFilePath.textContent = '📋 نسخ المسار'; }, 2000);
            });
          }
        });
      }

      if (btnBackToFiles) {
        btnBackToFiles.addEventListener('click', () => {
          if (fileViewerContainer) fileViewerContainer.style.display = 'none';
          if (filesListContainer) filesListContainer.style.display = 'block';
        });
      }
    }

    function updateActiveProjectLabel(dirPath) {
      if (!dirPath) return;
      const folderName = dirPath.split('/').filter(Boolean).pop() || dirPath;
      if (aiInput) {
        aiInput.setAttribute('data-active-project', dirPath);
        aiInput.placeholder = 'اكتب رسالتك هنا... [مجلد العمل: ' + folderName + ']';
      }
      if (doc) {
        const filesTitle = doc.getElementById('files-title');
        if (filesTitle) {
          filesTitle.textContent = 'ملفات: ' + folderName;
        }
      }
    }

    async function loadDirectory(path) {
      try {
        const url = '/api/fs/list' + (path ? '?path=' + encodeURIComponent(path) : '');
        const res = await fetchApi(url);
        if (res.ok) {
          const data = await res.json();
          currentExplorerDir = data.current_dir || path || '';
          if (data.storages && data.storages.length) {
            lastKnownStorages = data.storages;
          }
          renderFilesList(data.current_dir, data.items || [], data.parent_dir, lastKnownStorages);
          return data;
        } else {
          let errText = 'المسار غير متاح';
          try {
            const err = await res.json();
            errText = err.error || err.message || errText;
          } catch (_) {}
          announce('تعذر تحميل الملفات: ' + errText);
          return null;
        }
      } catch (e) {
        announce('تعذر تحميل الملفات: ' + (e.message || 'خطأ اتصال'));
        return null;
      }
    }

    function renderFilesList(currentDir, items, parentDir, storages) {
      if (!filesListContainer) return;
      if (fileViewerContainer) fileViewerContainer.style.display = 'none';
      filesListContainer.style.display = 'block';
      currentExplorerDir = currentDir;

      let html = '<div class="files-nav-bar main-style-154" role="toolbar" aria-label="أشرطة التنقل ومسارات التخزين">';

      // Dynamic storage buttons
      const navStorages = (storages && storages.length) ? storages : [
        { name: "تيرماكس", path: "/data/data/com.termux/files/home", icon: "🏠" },
        { name: "مجلد جيميني (.gemini)", path: "/data/data/com.termux/files/home/.gemini", icon: "💎" },
        { name: "الذاكرة الداخلية", path: "/storage/emulated/0", icon: "📱" },
        { name: "التنزيلات", path: "/storage/emulated/0/Download", icon: "📥" }
      ];

      navStorages.forEach(st => {
        html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="' + escapeHtml(st.path) + '" aria-label="الانتقال إلى ' + escapeHtml(st.name) + '">' +
          (st.icon || '📁') + ' ' + escapeHtml(st.name) + '</button>';
      });

      if (parentDir && parentDir !== currentDir) {
        html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="' + escapeHtml(parentDir) + '" aria-label="الصعود للمجلد الأعلى">⬆️ لأعلى</button>';
      }

      // Hidden files toggle button
      html += '<button type="button" id="btn-toggle-hidden" class="btn btn-sm" aria-pressed="' + (showHiddenFiles ? 'true' : 'false') + '" aria-label="' + (showHiddenFiles ? 'إخفاء الملفات المخفية' : 'إظهار الملفات المخفية') + '">' +
        (showHiddenFiles ? '👁️ إخفاء المخفي' : '👁️ إظهار المخفي') + '</button>';

      html += '<button type="button" id="btn-set-active-project" class="btn btn-sm main-style-155" aria-label="تعيين هذا المجلد كمشروع العمل النشط للوكيل">🎯 تعيين كمشروع نشط</button>';
      html += '<button type="button" id="btn-create-new-project" class="btn btn-sm btn-primary" aria-label="إنشاء مشروع أو مجلد جديد هنا">➕ مشروع جديد</button>';
      html += '</div>';

      html += '<div id="new-project-panel" role="region" aria-label="نموذج إنشاء مشروع جديد" class="main-style-156">' +
        '<label for="input-new-project-name" class="main-style-157">اسم المشروع أو المجلد الجديد:</label>' +
        '<div class="main-style-158">' +
          '<input type="text" id="input-new-project-name" class="ai-prompt-input main-style-159" placeholder="اكتب اسم المشروع هنا" aria-label="اسم المشروع أو المجلد الجديد">' +
          '<button type="button" id="btn-submit-create-proj" class="btn btn-sm btn-primary" aria-label="تأكيد إنشاء المشروع">إنشاء وتعيين</button>' +
          '<button type="button" id="btn-cancel-create-proj" class="btn btn-sm" aria-label="إلغاء إنشاء المشروع">إلغاء</button>' +
        '</div>' +
      '</div>';

      html += '<div class="files-header-path main-style-160" role="region" aria-label="المسار الحالي">' +
        '<span>المسار الحالي: </span><code>' + escapeHtml(currentDir) + '</code>' +
      '</div>';

      // Filtering hidden files and sorting: folders first, then files (.gemini is always accessible)
      const allItems = items || [];
      const visibleItems = showHiddenFiles ? allItems : allItems.filter(it => !it.name.startsWith('.') || it.name === '.gemini');
      const dirs = visibleItems.filter(it => it.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const files = visibleItems.filter(it => !it.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      html += '<ul class="files-list" role="list" aria-label="قائمة المجلدات والملفات">';

      if (dirs.length === 0 && files.length === 0) {
        html += '<li class="main-style-161" role="listitem">' +
          (allItems.length > 0 && !showHiddenFiles ? 'المجلد لا يحتوي إلا على ملفات مخفية (اضغط إظهار المخفي لعرضها)' : 'المجلد فارغ') +
        '</li>';
      }

      // Render Folders first
      dirs.forEach(item => {
        const isHidden = item.name.startsWith('.');
        html += '<li class="file-item file-item-dir" role="listitem">' +
          '<button type="button" class="btn-file-open btn-dir-open" data-path="' + escapeHtml(item.path) + '" aria-label="مجلد ' + (isHidden ? 'مخفي يبدأ بنقطة: ' : '') + escapeHtml(item.name) + '">' +
            '<span>📁 ' + escapeHtml(item.name) + (isHidden ? ' <small style="color:var(--text-muted);">(مخفي)</small>' : '') + '</span>' +
            '<span class="file-meta">مجلد</span>' +
          '</button>' +
        '</li>';
      });

      // Render Files next with direct send-to-agent action
      files.forEach(item => {
        const isHidden = item.name.startsWith('.');
        const sizeStr = item.size > 1048576 ? (item.size / 1048576).toFixed(1) + ' MB' : Math.round(item.size / 1024) + ' KB';
        html += '<li class="file-item file-item-file" role="listitem">' +
          '<div class="file-item-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; background:var(--bg-card-header); padding:8px 12px; border-radius:8px; border:1px solid var(--border-main);">' +
            '<button type="button" class="btn-file-open btn-file-inspect" data-path="' + escapeHtml(item.path) + '" style="flex:1; display:flex; justify-content:space-between; align-items:center; background:none; border:none; color:var(--text-main); font-family:inherit; font-size:0.95rem; text-align:right; cursor:pointer;" aria-label="معاينة ملف ' + (isHidden ? 'مخفي يبدأ بنقطة: ' : '') + escapeHtml(item.name) + ' بحجم ' + sizeStr + '">' +
              '<span>📄 ' + escapeHtml(item.name) + (isHidden ? ' <small style="color:var(--text-muted);">(مخفي)</small>' : '') + '</span>' +
              '<span class="file-meta">' + sizeStr + '</span>' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-primary btn-send-file-direct" data-path="' + escapeHtml(item.path) + '" data-name="' + escapeHtml(item.name) + '" aria-label="إرسال ملف ' + escapeHtml(item.name) + ' للوكيل">⚡ للوكيل</button>' +
          '</div>' +
        '</li>';
      });

      html += '</ul>';
      filesListContainer.innerHTML = html;

      // Attach quick nav listeners
      filesListContainer.querySelectorAll('.btn-quick-nav').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetNav = btn.getAttribute('data-nav');
          if (targetNav) loadDirectory(targetNav);
        });
      });

      // Attach toggle hidden files listener
      const btnToggleHidden = doc ? doc.getElementById('btn-toggle-hidden') : null;
      if (btnToggleHidden) {
        btnToggleHidden.addEventListener('click', () => {
          showHiddenFiles = !showHiddenFiles;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('companion_show_hidden_files', showHiddenFiles ? '1' : '0');
            }
          } catch (_) {}
          const hiddenCount = allItems.filter(it => it.name.startsWith('.')).length;
          announce(showHiddenFiles ? ('تم إظهار ' + hiddenCount + ' من الملفات والمجلدات المخفية') : 'تم إخفاء الملفات المخفية');
          renderFilesList(currentDir, items, parentDir, storages);
          if (doc) {
            const newBtn = doc.getElementById('btn-toggle-hidden');
            if (newBtn && typeof newBtn.focus === 'function') newBtn.focus();
          }
        });
      }

      // Attach direct send to agent listener
      filesListContainer.querySelectorAll('.btn-send-file-direct').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const filePath = btn.getAttribute('data-path');
          const fileName = btn.getAttribute('data-name') || filePath.split('/').pop();
          if (filesDialog && typeof filesDialog.close === 'function') filesDialog.close();
          onSendFileToPrompt(filePath, fileName);
          if (aiInput) {
            aiInput.value = 'يرجى قراءة وفحص الملف التالي والتعامل معه: ' + filePath;
            if (typeof aiInput.focus === 'function') aiInput.focus();
          }
          announce('تم إدراج الملف ' + fileName + ' في طلب الوكيل');
          playSuccessChime();
        });
      });

      // Attach inspect / open listeners
      filesListContainer.querySelectorAll('.btn-dir-open').forEach(btn => {
        btn.addEventListener('click', () => {
          const path = btn.getAttribute('data-path');
          if (path) loadDirectory(path);
        });
      });

      filesListContainer.querySelectorAll('.btn-file-inspect').forEach(btn => {
        btn.addEventListener('click', () => {
          const path = btn.getAttribute('data-path');
          if (path) openFileContent(path);
        });
      });

      // Project creation handlers
      const btnCreateProj = doc ? doc.getElementById('btn-create-new-project') : null;
      const newProjPanel = doc ? doc.getElementById('new-project-panel') : null;
      const inputNewProjName = doc ? doc.getElementById('input-new-project-name') : null;
      const btnSubmitCreateProj = doc ? doc.getElementById('btn-submit-create-proj') : null;
      const btnCancelCreateProj = doc ? doc.getElementById('btn-cancel-create-proj') : null;

      if (btnCreateProj && newProjPanel && inputNewProjName) {
        btnCreateProj.addEventListener('click', () => {
          newProjPanel.style.display = 'block';
          inputNewProjName.value = '';
          if (typeof inputNewProjName.focus === 'function') inputNewProjName.focus();
          announce('اكتب اسم المشروع أو المجلد الجديد ثم اضغط إنشاء وتعيين');
        });

        if (btnCancelCreateProj) {
          btnCancelCreateProj.addEventListener('click', () => {
            newProjPanel.style.display = 'none';
            if (typeof btnCreateProj.focus === 'function') btnCreateProj.focus();
            announce('تم إلغاء إنشاء المشروع');
          });
        }

        async function submitNewProject() {
          const rawName = inputNewProjName.value.trim();
          if (!rawName) {
            announce('يرجى كتابة اسم المشروع أولاً');
            if (typeof inputNewProjName.focus === 'function') inputNewProjName.focus();
            return;
          }
          const cleanName = rawName.replace(new RegExp('[\\\\/:*?"<>|]', 'g'), '_');
          announce('جارٍ إنشاء المشروع ' + cleanName + '...');
          try {
            const res = await fetchApi('/api/fs/mkdir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parent_dir: currentDir, name: cleanName })
            });
            let targetPath = currentDir + (currentDir.endsWith('/') ? '' : '/') + cleanName;
            if (!res.ok) {
              let errText = 'خطأ في الإنشاء';
              try {
                const err = await res.json();
                errText = err.error || err.message || errText;
              } catch (_) {}
              announce('تعذر إنشاء المجلد: ' + errText);
              return;
            }
            try {
              const resData = await res.json();
              if (resData && resData.path) targetPath = resData.path;
            } catch (_) {}

            // Set newly created project as active workspace
            await fetchApi('/api/fs/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: targetPath })
            });

            if (filesDialog && typeof filesDialog.close === 'function') filesDialog.close();
            onSelectProject(targetPath);
            updateActiveProjectLabel(targetPath);
            if (aiInput) {
              aiInput.value = 'أنا أعمل الآن في مجلد المشروع الجديد: ' + targetPath;
              if (typeof aiInput.focus === 'function') aiInput.focus();
            }
            announce('أُنشئ المجلد وعُين كمشروع نشط للعمل: ' + cleanName);
            playSuccessChime();
          } catch (err) {
            announce('حدث خطأ أثناء إنشاء المشروع');
          }
        }

        if (btnSubmitCreateProj) {
          btnSubmitCreateProj.addEventListener('click', submitNewProject);
        }

        inputNewProjName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitNewProject();
          } else if (e.key === 'Escape') {
            newProjPanel.style.display = 'none';
            if (typeof btnCreateProj.focus === 'function') btnCreateProj.focus();
          }
        });
      }

      // Set active project handler
      const btnSetActiveProj = doc ? doc.getElementById('btn-set-active-project') : null;
      if (btnSetActiveProj) {
        btnSetActiveProj.addEventListener('click', async () => {
          announce('جارٍ تعيين ' + currentDir + ' كمشروع نشط...');
          try {
            const selected = await fetchApi('/api/fs/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: currentDir })
            });
            if (!selected.ok) {
              let errText = 'خطأ في التعيين';
              try {
                const err = await selected.json();
                errText = err.error || err.message || errText;
              } catch (_) {}
              announce('تعذر تعيين المشروع: ' + errText);
              return;
            }
            if (filesDialog && typeof filesDialog.close === 'function') filesDialog.close();
            onSelectProject(currentDir);
            updateActiveProjectLabel(currentDir);
            announce('تم تعيين مجلد العمل النشط بنجاح: ' + currentDir);
            playSuccessChime();
            if (aiInput && typeof aiInput.focus === 'function') aiInput.focus();
          } catch (err) {
            announce('حدث خطأ أثناء تعيين المشروع');
          }
        });
      }
    }

    async function openFileContent(filePath) {
      currentActiveFilePath = filePath;
      const fileName = filePath.split('/').pop() || filePath;
      if (filesListContainer) filesListContainer.style.display = 'none';
      if (fileViewerContainer) fileViewerContainer.style.display = 'block';
      if (fileViewerTitle) fileViewerTitle.textContent = '📄 ' + fileName;
      if (fileViewerContent) fileViewerContent.textContent = 'جارٍ تحميل محتوى الملف...';
      announce('جارٍ فتح ملف ' + fileName);

      try {
        const res = await fetchApi('/api/fs/read?path=' + encodeURIComponent(filePath));
        const data = await res.json();
        currentActiveFilePath = data.path || filePath;
        if (fileViewerTitle) fileViewerTitle.textContent = '📄 ' + (data.name || fileName);
        if (data.is_error || !res.ok) {
          if (fileViewerContent) {
            fileViewerContent.textContent = '⚠️ ' + (data.error || 'الملف ثنائي أو كبير أو لا يمكن عرضه كنص مباشر.\nيمكنك نسخ مساره أو الضغط على (أرسل للمحادثة) للتعامل معه برمجياً.') + '\n\nالمسار الكامل:\n' + currentActiveFilePath;
          }
        } else {
          if (fileViewerContent) {
            fileViewerContent.textContent = data.content || '(الملف فارغ)';
          }
        }
        announce('تم عرض الملف: ' + fileName);
        playBeep(700, 0.08);
      } catch (e) {
        if (fileViewerContent) {
          fileViewerContent.textContent = 'المسار الكامل:\n' + filePath + '\n\n(تعذر قراءة النص المباشر؛ يمكنك استخدام زر أرسل للمحادثة لإرسال المسار للوكيل)';
        }
        announce('تم عرض مسار الملف: ' + fileName);
      }
    }

    // Auto-bind if doc is present
    if (doc) {
      bindDom(doc);
    }

    return {
      bindDom: bindDom,
      updateActiveProjectLabel: updateActiveProjectLabel,
      loadDirectory: loadDirectory,
      renderFilesList: renderFilesList,
      openFileContent: openFileContent,
      getState: function () {
        return {
          currentExplorerDir: currentExplorerDir,
          currentActiveFilePath: currentActiveFilePath,
          showHiddenFiles: showHiddenFiles,
          lastKnownStorages: lastKnownStorages
        };
      }
    };
  }

  return {
    createFileExplorerManager: createFileExplorerManager
  };
});
