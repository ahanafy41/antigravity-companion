/**
 * MediaViewer - Modular Accessible Multimedia Viewer & Inline Player
 * Supports Images, Audio, and Video files with Screen Reader & Android WebView optimization.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MediaViewer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
  const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus']);
  const VIDEO_EXTS = new Set(['mp4', 'webm', 'mkv', 'mov']);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getExt(filename) {
    if (!filename) return '';
    const clean = String(filename).trim().split('?')[0].split('#')[0];
    const parts = clean.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function isMediaFile(filename) {
    const ext = getExt(filename);
    if (IMAGE_EXTS.has(ext)) return { isMedia: true, category: 'image' };
    if (AUDIO_EXTS.has(ext)) return { isMedia: true, category: 'audio' };
    if (VIDEO_EXTS.has(ext)) return { isMedia: true, category: 'video' };
    return { isMedia: false };
  }

  function getActiveToken() {
    if (typeof window !== 'undefined') {
      if (window.mainV1State && window.mainV1State.csrf) return window.mainV1State.csrf;
      try {
        const stored = sessionStorage.getItem('antigravity_csrf') || localStorage.getItem('antigravity_csrf');
        if (stored) return stored;
      } catch (e) {}
    }
    return '';
  }

  function buildMediaUrl(filePath, token, cid) {
    if (!filePath) return '';
    // If it's already an absolute HTTP stream URL, return it
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const cleanPath = filePath.replace(/^file:\/\//, '');
    const activeToken = token || getActiveToken();
    const params = new URLSearchParams();
    params.set('path', cleanPath);
    if (!cleanPath.includes('/') && !cleanPath.includes('\\')) {
      params.set('name', cleanPath);
    }
    if (activeToken) params.set('token', activeToken);
    if (cid) params.set('conversation_id', cid);

    const relativeEndpoint = `/api/v1/files/raw?` + params.toString();
    if (typeof window !== 'undefined' && typeof window.getApiUrl === 'function') {
      return window.getApiUrl(relativeEndpoint);
    }
    return relativeEndpoint;
  }

  function generateAudioHtml(opts) {
    const name = escapeHtml(opts.name || 'ملف صوتي');
    const url = opts.url || '';
    const summary = opts.summary ? escapeHtml(opts.summary) : '';

    return `
      <div class="media-audio-card" role="region" aria-label="مشغل الصوت: ${name}" style="background:var(--bg-card, #1e1e2e); border:1px solid var(--border-main, #3b3b4f); border-radius:10px; padding:16px; margin:10px 0; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--accent-purple, #a371f7);">
            <span aria-hidden="true" style="font-size:1.4rem;">🎧</span>
            <span style="font-size:1.05rem;">${name}</span>
          </div>
          <span class="badge" style="background:var(--accent-purple, #a371f7); color:#fff; font-size:0.75rem; padding:2px 8px; border-radius:4px;">مقطع صوتي</span>
        </div>
        ${summary ? `<p style="margin:0; font-size:0.9rem; color:var(--text-muted, #a0a0b0); line-height:1.5;">${summary}</p>` : ''}
        
        <audio controls preload="metadata" class="media-audio-element" src="${url}" aria-label="مشغل الصوت: ${name}" style="width:100%; outline:none; border-radius:6px;"></audio>
        
        <div class="media-controls-toolbar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:space-between; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="btn btn-sm btn-skip-back" aria-label="تأخير 10 ثوانٍ" title="تأخير 10 ثوانٍ" style="padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main, #fff); cursor:pointer;">
              ⏪ -10s
            </button>
            <button type="button" class="btn btn-sm btn-skip-forward" aria-label="تقديم 10 ثوانٍ" title="تقديم 10 ثوانٍ" style="padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main, #fff); cursor:pointer;">
              ⏩ +10s
            </button>
            <button type="button" class="btn btn-sm btn-speed-toggle" aria-label="سرعة التشغيل: 1x" title="تغيير السرعة" style="padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main, #fff); font-weight:bold; cursor:pointer;">
              ⚡ 1x
            </button>
          </div>
          <a href="${url}" download="${name}" class="btn btn-sm" aria-label="تنزيل الملف الصوتي" style="padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--accent-cyan, #56b6c2); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
            ⬇️ تنزيل
          </a>
        </div>
      </div>
    `;
  }

  function generateVideoHtml(opts) {
    const name = escapeHtml(opts.name || 'ملف فيديو');
    const url = opts.url || '';
    const summary = opts.summary ? escapeHtml(opts.summary) : '';

    return `
      <div class="media-video-card" role="region" aria-label="مشغل الفيديو: ${name}" style="background:var(--bg-card, #1e1e2e); border:1px solid var(--border-main, #3b3b4f); border-radius:10px; padding:14px; margin:10px 0; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--accent-cyan, #56b6c2);">
            <span aria-hidden="true" style="font-size:1.4rem;">🎬</span>
            <span style="font-size:1.05rem;">${name}</span>
          </div>
          <span class="badge" style="background:var(--accent-cyan, #56b6c2); color:#000; font-weight:bold; font-size:0.75rem; padding:2px 8px; border-radius:4px;">فيديو</span>
        </div>
        ${summary ? `<p style="margin:0; font-size:0.9rem; color:var(--text-muted, #a0a0b0); line-height:1.5;">${summary}</p>` : ''}
        
        <div style="position:relative; width:100%; background:#000; border-radius:8px; overflow:hidden;">
          <video controls preload="metadata" class="media-video-element" src="${url}" aria-label="مشغل الفيديو: ${name}" style="width:100%; max-height:65vh; display:block;"></video>
        </div>
        
        <div style="display:flex; justify-content:flex-end; padding-top:4px;">
          <a href="${url}" download="${name}" class="btn btn-sm" aria-label="تنزيل مقطع الفيديو" style="padding:6px 12px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--accent-cyan, #56b6c2); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
            ⬇️ تنزيل
          </a>
        </div>
      </div>
    `;
  }

  function generateImageHtml(opts) {
    const name = escapeHtml(opts.name || 'صورة');
    const url = opts.url || '';
    const summary = opts.summary ? escapeHtml(opts.summary) : name;

    return `
      <div class="media-image-card" role="region" aria-label="معاينة الصورة: ${name}" style="background:var(--bg-card, #1e1e2e); border:1px solid var(--border-main, #3b3b4f); border-radius:10px; padding:14px; margin:10px 0; display:flex; flex-direction:column; gap:10px; align-items:center;">
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--accent-green, #98c379);">
            <span aria-hidden="true" style="font-size:1.4rem;">🖼️</span>
            <span style="font-size:1.05rem;">${name}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-sm btn-zoom-toggle" aria-label="تكبير أو تصغير الصورة" style="padding:4px 10px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main, #fff); cursor:pointer;">
              🔍 تكبير
            </button>
            <a href="${url}" download="${name}" class="btn btn-sm" aria-label="تنزيل الصورة" style="padding:4px 10px; background:rgba(255,255,255,0.08); border-radius:6px; color:var(--accent-green, #98c379); text-decoration:none;">
              ⬇️ تنزيل
            </a>
          </div>
        </div>
        
        <div class="media-image-wrapper" style="width:100%; display:flex; justify-content:center; background:rgba(0,0,0,0.3); border-radius:8px; padding:10px; overflow:auto;">
          <img src="${url}" alt="${summary}" class="media-image-element" style="max-width:100%; max-height:70vh; object-fit:contain; border-radius:6px; transition:transform 0.2s ease; cursor:zoom-in;">
        </div>
      </div>
    `;
  }

  function bindMediaEvents(container) {
    if (!container) return;

    // 1. Audio event bindings
    const audioEl = container.querySelector('.media-audio-element');
    if (audioEl) {
      const btnBack = container.querySelector('.btn-skip-back');
      if (btnBack) {
        btnBack.onclick = function () {
          audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
        };
      }
      const btnFwd = container.querySelector('.btn-skip-forward');
      if (btnFwd) {
        btnFwd.onclick = function () {
          audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + 10);
        };
      }
      const btnSpeed = container.querySelector('.btn-speed-toggle');
      if (btnSpeed) {
        const speeds = [1.0, 1.25, 1.5, 2.0];
        let speedIdx = 0;
        btnSpeed.onclick = function () {
          speedIdx = (speedIdx + 1) % speeds.length;
          const s = speeds[speedIdx];
          audioEl.playbackRate = s;
          btnSpeed.textContent = `⚡ ${s}x`;
          btnSpeed.setAttribute('aria-label', `سرعة التشغيل: ${s}x`);
          if (typeof window !== 'undefined' && typeof window.announce === 'function') {
            window.announce(`تم تغيير السرعة إلى ${s} ضعف`);
          }
        };
      }
    }

    // 2. Image zoom toggle bindings
    const imgEl = container.querySelector('.media-image-element');
    const btnZoom = container.querySelector('.btn-zoom-toggle');
    if (imgEl && btnZoom) {
      let isZoomed = false;
      const toggleZoom = function () {
        isZoomed = !isZoomed;
        if (isZoomed) {
          imgEl.style.maxHeight = 'none';
          imgEl.style.transform = 'scale(1.5)';
          imgEl.style.transformOrigin = 'center top';
          imgEl.style.cursor = 'zoom-out';
          btnZoom.textContent = '🔍 تصغير';
        } else {
          imgEl.style.maxHeight = '70vh';
          imgEl.style.transform = 'none';
          imgEl.style.cursor = 'zoom-in';
          btnZoom.textContent = '🔍 تكبير';
        }
      };
      btnZoom.onclick = toggleZoom;
      imgEl.onclick = toggleZoom;
    }
  }

  function render(container, opts) {
    if (!container) return;
    const info = isMediaFile(opts.name || opts.path);
    const category = opts.category || info.category || 'image';
    const streamUrl = opts.url || buildMediaUrl(opts.path || opts.name, null, opts.conversation_id);

    const renderOpts = {
      name: opts.name || 'ملف وسائط',
      path: opts.path || '',
      url: streamUrl,
      summary: opts.summary || ''
    };

    let html = '';
    if (category === 'audio') {
      html = generateAudioHtml(renderOpts);
    } else if (category === 'video') {
      html = generateVideoHtml(renderOpts);
    } else {
      html = generateImageHtml(renderOpts);
    }

    container.innerHTML = html;
    bindMediaEvents(container);

    if (typeof window !== 'undefined' && typeof window.announce === 'function') {
      window.announce(`تم عرض ملف الوسائط: ${renderOpts.name}`);
    }
  }

  function enhanceContainer(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;

    // 1. Rewrite local image URLs
    const imgs = rootEl.querySelectorAll('img:not([data-media-enhanced])');
    imgs.forEach(img => {
      img.setAttribute('data-media-enhanced', 'true');
      const src = img.getAttribute('src') || '';
      if (src.startsWith('/') || src.startsWith('file://') || src.includes('.gemini/antigravity-cli')) {
        img.src = buildMediaUrl(src);
      }
    });

    // 2. Discover media links and embed inline players directly in chat!
    const links = rootEl.querySelectorAll('a:not([data-media-enhanced])');
    links.forEach(a => {
      a.setAttribute('data-media-enhanced', 'true');
      const href = a.getAttribute('href') || '';
      const text = a.textContent || '';
      const target = href || text;
      const mediaInfo = isMediaFile(target);
      if (mediaInfo.isMedia) {
        const streamUrl = buildMediaUrl(href || text);
        const playerCard = document.createElement('div');
        playerCard.className = 'chat-inline-media';
        playerCard.style.margin = '8px 0';
        
        if (mediaInfo.category === 'audio') {
          playerCard.innerHTML = generateAudioHtml({
            name: a.textContent || 'مقطع صوتي',
            url: streamUrl
          });
        } else if (mediaInfo.category === 'video') {
          playerCard.innerHTML = generateVideoHtml({
            name: a.textContent || 'مقطع فيديو',
            url: streamUrl
          });
        } else if (mediaInfo.category === 'image') {
          playerCard.innerHTML = generateImageHtml({
            name: a.textContent || 'صورة',
            url: streamUrl
          });
        }
        
        bindMediaEvents(playerCard);
        if (a.parentNode) {
          a.parentNode.insertBefore(playerCard, a.nextSibling);
        }
      }
    });
  }

  return {
    isMediaFile,
    buildMediaUrl,
    generateAudioHtml,
    generateVideoHtml,
    generateImageHtml,
    bindMediaEvents,
    render,
    enhanceContainer
  };
}));
