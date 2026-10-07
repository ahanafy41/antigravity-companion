// ==============================================================================
// File Explorer & Workspace Project Manager
// Accessible tree navigation, directory browsing & file content viewer
// ==============================================================================

const filesDialog = document.getElementById('files-dialog');
const btnOpenFiles = document.getElementById('btn-open-files');
const btnOpenFilesBottom = document.getElementById('btn-open-files-bottom');
const btnCloseFiles = document.getElementById('btn-close-files');
const btnCloseFilesTop = document.getElementById('btn-close-files-top');
const filesListContainer = document.getElementById('files-list-container');
const fileViewerContainer = document.getElementById('file-viewer-container');
const fileViewerContent = document.getElementById('file-viewer-content');
const fileViewerTitle = document.getElementById('file-viewer-title');
const btnBackToFiles = document.getElementById('btn-back-to-files');

    // ==========================================================================
    // File Explorer Modal
    // ==========================================================================
    async function loadDirectory(path) {
      try {
        const url = '/api/fs/list' + (path ? '?path=' + encodeURIComponent(path) : '');
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          renderFilesList(data.current_dir, data.items || [], data.parent_dir);
        }
      } catch(e) {
        announce('تعذر تحميل الملفات');
      }
    }

    function renderFilesList(currentDir, items, parentDir) {
      if (!filesListContainer) return;
      fileViewerContainer.style.display = 'none';
      filesListContainer.style.display = 'block';

      let html = '<div class="files-nav-bar" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-main);">';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/data/data/com.termux/files/home" aria-label="الانتقال إلى مجلد تيرماكس الرئيسي">🏠 تيرماكس</button>';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/storage/emulated/0" aria-label="الانتقال إلى ذاكرة الهاتف الداخلية">📱 الذاكرة</button>';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/storage/emulated/0/Download" aria-label="الانتقال إلى التنزيلات">📥 التنزيلات</button>';
      if (parentDir) {
        html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="' + parentDir + '" aria-label="الصعود للمجلد الأعلى">⬆️ لأعلى</button>';
      }
      html += '<button type="button" id="btn-create-new-project" class="btn btn-sm btn-primary" aria-label="إنشاء مشروع أو مجلد جديد هنا">➕ مشروع جديد</button>';
      html += '<button type="button" id="btn-set-active-project" class="btn btn-sm" style="background:#16261d; color:var(--accent-green); border-color:var(--accent-green);" aria-label="تعيين هذا المجلد كمشروع العمل النشط للوكيل">🎯 تعيين كمشروع نشط</button>';
      html += '</div>';

      html += '<div id="new-project-panel" style="display:none; background:#162230; border:1px solid var(--accent-cyan); border-radius:8px; padding:10px; margin-bottom:10px;" role="region" aria-label="نموذج إنشاء مشروع جديد">' +
        '<label for="input-new-project-name" style="display:block; font-size:0.9rem; font-weight:700; margin-bottom:6px; color:var(--text-main);">اسم المشروع أو المجلد الجديد:</label>' +
        '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
          '<input type="text" id="input-new-project-name" class="ai-prompt-input" style="flex:1; min-width:170px; min-height:40px; padding:6px 10px;" placeholder="اكتب اسم المشروع هنا" aria-label="اسم المشروع أو المجلد الجديد">' +
          '<button type="button" id="btn-submit-create-proj" class="btn btn-sm btn-primary" aria-label="تأكيد إنشاء المشروع">إنشاء وتعيين</button>' +
          '<button type="button" id="btn-cancel-create-proj" class="btn btn-sm" aria-label="إلغاء إنشاء المشروع">إلغاء</button>' +
        '</div>' +
      '</div>';

      html += '<div class="files-header-path" style="font-size:0.88rem; margin-bottom:8px; color:var(--accent-cyan); word-break:break-all;">المسار: <code>' + currentDir + '</code></div>';
      html += '<ul class="files-list" role="list">';

      if (items.length === 0) {
        html += '<li style="padding:12px; text-align:center; color:var(--text-muted);">المجلد فارغ</li>';
      }

      items.forEach(item => {
        const icon = item.is_dir ? '📁' : '📄';
        html += '<li class="file-item" role="listitem">' +
          '<button type="button" class="btn-file-open" data-path="' + item.path + '" data-isdir="' + (item.is_dir ? '1' : '0') + '" aria-label="' + (item.is_dir ? 'مجلد ' : 'ملف ') + item.name + '">' +
            '<span>' + icon + ' ' + item.name + '</span>' +
            '<span class="file-meta">' + (item.is_dir ? 'مجلد' : Math.round(item.size / 1024) + ' KB') + '</span>' +
          '</button>' +
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

      const btnCreateProj = document.getElementById('btn-create-new-project');
      const newProjPanel = document.getElementById('new-project-panel');
      const inputNewProjName = document.getElementById('input-new-project-name');
      const btnSubmitCreateProj = document.getElementById('btn-submit-create-proj');
      const btnCancelCreateProj = document.getElementById('btn-cancel-create-proj');

      if (btnCreateProj && newProjPanel && inputNewProjName) {
        btnCreateProj.addEventListener('click', () => {
          newProjPanel.style.display = 'block';
          inputNewProjName.value = '';
          inputNewProjName.focus();
          announce('اكتب اسم المشروع أو المجلد الجديد ثم اضغط إنشاء وتعيين');
        });

        if (btnCancelCreateProj) {
          btnCancelCreateProj.addEventListener('click', () => {
            newProjPanel.style.display = 'none';
            btnCreateProj.focus();
            announce('تم إلغاء إنشاء المشروع');
          });
        }

        async function submitNewProject() {
          const rawName = inputNewProjName.value.trim();
          if (!rawName) {
            announce('يرجى كتابة اسم المشروع أولاً');
            inputNewProjName.focus();
            return;
          }
          const cleanName = rawName.replace(new RegExp('[\\\\/:*?"<>|]', 'g'), '_');
          announce('جارٍ إنشاء المشروع ' + cleanName + '...');
          try {
            const res = await fetch('/api/fs/mkdir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parent_dir: currentDir, name: cleanName })
            });
            let targetPath = currentDir + (currentDir.endsWith('/') ? '' : '/') + cleanName;
            if (res.ok) {
              const resData = await res.json();
              if (resData && resData.path) targetPath = resData.path;
            }
            if (filesDialog) filesDialog.close();
            if (aiInput) {
              aiInput.value = 'اعتبر المجلد ' + targetPath + ' هو مجلد المشروع النشط للعمل.';
              aiInput.focus();
            }
            announce('تم إنشاء المشروع بنجاح وتعيينه كمجلد العمل النشط: ' + cleanName);
            playSuccessChime();
          } catch(err) {
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
            btnCreateProj.focus();
          }
        });
      }

      const btnSetActiveProj = document.getElementById('btn-set-active-project');
      if (btnSetActiveProj) {
        btnSetActiveProj.addEventListener('click', () => {
          if (filesDialog) filesDialog.close();
          if (aiInput) {
            aiInput.value = 'اعتبر المجلد ' + currentDir + ' هو مجلد المشروع النشط للعمل.';
            aiInput.focus();
            announce('تم تعيين ' + currentDir + ' كمجلد المشروع النشط');
            playSuccessChime();
          }
        });
      }
    }

    let currentActiveFilePath = '';

    async function openFileContent(filePath) {
      try {
        const res = await fetch('/api/fs/read?path=' + encodeURIComponent(filePath));
        if (res.ok) {
          const data = await res.json();
          currentActiveFilePath = data.path || filePath;
          filesListContainer.style.display = 'none';
          fileViewerContainer.style.display = 'block';
          fileViewerTitle.textContent = '📄 ' + data.name;
          fileViewerContent.textContent = data.content || '(الملف فارغ)';
          announce('تم فتح محتوى الملف: ' + data.name);
          playBeep(700, 0.08);
        }
      } catch(e) {
        announce('تعذر قراءة محتوى الملف');
      }
    }

    const btnSendFileToPrompt = document.getElementById('btn-send-file-to-prompt');
    const btnCopyFilePath = document.getElementById('btn-copy-file-path');

    if (btnSendFileToPrompt) {
      btnSendFileToPrompt.addEventListener('click', () => {
        if (!currentActiveFilePath) return;
        if (filesDialog) filesDialog.close();
        if (aiInput) {
          const fileName = currentActiveFilePath.split('/').pop() || currentActiveFilePath;
          aiInput.value = (aiInput.value ? aiInput.value + ' ' : '') + currentActiveFilePath;
          aiInput.focus();
          announce('تم إدراج مسار الملف ' + fileName + ' في حقل طلب الوكيل');
          playSuccessChime();
        }
      });
    }

    if (btnCopyFilePath) {
      btnCopyFilePath.addEventListener('click', () => {
        if (!currentActiveFilePath) return;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(currentActiveFilePath).then(() => {
            playBeep(880, 0.08);
            announce('تم نسخ مسار الملف الكامل');
            btnCopyFilePath.textContent = '✓ تم النسخ';
            setTimeout(() => { btnCopyFilePath.textContent = '📋 نسخ المسار'; }, 2000);
          });
        }
      });
    }

    if (filesListContainer) {
      filesListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-file-open');
        if (btn) {
          const path = btn.getAttribute('data-path');
          const isDir = btn.getAttribute('data-isdir') === '1';
          if (isDir) {
            loadDirectory(path);
          } else {
            openFileContent(path);
          }
        }
      });
    }

    if (btnBackToFiles) {
      btnBackToFiles.addEventListener('click', () => {
        fileViewerContainer.style.display = 'none';
        filesListContainer.style.display = 'block';
      });
    }

    if (filesDialog) {
      const openFilesModal = async () => {
        await loadDirectory();
        filesDialog.showModal();
        announce('تم فتح مستعرض ملفات المشروع');
      };
      if (btnOpenFiles) btnOpenFiles.addEventListener('click', openFilesModal);
      if (btnOpenFilesBottom) btnOpenFilesBottom.addEventListener('click', openFilesModal);
    }
    if (btnCloseFiles && filesDialog) {
      btnCloseFiles.addEventListener('click', () => filesDialog.close());
    }
    if (btnCloseFilesTop && filesDialog) {
      btnCloseFilesTop.addEventListener('click', () => filesDialog.close());
    }


// Global exports
window.loadDirectory = loadDirectory;
window.renderFilesList = renderFilesList;
window.openFileContent = openFileContent;
