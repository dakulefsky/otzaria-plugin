/* Exact allowlist policy. Default deny; sensitive namespaces/action-like calls always require approval. */
(function (root) {
  'use strict';
  var METHOD_RE = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
  var NEVER_AUTO_PREFIXES = ['fs.', 'network.', 'ui.', 'plugin.', 'plugins.'];
  var ACTION_WORDS = /(write|delete|remove|save|set|create|update|download|pick|install|revoke|move|extract|open|upload|clear|reset|stream|localhost|launch|exec|run)/i;
  function parseAllowlist(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.charAt(0) !== '#' && METHOD_RE.test(s); });
  }
  function classify(method, allow) {
    if (typeof method !== 'string' || !METHOD_RE.test(method)) return { kind: 'invalid', reason: 'method is missing or malformed' };
    if (NEVER_AUTO_PREFIXES.some(function (p) { return method.indexOf(p) === 0; })) return { kind: 'approval', reason: 'sensitive namespace, always needs approval' };
    if (ACTION_WORDS.test(method)) return { kind: 'approval', reason: 'name looks like an action, always needs approval' };
    if (Array.isArray(allow) && allow.indexOf(method) !== -1) return { kind: 'read' };
    return { kind: 'approval', reason: 'not on the verified exact allowlist' };
  }
  var api = { classify: classify, parseAllowlist: parseAllowlist, METHOD_RE: METHOD_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BridgePolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);
