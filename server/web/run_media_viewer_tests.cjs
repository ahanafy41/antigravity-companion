const assert = require('assert');
const path = require('path');

// Mock browser globals for Node.js test environment
const mockWindow = {
  getApiUrl: (path) => `http://127.0.0.1:7681${path}`,
  mainV1State: { csrf: 'test-csrf-token' }
};
global.window = mockWindow;

const MediaViewer = require('./media-viewer.js');

// 1. Test isMediaFile identification
console.log('Test 1: isMediaFile identification...');
assert.deepStrictEqual(MediaViewer.isMediaFile('photo.png'), { isMedia: true, category: 'image' });
assert.deepStrictEqual(MediaViewer.isMediaFile('avatar.jpg'), { isMedia: true, category: 'image' });
assert.deepStrictEqual(MediaViewer.isMediaFile('diagram.svg'), { isMedia: true, category: 'image' });
assert.deepStrictEqual(MediaViewer.isMediaFile('sound.mp3'), { isMedia: true, category: 'audio' });
assert.deepStrictEqual(MediaViewer.isMediaFile('speech.wav'), { isMedia: true, category: 'audio' });
assert.deepStrictEqual(MediaViewer.isMediaFile('recording.ogg'), { isMedia: true, category: 'audio' });
assert.deepStrictEqual(MediaViewer.isMediaFile('voice.m4a'), { isMedia: true, category: 'audio' });
assert.deepStrictEqual(MediaViewer.isMediaFile('movie.mp4'), { isMedia: true, category: 'video' });
assert.deepStrictEqual(MediaViewer.isMediaFile('clip.webm'), { isMedia: true, category: 'video' });
assert.deepStrictEqual(MediaViewer.isMediaFile('script.py'), { isMedia: false });
assert.deepStrictEqual(MediaViewer.isMediaFile('notes.md'), { isMedia: false });

// 2. Test buildMediaUrl
console.log('Test 2: buildMediaUrl resolution...');
const url = MediaViewer.buildMediaUrl('/data/user/files/audio.mp3', 'my-token');
assert(url.includes('/api/v1/files/raw'), 'URL should point to raw endpoint');
assert(url.includes('token='), 'URL should include token');
assert(url.includes(encodeURIComponent('/data/user/files/audio.mp3')), 'URL should contain encoded path');

// 3. Test HTML rendering generators
console.log('Test 3: HTML player generation...');
const audioHtml = MediaViewer.generateAudioHtml({
  name: 'podcast.mp3',
  url: 'http://127.0.0.1:7681/api/v1/files/raw?path=podcast.mp3',
  summary: 'مقطع صوتي تجريبي'
});
assert(audioHtml.includes('<audio'), 'Audio HTML must contain <audio element');
assert(audioHtml.includes('controls'), 'Audio element must have native controls');
assert(audioHtml.includes('btn-skip-back'), 'Must have accessible -10s skip button');
assert(audioHtml.includes('btn-skip-forward'), 'Must have accessible +10s skip button');
assert(audioHtml.includes('aria-label'), 'Must have ARIA labels for screen readers');

const videoHtml = MediaViewer.generateVideoHtml({
  name: 'demo.mp4',
  url: 'http://127.0.0.1:7681/api/v1/files/raw?path=demo.mp4'
});
assert(videoHtml.includes('<video'), 'Video HTML must contain <video element');
assert(videoHtml.includes('controls'), 'Video element must have controls');

const imageHtml = MediaViewer.generateImageHtml({
  name: 'screenshot.png',
  url: 'http://127.0.0.1:7681/api/v1/files/raw?path=screenshot.png',
  summary: 'لقطة شاشة'
});
assert(imageHtml.includes('<img'), 'Image HTML must contain <img element');
assert(imageHtml.includes('alt="لقطة شاشة"'), 'Image element must have alt text');

console.log('All MediaViewer unit tests passed successfully!');
