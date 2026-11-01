/* Conservative policy: exact SDK methods only; empty until verified against official docs. */
(function (root) {
  'use strict';
  var METHOD_RE = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
  var READ_ONLY_METHODS = [];
  function classify(method) {
    if (typeof method !== 'string' || !METHOD_RE.test(method)) return { kind: 'invalid', reason: 'method is missing or malformed' };
    if (READ_ONLY_METHODS.indexOf(method) !== -1) return { kind: 'read' };
    return { kind: 'approval', reason: 'not verified as read-only in the official Otzaria SDK specification' };
  }
  var api = { classify: classify, METHOD_RE: METHOD_RE, READ_ONLY_METHODS: READ_ONLY_METHODS.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BridgePolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);
