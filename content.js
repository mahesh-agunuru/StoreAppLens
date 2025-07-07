// content.js
// Inject the token extraction script as a file (CSP compliant)
(function injectTokenExtractionScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject_token.js');
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();




// Listen for messages from the injected script
window.addEventListener('message', function(event) {
  if (event.source !== window) return;
  if (event.data && event.data.source === 'BT1_TOKEN_EXTRACT' && event.data.bt1_token) {
    console.log('[BT1 content.js] Received token from injected script:', event.data.bt1_token);
    chrome.storage.local.set({ bt1_token: event.data.bt1_token }, () => {
      if (chrome.runtime.lastError) {
        console.error('[BT1 content.js] Error saving token:', chrome.runtime.lastError);
      } else {
        console.log('[BT1 content.js] Token saved to chrome.storage.local:', event.data.bt1_token);
      }
    });
  }
});

// For fallback: still try the old extraction method
function extractToken() {
  const token =
    window.top.g_ck ||
    document.querySelector('#sysparm_ck')?.value ||
    document.querySelector('input[name="sysparm_ck"]')?.value;
  console.log('[BT1 content.js] extractToken called, found:', token);
  if (token) {
    chrome.storage.local.set({ bt1_token: token }, () => {
      try {
        if (chrome.runtime.lastError) {
          console.error('[BT1 content.js] Error saving token:', chrome.runtime.lastError);
        } else {
          console.log('[BT1 content.js] Token saved to chrome.storage.local:', token);
        }
      } catch (err) {
        // Ignore context invalidation errors
        if (
          err &&
          err.message &&
          err.message.includes('Extension context invalidated')
        ) {
          // Safe to ignore
          return;
        }
        throw err;
      }
    });
  }
}

extractToken();

const observer = new MutationObserver(() => {
  console.log('[BT1 content.js] Mutation observed, trying to extract token again...');
  extractToken();
});
observer.observe(document, { childList: true, subtree: true });

console.log('[BT1 content.js] Loaded in frame:', window.location.href, 'window.name:', window.name);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    const token =
      window.top.g_ck ||
      document.querySelector('#sysparm_ck')?.value ||
      document.querySelector('input[name="sysparm_ck"]')?.value;
    console.log('[BT1 content.js] getToken message received, token:', token);
    sendResponse({ token });
  } else if (request.action === 'getSelectedApps') {
    console.log('[BT1 content.js] getSelectedApps message received in frame:', window.location.href, 'window.name:', window.name);

    // Log all checkboxes and their checked state
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const checked = cb.checked;
      const row = cb.closest('tr');
      console.log('[BT1 content.js] Checkbox:', cb, 'Checked:', checked, 'Row:', row ? row.outerHTML : 'none');
    });

    // Log all rows for inspection
    document.querySelectorAll('tr').forEach(row => {
      console.log('[BT1 content.js] Row HTML:', row.outerHTML);
    });

    // ServiceNow list view: get selected rows (modern UI)
    try {
      let selectedAppNumbers = [];
      let selectedSysIds = [];
      // New: Use checkboxes with data-type="list2_checkbox"
      document.querySelectorAll('input[type="checkbox"][data-type="list2_checkbox"]:checked').forEach(cb => {
        const sys_id = cb.getAttribute('data-ux-metrics-sysid');
        if (sys_id) selectedSysIds.push(sys_id);
        // Try to get app number from the same row
        const row = cb.closest('tr');
        if (row) {
          console.log('[BT1 content.js] Selected row HTML:', row.outerHTML);
          // Try to find app number in a.linked.formlink
          let foundAppNumber = null;
          const appNumberLink = row.querySelector('a.linked.formlink');
          if (appNumberLink) {
            foundAppNumber = appNumberLink.textContent.trim();
          }
          // Fallback: try app_number cell
          if (!foundAppNumber) {
            row.querySelectorAll('td').forEach(cell => {
              if (cell.getAttribute('name') === 'app_number') {
                foundAppNumber = cell.textContent.trim();
              }
            });
          }
          // Fallback: try first non-empty numeric cell
          if (!foundAppNumber) {
            row.querySelectorAll('td').forEach(cell => {
              const txt = cell.textContent.trim();
              if (txt && /^[0-9]+$/.test(txt)) foundAppNumber = txt;
            });
          }
          if (foundAppNumber) selectedAppNumbers.push(foundAppNumber);
        }
      });
      console.log('[BT1 content.js] Selected sys_ids:', selectedSysIds, 'Selected app numbers:', selectedAppNumbers);
      sendResponse({ sysIds: selectedSysIds, appNumbers: selectedAppNumbers });
    } catch (err) {
      console.error('[BT1 content.js] Error extracting selected apps:', err);
      sendResponse({ sysIds: [], appNumbers: [], error: err.message });
    }
    return true; // async
  }
});

