/**
 * Antigravity Companion App - Artifacts & Project Files Controller
 * Clean Architecture Modular Engine
 *
 * Provides accessible file inspection, modal viewers for markdown documents, code,
 * audio, video, and images, as well as project directory browsing and interactive plan approvals.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArtifactsViewer = factory();
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

  const FILE_TYPE_MAP = {
    'md': { icon: '📄', label: 'مستند Markdown', isMd: true, lang: 'markdown', mime: 'text/markdown' },
    'markdown': { icon: '📄', label: 'مستند Markdown', isMd: true, lang: 'markdown', mime: 'text/markdown' },
    'py': { icon: '🐍', label: 'كود بايثون', isMd: false, lang: 'python', mime: 'text/x-python' },
    'js': { icon: '💻', label: 'كود جافاسكريبت', isMd: false, lang: 'javascript', mime: 'application/javascript' },
    'cjs': { icon: '💻', label: 'كود جافاسكريبت CJS', isMd: false, lang: 'javascript', mime: 'application/javascript' },
    'mjs': { icon: '💻', label: 'كود جافاسكريبت MJS', isMd: false, lang: 'javascript', mime: 'application/javascript' },
    'ts': { icon: '💻', label: 'كود تايب سكريبت', isMd: false, lang: 'typescript', mime: 'application/typescript' },
    'json': { icon: '⚙️', label: 'بيانات JSON', isMd: false, lang: 'json', mime: 'application/json' },
    'sh': { icon: '📜', label: 'سكربت Bash', isMd: false, lang: 'bash', mime: 'text/x-sh' },
    'bash': { icon: '📜', label: 'سكربت Bash', isMd: false, lang: 'bash', mime: 'text/x-sh' },
    'lua': { icon: '🌙', label: 'سكربت Lua', isMd: false, lang: 'lua', mime: 'text/x-lua' },
    'java': { icon: '☕', label: 'كود Java', isMd: false, lang: 'java', mime: 'text/x-java-source' },
    'kt': { icon: '☕', label: 'كود Kotlin', isMd: false, lang: 'kotlin', mime: 'text/x-kotlin' },
    'html': { icon: '🌐', label: 'صفحة HTML', isMd: false, lang: 'html', mime: 'text/html' },
    'css': { icon: '🎨', label: 'تنسيقات CSS', isMd: false, lang: 'css', mime: 'text/css' },
    'txt': { icon: '📄', label: 'ملف نصي', isMd: false, lang: 'text', mime: 'text/plain' },
    'xml': { icon: '📑', label: 'ملف XML', isMd: false, lang: 'xml', mime: 'text/xml' },
    'gradle': { icon: '🐘', label: 'ملف Gradle', isMd: false, lang: 'groovy', mime: 'text/plain' },
    'yml': { icon: '⚙️', label: 'إعدادات YAML', isMd: false, lang: 'yaml', mime: 'text/yaml' },
    'yaml': { icon: '⚙️', label: 'إعدادات YAML', isMd: false, lang: 'yaml', mime: 'text/yaml' },
    'toml': { icon: '⚙️', label: 'إعدادات TOML', isMd: false, lang: 'toml', mime: 'text/plain' },
    'sql': { icon: '🗄️', label: 'استعلامات SQL', isMd: false, lang: 'sql', mime: 'text/plain' },
    // Audio formats
    'wav': { icon: '🎧', label: 'مقطع صوتي (WAV)', isMedia: true, category: 'audio', mime: 'audio/wav' },
    'mp3': { icon: '🎧', label: 'مقطع صوتي (MP3)', isMedia: true, category: 'audio', mime: 'audio/mpeg' },
    'ogg': { icon: '🎧', label: 'مقطع صوتي (OGG)', isMedia: true, category: 'audio', mime: 'audio/ogg' },
    'm4a': { icon: '🎧', label: 'مقطع صوتي (M4A)', isMedia: true, category: 'audio', mime: 'audio/mp4' },
    'aac': { icon: '🎧', label: 'مقطع صوتي (AAC)', isMedia: true, category: 'audio', mime: 'audio/aac' },
    'flac': { icon: '🎧', label: 'مقطع صوتي (FLAC)', isMedia: true, category: 'audio', mime: 'audio/flac' },
    'opus': { icon: '🎧', label: 'مقطع صوتي (Opus)', isMedia: true, category: 'audio', mime: 'audio/opus' },
    // Video formats
    'mp4': { icon: '🎬', label: 'مقطع فيديو (MP4)', isMedia: true, category: 'video', mime: 'video/mp4' },
    'webm': { icon: '🎬', label: 'مقطع فيديو (WebM)', isMedia: true, category: 'video', mime: 'video/webm' },
    'mkv': { icon: '🎬', label: 'مقطع فيديو (MKV)', isMedia: true, category: 'video', mime: 'video/x-matroska' },
    'mov': { icon: '🎬', label: 'مقطع فيديو (MOV)', isMedia: true, category: 'video', mime: 'video/quicktime' },
    // Image formats
    'png': { icon: '🖼️', label: 'صورة (PNG)', isMedia: true, category: 'image', mime: 'image/png' },
    'jpg': { icon: '🖼️', label: 'صورة (JPG)', isMedia: true, category: 'image', mime: 'image/jpeg' },
    'jpeg': { icon: '🖼️', label: 'صورة (JPEG)', isMedia: true, category: 'image', mime: 'image/jpeg' },
    'gif': { icon: '🖼️', label: 'صورة متحركة (GIF)', isMedia: true, category: 'image', mime: 'image/gif' },
    'webp': { icon: '🖼️', label: 'صورة (WebP)', isMedia: true, category: 'image', mime: 'image/webp' },
    'svg': { icon: '🖼️', label: 'رسم متجهي (SVG)', isMedia: true, category: 'image', mime: 'image/svg+xml' },
    'bmp': { icon: '🖼️', label: 'صورة (BMP)', isMedia: true, category: 'image', mime: 'image/bmp' },
    'ico': { icon: '🖼️', label: 'أيقونة (ICO)', isMedia: true, category: 'image', mime: 'image/x-icon' },
  };

  function getFileInfo(filename) {
    const ext = ((filename || '').split('.').pop() || '').toLowerCase();
    return FILE_TYPE_MAP[ext] || { icon: '📄', label: ext ? `${ext.toUpperCase()} ملف` : 'ملف نصي', isMd: false, lang: 'text', mime: 'text/plain' };
  }

  function createArtifactsViewer(options) {
    const opts = options || {};
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const escapeHtml = opts.escapeHtml || defaultEscapeHtml;
    const announce = opts.announce || function (msg) {
      if (typeof console !== 'undefined') console.log('[Announce]', msg);
    };
    const playBeep = opts.playBeep || function () {};
    const playSuccessChime = opts.playSuccessChime || function () {};
    const fetchApi = opts.fetchApi || (typeof window !== 'undefined' && window.mainV1Fetch ? window.mainV1Fetch : (typeof fetch !== 'undefined' ? fetch : null));
    const renderMarkdown = opts.renderMarkdown || function (s) { return s; };
    const sendAiPrompt = opts.sendAiPrompt || function () {};
    const getCurrentConversationId = opts.getCurrentConversationId || function () { return ''; };

    const knownArtifacts = opts.knownArtifacts || new Map();
    const knownProjectFiles = opts.knownProjectFiles || new Map();
    let currentViewerArtifact = null;
    let artifactViewerRequestId = 0;
    let currentProjectBrowserDir = '';
    let currentProjectParentDir = '';

    // DOM Elements
    let headerArtifactsBadge = null;
    let valArtifactsCountDrawer = null;
    let btnHeaderArtifacts = null;
    let btnOpenArtifactsDrawer = null;
    let artifactsDialog = null;
    let btnCloseArtifacts = null;
    let btnCloseArtifactsTop = null;
    let artifactsListContainer = null;
    let projectSessionFilesList = null;
    let projectBrowserItems = null;
    let projectBrowserCurrentPath = null;
    let btnBrowserGoUp = null;
    let btnRefreshProjectBrowser = null;
    let tabBtnArtifacts = null;
    let tabBtnProjectFiles = null;
    let tabPanelArtifacts = null;
    let tabPanelProjectFiles = null;
    let tabArtifactsCount = null;
    let tabProjectFilesCount = null;
    let sessionFilesCountBadge = null;

    let artifactViewerDialog = null;
    let btnCloseViewer = null;
    let btnCloseViewerTop = null;
    let artifactViewerTitle = null;
    let artifactViewerTypeBadge = null;
    let artifactViewerSizeBadge = null;
    let artifactViewerPath = null;
    let artifactViewerSummary = null;
    let artifactViewerContent = null;
    let btnViewerProceed = null;
    let btnCopyArtifactContent = null;
    let btnDownloadArtifact = null;
    let btnCopyViewerPath = null;
    let btnSendViewerToPrompt = null;
    let aiInput = null;

    function bindDom(customDoc) {
      const d = customDoc || doc;
      if (!d) return;

      headerArtifactsBadge = d.getElementById('header-artifacts-badge');
      valArtifactsCountDrawer = d.getElementById('val-artifacts-count-drawer');
      btnHeaderArtifacts = d.getElementById('btn-header-artifacts');
      btnOpenArtifactsDrawer = d.getElementById('btn-open-artifacts-drawer');
      artifactsDialog = d.getElementById('artifacts-dialog');
      btnCloseArtifacts = d.getElementById('btn-close-artifacts');
      btnCloseArtifactsTop = d.getElementById('btn-close-artifacts-top');
      artifactsListContainer = d.getElementById('artifacts-list-container');
      projectSessionFilesList = d.getElementById('project-session-files-list');
      projectBrowserItems = d.getElementById('project-browser-items');
      projectBrowserCurrentPath = d.getElementById('project-browser-current-path');
      btnBrowserGoUp = d.getElementById('btn-browser-go-up');
      btnRefreshProjectBrowser = d.getElementById('btn-refresh-project-browser');
      tabBtnArtifacts = d.getElementById('tab-btn-artifacts');
      tabBtnProjectFiles = d.getElementById('tab-btn-project-files');
      tabPanelArtifacts = d.getElementById('tab-panel-artifacts');
      tabPanelProjectFiles = d.getElementById('tab-panel-project-files');
      tabArtifactsCount = d.getElementById('tab-artifacts-count');
      tabProjectFilesCount = d.getElementById('tab-project-files-count');
      sessionFilesCountBadge = d.getElementById('session-files-count-badge');

      artifactViewerDialog = d.getElementById('artifact-viewer-dialog');
      btnCloseViewer = d.getElementById('btn-close-viewer');
      btnCloseViewerTop = d.getElementById('btn-close-viewer-top');
      artifactViewerTitle = d.getElementById('artifact-viewer-title');
      artifactViewerTypeBadge = d.getElementById('artifact-viewer-type-badge');
      artifactViewerSizeBadge = d.getElementById('artifact-viewer-size-badge');
      artifactViewerPath = d.getElementById('artifact-viewer-path');
      artifactViewerSummary = d.getElementById('artifact-viewer-summary');
      artifactViewerContent = d.getElementById('artifact-viewer-content');
      btnViewerProceed = d.getElementById('btn-viewer-proceed');
      btnCopyArtifactContent = d.getElementById('btn-copy-artifact-content');
      btnDownloadArtifact = d.getElementById('btn-download-artifact');
      btnCopyViewerPath = d.getElementById('btn-copy-viewer-path');
      btnSendViewerToPrompt = d.getElementById('btn-send-viewer-to-prompt');
      aiInput = d.getElementById('ai-prompt-input');

      // Bind dialog open/close
      if (btnHeaderArtifacts && artifactsDialog) {
        btnHeaderArtifacts.addEventListener('click', async () => {
          if (typeof artifactsDialog.showModal === 'function') artifactsDialog.showModal();
          announce('تم فتح نافذة المستندات وملفات المشروع');
          await loadArtifactsList();
        });
      }

      if (btnOpenArtifactsDrawer && artifactsDialog) {
        btnOpenArtifactsDrawer.addEventListener('click', async () => {
          const drawer = d.getElementById('antigravity-drawer');
          if (drawer && typeof drawer.close === 'function') drawer.close();
          if (typeof artifactsDialog.showModal === 'function') artifactsDialog.showModal();
          announce('تم فتح نافذة المستندات وملفات المشروع');
          await loadArtifactsList();
        });
      }

      if (btnCloseArtifacts && artifactsDialog) {
        btnCloseArtifacts.addEventListener('click', () => {
          if (typeof artifactsDialog.close === 'function') artifactsDialog.close();
        });
      }
      if (btnCloseArtifactsTop && artifactsDialog) {
        btnCloseArtifactsTop.addEventListener('click', () => {
          if (typeof artifactsDialog.close === 'function') artifactsDialog.close();
        });
      }

      if (btnCloseViewer && artifactViewerDialog) {
        btnCloseViewer.addEventListener('click', () => {
          if (typeof artifactViewerDialog.close === 'function') artifactViewerDialog.close();
        });
      }
      if (btnCloseViewerTop && artifactViewerDialog) {
        btnCloseViewerTop.addEventListener('click', () => {
          if (typeof artifactViewerDialog.close === 'function') artifactViewerDialog.close();
        });
      }

      // Tab switching handlers
      if (tabBtnArtifacts && tabBtnProjectFiles) {
        tabBtnArtifacts.addEventListener('click', () => {
          tabBtnArtifacts.classList.add('active');
          tabBtnArtifacts.setAttribute('aria-selected', 'true');
          tabBtnArtifacts.style.background = 'var(--accent-purple)';
          tabBtnArtifacts.style.color = '#fff';

          tabBtnProjectFiles.classList.remove('active');
          tabBtnProjectFiles.setAttribute('aria-selected', 'false');
          tabBtnProjectFiles.style.background = 'var(--bg-card)';
          tabBtnProjectFiles.style.color = 'var(--text-main)';

          if (tabPanelArtifacts) tabPanelArtifacts.style.display = 'block';
          if (tabPanelProjectFiles) tabPanelProjectFiles.style.display = 'none';
          announce('تبويب وثائق وخطط العمل');
        });

        tabBtnProjectFiles.addEventListener('click', () => {
          tabBtnProjectFiles.classList.add('active');
          tabBtnProjectFiles.setAttribute('aria-selected', 'true');
          tabBtnProjectFiles.style.background = 'var(--accent-purple)';
          tabBtnProjectFiles.style.color = '#fff';

          tabBtnArtifacts.classList.remove('active');
          tabBtnArtifacts.setAttribute('aria-selected', 'false');
          tabBtnArtifacts.style.background = 'var(--bg-card)';
          tabBtnArtifacts.style.color = 'var(--text-main)';

          if (tabPanelArtifacts) tabPanelArtifacts.style.display = 'none';
          if (tabPanelProjectFiles) tabPanelProjectFiles.style.display = 'block';
          announce('تبويب ملفات وتعديلات المشروع ومستكشف مساحة العمل');

          if (!currentProjectBrowserDir) {
            loadProjectBrowserDirectory('');
          }
        });
      }

      if (btnBrowserGoUp) {
        btnBrowserGoUp.addEventListener('click', () => {
          if (currentProjectParentDir && currentProjectParentDir !== currentProjectBrowserDir) {
            loadProjectBrowserDirectory(currentProjectParentDir);
          }
        });
      }

      if (btnRefreshProjectBrowser) {
        btnRefreshProjectBrowser.addEventListener('click', () => {
          loadProjectBrowserDirectory(currentProjectBrowserDir || '');
        });
      }

      if (btnCopyViewerPath) {
        btnCopyViewerPath.addEventListener('click', () => {
          if (!currentViewerArtifact || !currentViewerArtifact.path) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentViewerArtifact.path).then(() => {
              playBeep(880, 0.08);
              announce('تم نسخ مسار الملف بالكامل');
              btnCopyViewerPath.textContent = '✓ تم النسخ';
              setTimeout(() => { btnCopyViewerPath.textContent = '📋 نسخ المسار'; }, 2000);
            });
          }
        });
      }

      if (btnSendViewerToPrompt) {
        btnSendViewerToPrompt.addEventListener('click', () => {
          if (!currentViewerArtifact) return;
          const p = currentViewerArtifact.path || currentViewerArtifact.name;
          if (artifactViewerDialog && typeof artifactViewerDialog.close === 'function') artifactViewerDialog.close();
          if (aiInput && p) {
            aiInput.value = (aiInput.value ? aiInput.value + ' ' : '') + p;
            if (typeof aiInput.focus === 'function') aiInput.focus();
            playSuccessChime();
            announce('تم إدراج مسار الملف في طلب الوكيل');
          }
        });
      }

      if (btnCopyArtifactContent) {
        btnCopyArtifactContent.addEventListener('click', async () => {
          if (!currentViewerArtifact || !currentViewerArtifact.content) return;
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(currentViewerArtifact.content);
            }
            playBeep(880, 0.1);
            announce('تم نسخ محتوى الملف كاملاً إلى الحافظة');
          } catch (err) {
            announce('تعذر النسخ: ' + err.message);
          }
        });
      }

      if (btnViewerProceed) {
        btnViewerProceed.addEventListener('click', () => {
          if (artifactViewerDialog && typeof artifactViewerDialog.close === 'function') artifactViewerDialog.close();
          playBeep(880, 0.1);
          announce('تمت الموافقة، جارٍ بدء تنفيذ الخطة وفقاً للتوثيق...');
          sendAiPrompt('موافق، تابع التنفيذ وفقاً للخطة الموضوعة.');
        });
      }

      if (btnDownloadArtifact) {
        btnDownloadArtifact.addEventListener('click', () => {
          if (!currentViewerArtifact || !currentViewerArtifact.content) return;
          try {
            const info = currentViewerArtifact.fileInfo || getFileInfo(currentViewerArtifact.name || 'file.txt');
            const blob = new Blob([currentViewerArtifact.content], { type: (info.mime || 'text/plain') + ';charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = d.createElement('a');
            a.href = url;
            a.download = currentViewerArtifact.name || 'document.txt';
            d.body.appendChild(a);
            a.click();
            d.body.removeChild(a);
            URL.revokeObjectURL(url);
            playBeep(880, 0.1);
            announce('تم بدء تنزيل الملف');
          } catch (e) {
            announce('تعذر تنزيل الملف: ' + e.message);
          }
        });
      }
    }

    function updateArtifactsUI(count) {
      const cnt = count !== undefined ? count : (knownArtifacts.size + knownProjectFiles.size);
      if (headerArtifactsBadge) headerArtifactsBadge.textContent = cnt;
      if (valArtifactsCountDrawer) valArtifactsCountDrawer.textContent = cnt;
      if (btnHeaderArtifacts) {
        btnHeaderArtifacts.style.display = cnt > 0 ? 'inline-flex' : 'none';
        btnHeaderArtifacts.setAttribute('aria-label', `عرض المستندات وملفات المشروع (${cnt})`);
      }
    }

    async function openArtifactViewer(artName, artPath, artSummary, requestFeedback, artConversationId) {
      if (!artifactViewerDialog) return;
      artName = (artName || '').trim().replace(/^["']|["']$/g, '');
      artPath = (artPath || '').trim().replace(/^["']|["']$/g, '');
      artConversationId = (artConversationId || '').trim().replace(/^["']|["']$/g, '');
      const fileInfo = getFileInfo(artName || artPath);

      currentViewerArtifact = {
        name: artName,
        path: artPath,
        summary: artSummary,
        requestFeedback: requestFeedback,
        conversation_id: artConversationId,
        fileInfo: fileInfo
      };

      if (artifactViewerTitle) artifactViewerTitle.textContent = `${fileInfo.icon} ${artName || 'عرض الملف'}`;
      if (artifactViewerTypeBadge) {
        artifactViewerTypeBadge.textContent = fileInfo.label;
        artifactViewerTypeBadge.style.display = 'inline-block';
      }
      if (artifactViewerSizeBadge) artifactViewerSizeBadge.textContent = '';
      if (artifactViewerPath) {
        artifactViewerPath.textContent = artPath || '';
        artifactViewerPath.title = artPath || '';
      }
      if (artifactViewerSummary) {
        artifactViewerSummary.textContent = artSummary || '';
        artifactViewerSummary.style.display = artSummary ? 'block' : 'none';
      }
      if (artifactViewerContent) {
        artifactViewerContent.innerHTML = '<p>⏳ جاري تحميل محتوى الملف...</p>';
      }

      if (btnViewerProceed) {
        btnViewerProceed.style.display = requestFeedback ? 'inline-flex' : 'none';
      }

      if (typeof artifactViewerDialog.showModal === 'function') artifactViewerDialog.showModal();
      announce(`تم فتح: ${artName}`);

      // Modular Media Viewer Hook (Images, Audio, Video)
      const fInfo = getFileInfo(artName || artPath || '');
      const mediaCheck = (typeof window !== 'undefined' && window.MediaViewer) ? window.MediaViewer.isMediaFile(artName || artPath) : null;
      const isMedia = Boolean(fInfo.isMedia || (mediaCheck && mediaCheck.isMedia));
      const mediaCategory = (mediaCheck && mediaCheck.category) || fInfo.category || 'audio';

      if (isMedia) {
        if (artifactViewerContent) {
          if (typeof window !== 'undefined' && window.MediaViewer && typeof window.MediaViewer.render === 'function') {
            window.MediaViewer.render(artifactViewerContent, {
              name: artName,
              path: artPath,
              conversation_id: artConversationId || getCurrentConversationId() || '',
              category: mediaCategory,
              summary: artSummary
            });
          } else {
            const rawUrl = `/api/v1/files/raw?name=${encodeURIComponent(artName || '')}&path=${encodeURIComponent(artPath || '')}&conversation_id=${encodeURIComponent(artConversationId || getCurrentConversationId() || '')}`;
            if (mediaCategory === 'audio') {
              artifactViewerContent.innerHTML = `
                <div style="padding:16px; background:var(--bg-card); border-radius:10px; display:flex; flex-direction:column; gap:12px;">
                  <strong style="color:var(--accent-purple); font-size:1.05rem;">🎧 ${escapeHtml(artName)}</strong>
                  <audio controls autoplay style="width:100%; border-radius:6px;" src="${rawUrl}" aria-label="مشغل الصوت: ${escapeHtml(artName)}"></audio>
                  <div style="display:flex; justify-content:flex-end;">
                    <a href="${rawUrl}" download="${escapeHtml(artName)}" class="btn btn-sm" style="color:var(--accent-cyan); text-decoration:none; padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px;">⬇️ تنزيل الملف</a>
                  </div>
                </div>
              `;
            } else if (mediaCategory === 'video') {
              artifactViewerContent.innerHTML = `
                <div style="padding:16px; background:var(--bg-card); border-radius:10px; display:flex; flex-direction:column; gap:12px;">
                  <strong style="color:var(--accent-cyan); font-size:1.05rem;">🎬 ${escapeHtml(artName)}</strong>
                  <video controls autoplay style="width:100%; max-height:60vh; border-radius:6px; background:#000;" src="${rawUrl}" aria-label="مشغل الفيديو: ${escapeHtml(artName)}"></video>
                  <div style="display:flex; justify-content:flex-end;">
                    <a href="${rawUrl}" download="${escapeHtml(artName)}" class="btn btn-sm" style="color:var(--accent-cyan); text-decoration:none; padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px;">⬇️ تنزيل الفيديو</a>
                  </div>
                </div>
              `;
            } else {
              artifactViewerContent.innerHTML = `
                <div style="padding:16px; text-align:center;">
                  <img src="${rawUrl}" alt="${escapeHtml(artName)}" style="max-width:100%; max-height:70vh; border-radius:8px;" />
                </div>
              `;
            }
          }
        }
        return;
      }

      const currentReqId = ++artifactViewerRequestId;
      try {
        const cid = artConversationId || getCurrentConversationId() || '';
        const params = new URLSearchParams();
        if (artName) params.set('name', artName);
        if (cid) params.set('conversation_id', cid);
        if (artPath) params.set('path', artPath);
        const url = `/api/ai/artifacts/content?` + params.toString();
        const res = await fetchApi(url);
        if (!res.ok) throw new Error(`رمز الخطأ ${res.status}`);
        const data = await res.json();
        if (currentReqId !== artifactViewerRequestId) return;
        if (!currentViewerArtifact || (artName && currentViewerArtifact.name !== artName)) return;

        if (data.is_media) {
          if (artifactViewerContent) {
            if (typeof window !== 'undefined' && window.MediaViewer && typeof window.MediaViewer.render === 'function') {
              window.MediaViewer.render(artifactViewerContent, {
                name: data.name || artName,
                path: data.path || artPath,
                conversation_id: data.conversation_id || artConversationId || getCurrentConversationId() || '',
                category: data.media_type || (window.MediaViewer.isMediaFile(data.name || artName).category),
                summary: artSummary
              });
            } else {
              const rawUrl = `/api/v1/files/raw?name=${encodeURIComponent(data.name || artName || '')}&path=${encodeURIComponent(data.path || artPath || '')}&conversation_id=${encodeURIComponent(data.conversation_id || artConversationId || getCurrentConversationId() || '')}`;
              const cat = data.media_type || 'audio';
              if (cat === 'audio') {
                artifactViewerContent.innerHTML = `<div style="padding:16px;"><audio controls autoplay style="width:100%;" src="${rawUrl}"></audio></div>`;
              } else if (cat === 'video') {
                artifactViewerContent.innerHTML = `<div style="padding:16px;"><video controls autoplay style="width:100%; max-height:60vh;" src="${rawUrl}"></video></div>`;
              } else {
                artifactViewerContent.innerHTML = `<div style="padding:16px; text-align:center;"><img src="${rawUrl}" alt="${escapeHtml(data.name || artName)}" style="max-width:100%; border-radius:8px;" /></div>`;
              }
            }
          }
          return;
        }

        const rawContent = data.content || '';
        currentViewerArtifact.content = rawContent;
        if (data.path && !currentViewerArtifact.path) {
          currentViewerArtifact.path = data.path;
          if (artifactViewerPath) artifactViewerPath.textContent = data.path;
        }

        const sizeKb = (data.size ? (data.size / 1024) : (new Blob([rawContent]).size / 1024)).toFixed(1);
        const lines = rawContent.split(/\r\n|\r|\n/).length;
        if (artifactViewerSizeBadge) {
          artifactViewerSizeBadge.textContent = `${sizeKb} KB • ${lines} سطر`;
        }

        const isMarkdown = Boolean(data.is_markdown || fileInfo.isMd || (artName && artName.endsWith('.md')));

        if (artifactViewerContent) {
          if (isMarkdown) {
            artifactViewerContent.innerHTML = renderMarkdown(rawContent);
          } else {
            // Render structured code container
            artifactViewerContent.innerHTML = `
              <div class="code-view-container" style="background:var(--bg-card); border:1px solid var(--border-main); border-radius:8px; overflow:hidden;">
                <div class="code-view-header" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.35); padding:8px 14px; font-size:0.85rem; color:var(--text-muted); border-bottom:1px solid var(--border-main);">
                  <span>سطور الكود: ${lines} سطر (${sizeKb} KB)</span>
                  <button type="button" class="btn btn-sm btn-copy-code" data-code="${encodeURIComponent(rawContent)}" style="padding:4px 10px; font-size:0.8rem; background:rgba(255,255,255,0.08);">📋 نسخ الكود</button>
                </div>
                <pre style="margin:0; padding:14px; overflow-x:auto; font-family:monospace; font-size:0.92rem; line-height:1.6; direction:ltr; text-align:left; white-space:pre;"><code class="language-${fileInfo.lang}">${escapeHtml(rawContent)}</code></pre>
              </div>
            `;
          }
          setTimeout(() => {
            if (typeof artifactViewerContent.focus === 'function') artifactViewerContent.focus();
          }, 50);
        }
      } catch (err) {
        if (currentReqId !== artifactViewerRequestId) return;
        if (artifactViewerContent) {
          artifactViewerContent.innerHTML = `<div style="color:var(--accent-red); padding:12px;">تعذر قراءة محتوى الملف: ${escapeHtml(err.message)}</div>`;
        }
      }
    }

    function createArtifactCard(art) {
      const card = (doc || document).createElement('div');
      card.className = 'artifact-card';

      const fInfo = getFileInfo(art.name || art.path || '');
      const mediaCheck = (typeof window !== 'undefined' && window.MediaViewer) ? window.MediaViewer.isMediaFile(art.name || art.path) : null;
      const isMedia = Boolean(fInfo.isMedia || (mediaCheck && mediaCheck.isMedia) || art.is_media);
      const mediaCategory = (mediaCheck && mediaCheck.category) || fInfo.category || art.media_type || (fInfo.mime && fInfo.mime.startsWith('audio/') ? 'audio' : (fInfo.mime && fInfo.mime.startsWith('video/') ? 'video' : 'image'));

      const typeLabel = isMedia ? (mediaCategory === 'audio' ? 'مقطع صوتي' : (mediaCategory === 'video' ? 'مقطع فيديو' : 'صورة')) : 'مستند / خطة';
      const badgeText = isMedia ? (mediaCategory === 'audio' ? '🎧 مقطع صوتي' : (mediaCategory === 'video' ? '🎬 مقطع فيديو' : '🖼️ صورة')) : 'وثيقة عمل (Artifact)';
      const icon = fInfo.icon || (mediaCategory === 'audio' ? '🎧' : (mediaCategory === 'video' ? '🎬' : (mediaCategory === 'image' ? '🖼️' : '📄')));
      const downloadUrl = isMedia && typeof window !== 'undefined' && window.MediaViewer ? window.MediaViewer.buildMediaUrl(art.path || art.name, null, art.conversation_id) : '';

      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', `${typeLabel}: ${art.name}`);
      card.style.cssText = 'background:rgba(163, 113, 247, 0.08); border:2px solid var(--accent-purple); border-radius:10px; padding:14px; margin:12px 0;';

      const summaryText = art.summary || (isMedia ? `ملف وسائط جاهز للاستماع والعرض: ${art.name}` : 'مستند تم إنشاؤه بواسطة الوكيل الذكي');
      const isFeedback = Boolean(art.requestFeedback);

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--accent-purple); font-size:1.05rem;">
            <span aria-hidden="true" style="font-size:1.3rem;">${icon}</span>
            <span>${typeLabel}: <strong class="artifact-name">${escapeHtml(art.name)}</strong></span>
          </div>
          <span class="badge" style="background:${isMedia ? 'var(--accent-cyan)' : 'var(--accent-purple)'}; color:${isMedia ? '#000' : '#fff'}; border-radius:6px; padding:2px 8px; font-size:0.8rem; font-weight:bold;">${badgeText}</span>
        </div>
        <p class="artifact-summary" style="margin:6px 0 12px 0; color:var(--text-main); font-size:0.95rem; line-height:1.6; background:rgba(0,0,0,0.35); padding:10px 12px; border-radius:6px; border-right:4px solid var(--accent-purple);">
          ${escapeHtml(summaryText)}
        </p>
        ${isMedia ? `<div class="card-media-player-container" style="margin:10px 0;"></div>` : ''}
        <div class="artifact-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-view-art" aria-label="${isMedia ? 'عرض في نافذة مستقلة' : 'فتح وقراءة المستند'} ${escapeHtml(art.name)}" style="background:var(--accent-purple); color:#fff; font-weight:bold; border-radius:6px; padding:8px 14px; cursor:pointer;">
            ${isMedia ? '🔎 عرض في نافذة مستقلة' : '📖 فتح وقراءة المستند'}
          </button>
          ${isMedia ? `
            <a class="btn btn-sm btn-download-art" href="${downloadUrl || '#'}" download="${escapeHtml(art.name)}" aria-label="تنزيل ${escapeHtml(art.name)}" style="background:var(--bg-card); color:var(--accent-cyan); border:1px solid var(--border-main); border-radius:6px; padding:8px 14px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:bold;">
              ⬇️ تنزيل الملف
            </a>
          ` : `
            <button type="button" class="btn btn-sm btn-copy-art" aria-label="نسخ محتوى المستند ${escapeHtml(art.name)}" style="background:var(--bg-card); color:var(--text-main); border:1px solid var(--border-main); border-radius:6px; padding:8px 14px; cursor:pointer;">
              📋 نسخ المحتوى
            </button>
          `}
          ${isFeedback ? `
            <button type="button" class="btn btn-sm btn-proceed-art" aria-label="موافقة ومتابعة تنفيذ الخطة (Proceed)" style="background:var(--accent-green); color:#000; font-weight:bold; border-radius:6px; padding:8px 14px; cursor:pointer;">
              🚀 موافقة ومتابعة (Proceed)
            </button>
          ` : ''}
        </div>
      `;

      if (isMedia && typeof window !== 'undefined' && window.MediaViewer) {
        const playerBox = card.querySelector('.card-media-player-container');
        if (playerBox) {
          window.MediaViewer.render(playerBox, {
            name: art.name,
            path: art.path,
            conversation_id: art.conversation_id || getCurrentConversationId() || '',
            category: mediaCategory,
            summary: art.summary
          });
        }
      }

      const btnView = card.querySelector('.btn-view-art');
      if (btnView) {
        btnView.addEventListener('click', () => {
          openArtifactViewer(art.name, art.path, art.summary, art.requestFeedback, art.conversation_id);
        });
      }

      const btnCopy = card.querySelector('.btn-copy-art');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          try {
            const cid = art.conversation_id || getCurrentConversationId() || '';
            const params = new URLSearchParams();
            if (art.name) params.set('name', art.name);
            if (cid) params.set('conversation_id', cid);
            if (art.path) params.set('path', art.path);
            const res = await fetchApi(`/api/ai/artifacts/content?` + params.toString());
            if (!res.ok) throw new Error('فشل جلب النص');
            const data = await res.json();
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(data.content || '');
            }
            playBeep(880, 0.1);
            announce(`تم نسخ محتوى ${art.name} إلى الحافظة بنجاح`);
          } catch (err) {
            announce('تعذر نسخ المستند: ' + err.message);
          }
        });
      }

      const btnProceed = card.querySelector('.btn-proceed-art');
      if (btnProceed) {
        btnProceed.addEventListener('click', () => {
          playBeep(880, 0.1);
          announce('تمت الموافقة، جارٍ بدء تنفيذ الخطة وفقاً للتوثيق...');
          sendAiPrompt('موافق، تابع التنفيذ وفقاً للخطة الموضوعة.');
        });
      }

      return card;
    }

    async function loadProjectBrowserDirectory(targetPath) {
      if (!projectBrowserItems) return;
      projectBrowserItems.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding:8px;">جاري تحميل ملفات المشروع...</p>';
      try {
        const url = '/api/fs/list' + (targetPath ? '?path=' + encodeURIComponent(targetPath) : '');
        const res = await fetchApi(url);
        if (!res.ok) throw new Error('تعذر تحميل مجلد المشروع');
        const data = await res.json();
        currentProjectBrowserDir = data.current_dir || targetPath || '';
        currentProjectParentDir = data.parent_dir || '';

        if (projectBrowserCurrentPath) {
          projectBrowserCurrentPath.textContent = currentProjectBrowserDir;
          projectBrowserCurrentPath.title = currentProjectBrowserDir;
        }

        const items = data.items || [];
        const dirs = items.filter(it => it.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const files = items.filter(it => !it.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        projectBrowserItems.innerHTML = '';
        if (dirs.length === 0 && files.length === 0) {
          projectBrowserItems.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding:8px;">المجلد فارغ</p>';
          return;
        }

        // Folders
        dirs.forEach(d => {
          const btnDir = (doc || document).createElement('button');
          btnDir.type = 'button';
          btnDir.className = 'btn btn-sm';
          btnDir.setAttribute('role', 'listitem');
          btnDir.style.cssText = 'display:flex; justify-content:space-between; align-items:center; width:100%; text-align:right; padding:8px 12px; background:var(--bg-card); border:1px solid var(--border-main); border-radius:6px; cursor:pointer;';
          btnDir.innerHTML = `<span>📁 ${escapeHtml(d.name)}</span><span style="font-size:0.8rem; color:var(--text-muted);">مجلد</span>`;
          btnDir.addEventListener('click', () => loadProjectBrowserDirectory(d.path));
          projectBrowserItems.appendChild(btnDir);
        });

        // Files
        files.forEach(f => {
          const fInfo = getFileInfo(f.name);
          const sizeKb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : (f.size / 1024).toFixed(1) + ' KB';
          const fileRow = (doc || document).createElement('div');
          fileRow.className = 'file-browser-row';
          fileRow.setAttribute('role', 'listitem');
          fileRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; padding:6px 12px; background:var(--bg-card-header); border:1px solid var(--border-main); border-radius:6px;';
          fileRow.innerHTML = `
            <button type="button" class="btn-open-proj-file" style="flex:1; display:flex; justify-content:space-between; align-items:center; background:none; border:none; color:var(--text-main); font-family:inherit; font-size:0.9rem; text-align:right; cursor:pointer;" aria-label="عرض وفتح الملف ${escapeHtml(f.name)}">
              <span>${fInfo.icon} ${escapeHtml(f.name)}</span>
              <span style="font-size:0.8rem; color:var(--text-muted); margin-left:8px;">${sizeKb}</span>
            </button>
            <button type="button" class="btn btn-sm btn-open-art-view" aria-label="فتح ملف ${escapeHtml(f.name)}" style="background:var(--accent-purple); color:#fff; padding:4px 8px; font-size:0.8rem; border-radius:4px;">📖 فتح</button>
          `;

          const triggerOpen = () => {
            if (artifactsDialog && typeof artifactsDialog.close === 'function') artifactsDialog.close();
            openArtifactViewer(f.name, f.path, 'ملف من مساحة عمل المشروع', false, getCurrentConversationId() || '');
          };

          const openBtn = fileRow.querySelector('.btn-open-proj-file');
          const viewBtn = fileRow.querySelector('.btn-open-art-view');
          if (openBtn) openBtn.addEventListener('click', triggerOpen);
          if (viewBtn) viewBtn.addEventListener('click', triggerOpen);
          projectBrowserItems.appendChild(fileRow);
        });
      } catch (e) {
        projectBrowserItems.innerHTML = `<p style="color:var(--accent-red); font-size:0.9rem; padding:8px;">تعذر استعراض المجلد: ${escapeHtml(e.message)}</p>`;
      }
    }

    async function loadArtifactsList() {
      if (!artifactsListContainer) return;
      artifactsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري تحميل المستندات والخطط...</div>';
      try {
        const cid = getCurrentConversationId() || '';
        const res = await fetchApi(`/api/ai/artifacts?conversation_id=${encodeURIComponent(cid)}`);
        if (!res.ok) throw new Error('فشل جلب المستندات');
        const data = await res.json();
        const arts = data.artifacts || [];
        const sessFiles = data.session_files || [];

        // 1. Render Artifacts Tab
        artifactsListContainer.innerHTML = '';
        if (arts.length === 0) {
          artifactsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد مستندات أو خطط منشأة في هذه المحادثة حتى الآن.</div>';
        } else {
          arts.forEach(art => {
            knownArtifacts.set(art.name, art);
            const item = (doc || document).createElement('div');
            item.className = 'conversation-item';
            item.setAttribute('role', 'listitem');
            item.style.cssText = 'padding:12px; border:1px solid var(--border-main); border-radius:8px; background:var(--bg-card); display:flex; flex-direction:column; gap:8px;';
            const fInfo = getFileInfo(art.name);
            const mediaCheck = (typeof window !== 'undefined' && window.MediaViewer) ? window.MediaViewer.isMediaFile(art.name) : null;
            const isMedia = Boolean(fInfo.isMedia || (mediaCheck && mediaCheck.isMedia) || art.is_media);
            const mediaCategory = (mediaCheck && mediaCheck.category) || fInfo.category || art.media_type || 'audio';
            const icon = fInfo.icon || (mediaCategory === 'audio' ? '🎧' : (mediaCategory === 'video' ? '🎬' : (mediaCategory === 'image' ? '🖼️' : '📄')));
            const viewBtnLabel = isMedia ? (mediaCategory === 'audio' ? '🎧 تشغيل الصوت' : (mediaCategory === 'video' ? '🎬 تشغيل الفيديو' : '🖼️ عرض الصورة')) : '📖 عرض المستند';
            const sizeKb = art.size ? (art.size / 1024).toFixed(1) + ' KB' : '';
            item.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--accent-purple); font-size:1rem;">${icon} ${escapeHtml(art.name)}</strong>
                <span style="font-size:0.8rem; color:var(--text-muted);">${sizeKb}</span>
              </div>
              <p style="margin:0; font-size:0.9rem; color:var(--text-main); line-height:1.5;">${escapeHtml(art.summary || 'بدون ملخص')}</p>
              <div style="display:flex; gap:8px; margin-top:4px;">
                <button type="button" class="btn btn-sm btn-art-list-view" aria-label="${viewBtnLabel}: ${escapeHtml(art.name)}" style="background:var(--accent-purple); color:#fff; font-size:0.88rem; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ${viewBtnLabel}
                </button>
              </div>
            `;
            const vBtn = item.querySelector('.btn-art-list-view');
            if (vBtn) {
              vBtn.addEventListener('click', () => {
                if (artifactsDialog && typeof artifactsDialog.close === 'function') artifactsDialog.close();
                openArtifactViewer(art.name, art.path, art.summary, art.requestFeedback, art.conversation_id);
              });
            }
            artifactsListContainer.appendChild(item);
          });
        }

        // 2. Render Session Files List
        knownProjectFiles.clear();
        if (projectSessionFilesList) {
          projectSessionFilesList.innerHTML = '';
          if (sessFiles.length === 0) {
            projectSessionFilesList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding:8px;">لا توجد ملفات معدلة في هذه الجلسة حتى الآن.</p>';
          } else {
            sessFiles.forEach(f => {
              knownProjectFiles.set(f.path, f);
              const fInfo = getFileInfo(f.name);
              const sizeKb = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '';
              const actionLabel = f.action === 'created' ? '✨ تم الإنشاء' : (f.action === 'edited' ? '✏️ تم التعديل' : '👁️ تم الفحص');
              const actionColor = f.action === 'created' ? 'var(--accent-green)' : (f.action === 'edited' ? 'var(--accent-purple)' : 'var(--text-muted)');

              const fileCard = (doc || document).createElement('div');
              fileCard.className = 'session-file-card';
              fileCard.setAttribute('role', 'listitem');
              fileCard.style.cssText = 'padding:10px 12px; border:1px solid var(--border-main); border-radius:8px; background:var(--bg-card); display:flex; flex-direction:column; gap:6px;';
              fileCard.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                  <strong style="color:var(--text-main); font-size:0.95rem;">${fInfo.icon} ${escapeHtml(f.name)}</strong>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <span class="badge" style="background:${actionColor}; color:#000; font-size:0.75rem; padding:2px 6px; border-radius:4px; font-weight:bold;">${actionLabel}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${sizeKb}</span>
                  </div>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); direction:ltr; text-align:left; word-break:break-all;">${escapeHtml(f.path)}</div>
                <div style="display:flex; gap:8px; margin-top:4px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-sm btn-session-file-view" aria-label="عرض وقراءة الملف ${escapeHtml(f.name)}" style="background:var(--accent-purple); color:#fff; font-size:0.85rem; padding:5px 10px; border-radius:6px; cursor:pointer;">
                    📖 عرض وقراءة الملف
                  </button>
                  <button type="button" class="btn btn-sm btn-session-file-copy" aria-label="نسخ مسار ${escapeHtml(f.name)}" style="background:rgba(255,255,255,0.08); font-size:0.85rem; padding:5px 10px; border-radius:6px; cursor:pointer;">
                    📋 نسخ المسار
                  </button>
                </div>
              `;

              const vBtn = fileCard.querySelector('.btn-session-file-view');
              if (vBtn) {
                vBtn.addEventListener('click', () => {
                  if (artifactsDialog && typeof artifactsDialog.close === 'function') artifactsDialog.close();
                  openArtifactViewer(f.name, f.path, `ملف مشروع (${actionLabel})`, false, getCurrentConversationId() || '');
                });
              }

              const cpBtn = fileCard.querySelector('.btn-session-file-copy');
              if (cpBtn) {
                cpBtn.addEventListener('click', () => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(f.path).then(() => {
                      playBeep(880, 0.08);
                      announce('تم نسخ مسار الملف');
                      cpBtn.textContent = '✓ تم النسخ';
                      setTimeout(() => { cpBtn.textContent = '📋 نسخ المسار'; }, 2000);
                    });
                  }
                });
              }

              projectSessionFilesList.appendChild(fileCard);
            });
          }
        }

        // 3. Update Badges
        if (tabArtifactsCount) tabArtifactsCount.textContent = arts.length;
        if (tabProjectFilesCount) tabProjectFilesCount.textContent = sessFiles.length;
        if (sessionFilesCountBadge) sessionFilesCountBadge.textContent = sessFiles.length;
        updateArtifactsUI(arts.length + sessFiles.length);

      } catch (err) {
        if (artifactsListContainer) {
          artifactsListContainer.innerHTML = `<div style="color:var(--accent-red); padding:12px;">تعذر تحميل المستندات: ${escapeHtml(err.message)}</div>`;
        }
      }
    }

    if (doc) {
      bindDom(doc);
    }

    return {
      bindDom: bindDom,
      getFileInfo: getFileInfo,
      updateArtifactsUI: updateArtifactsUI,
      openArtifactViewer: openArtifactViewer,
      createArtifactCard: createArtifactCard,
      loadArtifactsList: loadArtifactsList,
      loadProjectBrowserDirectory: loadProjectBrowserDirectory,
      knownArtifacts: knownArtifacts,
      knownProjectFiles: knownProjectFiles,
      getCurrentViewerArtifact: function () { return currentViewerArtifact; }
    };
  }

  return {
    getFileInfo: getFileInfo,
    createArtifactsViewer: createArtifactsViewer
  };
});
