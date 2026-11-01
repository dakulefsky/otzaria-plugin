/* Official-PDF link filter. Also used by the Node test suite. */
(function (root) {
  'use strict';
  var ALLOWED_HOSTS = ['www.oraysa.org', 'oraysa-media.s3.amazonaws.com'];
  var MEDIA_EXT = /\.(mp3|m4a|wav|aac|ogg|mp4|m4v|mov|avi|mkv|webm)$/i;
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function isAllowedPageUrl(raw) {
    var u;
    try { u = new URL(raw); } catch (e) { return false; }
    return u.protocol === 'https:' && !u.username && !u.password &&
      (!u.port || u.port === '443') && ALLOWED_HOSTS.indexOf(u.hostname) !== -1;
  }
  function classify(raw, base) {
    var u;
    try { u = new URL(raw, base); } catch (e) { return { url: raw, reason: 'unparseable-url' }; }
    var url = u.href;
    if (u.protocol !== 'https:') return { url: url, reason: 'not-https' };
    if (u.username || u.password) return { url: url, reason: 'credentials-not-allowed' };
    if (u.port && u.port !== '443') return { url: url, reason: 'port-not-allowed' };
    if (ALLOWED_HOSTS.indexOf(u.hostname) === -1) return { url: url, reason: 'host-not-allowed' };
    var path = safeDecode(u.pathname);
    if (MEDIA_EXT.test(path)) return { url: url, reason: 'audio-or-video' };
    if (!/\.pdf$/i.test(path)) return { url: url, reason: /download/i.test(path + u.search) ? 'download-wrapper-not-pdf' : 'not-pdf-path' };
    return { url: url, ok: true, filename: path.split('/').pop() || '' };
  }
  function extractPdfLinks(html, base) {
    var accepted = [], rejected = [], seen = {};
    var re = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, m;
    while ((m = re.exec(html)) !== null) {
      var raw = (m[1] !== undefined ? m[1] : m[2]).replace(/&amp;/g, '&').trim();
      if (!raw || raw.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(raw)) continue;
      var r = classify(raw, base);
      if (seen[r.url]) continue;
      seen[r.url] = 1;
      if (r.ok) accepted.push({ url: r.url, filename: r.filename });
      else rejected.push({ url: r.url, reason: r.reason });
    }
    return { accepted: accepted, rejected: rejected };
  }
  var api = { ALLOWED_HOSTS: ALLOWED_HOSTS, isAllowedPageUrl: isAllowedPageUrl, classify: classify, extractPdfLinks: extractPdfLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PdfFilter = api;
})(typeof window !== 'undefined' ? window : globalThis);
