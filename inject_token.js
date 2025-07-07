// inject_token.js
(function() {
  function sendTokenToContentScript(token) {
    window.postMessage({ source: 'BT1_TOKEN_EXTRACT', bt1_token: token }, '*');
  }
  var token = window.g_ck ||
    (document.querySelector('#sysparm_ck') && document.querySelector('#sysparm_ck').value) ||
    (document.querySelector('input[name="sysparm_ck"]') && document.querySelector('input[name="sysparm_ck"]').value);
  if (token) {
    sendTokenToContentScript(token);
  }
  document.addEventListener('click', function() {
    var token = window.g_ck ||
      (document.querySelector('#sysparm_ck') && document.querySelector('#sysparm_ck').value) ||
      (document.querySelector('input[name="sysparm_ck"]') && document.querySelector('input[name="sysparm_ck"]').value);
    if (token) {
      sendTokenToContentScript(token);
    }
  });
})();
