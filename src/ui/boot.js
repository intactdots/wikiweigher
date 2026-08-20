var chrome = globalThis.browser ?? globalThis.chrome;
var wwShown = false;

function wwRecord(level, msg) {
  try {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get('wikiweigherDebugUi', function (o) {
      var list = Array.isArray(o.wikiweigherDebugUi) ? o.wikiweigherDebugUi : [];
      list.push({ t: Date.now(), level: level, msg: '[' + location.pathname.split('/').pop() + '] ' + String(msg).slice(0, 600) });
      chrome.storage.local.set({ wikiweigherDebugUi: list.slice(-120) });
    });
  } catch (e) {}
}

(function () {
  for (var i = 0; i < 2; i++) {
    var level = ['error', 'warn'][i];
    (function (lv) {
      var orig = console[lv];
      if (!orig || orig.__wwPatched) return;
      var wrapped = function () {
        try { wwRecord(lv, Array.prototype.join.call(arguments, ' ')); } catch (e) {}
        return orig.apply(console, arguments);
      };
      wrapped.__wwPatched = true;
      console[lv] = wrapped;
    })(level);
  }
})();

function wwFail(detail) {
  if (wwShown) return;
  wwShown = true;
  var box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:14px 18px;background:#e5484d;color:#fff;font:13px/1.5 system-ui,sans-serif;z-index:2147483647';
  box.textContent = 'Wikiweigher could not load this page. Removing and re-adding the extension usually fixes it. Details: ' + detail;
  if (document.body) document.body.appendChild(box);
  else addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
}

addEventListener('error', function (e) {
  if (e.target && e.target !== window && e.target.tagName) {
    var res = e.target.src || e.target.href || e.target.tagName;
    wwRecord('error', 'failed to load ' + res);
    wwFail('could not load ' + res);
    return;
  }
  wwRecord('error', (e.message || 'script error') + ' ' + (e.filename || '') + ':' + (e.lineno || '') +
    ((e.error && e.error.stack) ? '\n' + e.error.stack : ''));
  wwFail(e.message || 'script error');
}, true);

addEventListener('unhandledrejection', function (e) {
  var r = (e.reason && e.reason.stack) || (e.reason && e.reason.message) || e.reason;
  wwRecord('error', 'unhandledrejection ' + String(r));
  wwFail(String((e.reason && e.reason.message) || e.reason || 'unhandled rejection'));
});
