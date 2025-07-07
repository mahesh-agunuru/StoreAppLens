// devtools_panel.js
// Main logic from popup.js, adapted for the DevTools panel context

const BT1_TABLE_API = 'https://buildtools1.service-now.com/api/now/table/';
const APP_CERTIFICATION_TABLE = 'x_snc_store_certif_application_review';
const STORE_APP_COMPATIBILITY_TABLE = 'x_snc_store_certif_app_compatibility';
const APP_REPO_ARTIFACT_TABLE = 'x_snc_store_certif_application_repo';
const FAMILY_RELEASE_IDS = {
  yokohama: 'ead051b41b789e1055a02063604bcbf5',
  xanadu: '1461e9af1b4f8610fb58db13b24bcba3',
  washington: '12df18741b1bb9501ca3db91b24bcbf2'
};

let appSysIds = [];
let finalResultsArray = [];
let finalResultdb = [];
let combinedOutput = '';
let tdTemplateAppsformattedOutput = '';
let tdTemplatepluginsformattedOutput = '';
let snAppDeployAppsData = '';
let templateType = '';
let userToken = '';
let loginCheckInterval = null;

// Initialization for DevTools panel
function init() {
  try {
    const loginContainer = document.getElementById('loginContainer');
    const mainContent = document.getElementById('mainContent');
    const loginButton = document.getElementById('loginButton');
    const logoutButton = document.getElementById('logoutBtn');
    const loginStatus = document.getElementById('loginStatus');
    if (!loginContainer || !mainContent || !loginButton) {
      console.error('[BT1 devtools_panel.js] Required DOM elements not found');
      return;
    }
    chrome.storage.local.get('bt1_token', (result) => {
      console.log('[BT1 devtools_panel.js] Initial chrome.storage.local.get:', result);
      if (result && result.bt1_token) {
        userToken = result.bt1_token;
        showMainUI();
      } else {
        showLoginUI();
      }
      setupEventListeners();
    });
  } catch (error) {
    console.error('[BT1 devtools_panel.js] Error initializing extension:', error);
  }
}

function setupEventListeners() {
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutBtn');
  const manualCheckButton = document.getElementById('manualCheckButton');
  if (loginButton) loginButton.addEventListener('click', handleLogin);
  if (logoutButton) logoutButton.addEventListener('click', handleLogout);
  if (manualCheckButton) manualCheckButton.addEventListener('click', manualSessionCheck);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setToken' && message.token) {
      handleTokenReceived(message.token);
    }
    return true;
  });
  const callApiBtn = document.getElementById('callApi');
  if (callApiBtn) callApiBtn.addEventListener('click', async function () {
    finalResultdb = [];
    appSysIds = [];
    finalResultsArray = [];
    document.getElementById('formattedOutput').innerText = "Connecting to BT1... Please wait.";
    try {
      console.log('[BT1 devtools_panel.js] Get Dependencies button clicked');
      // Instead of reading from input, get selected apps from content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        document.getElementById('formattedOutput').innerText = 'No active tab found. Please open the ServiceNow list view.';
        return;
      }
      // Try to find the correct frame (gsft_main)
      let response;
      let foundFrame = false;
      if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        console.log('[BT1 devtools_panel.js] All frames:', frames);
        for (const frame of frames) {
          // Only target child frames (iframe, not top frame)
          if (frame.url.includes('x_snc_store_certif_application_review_list.do') && frame.parentFrameId !== -1) {
            try {
              response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedApps' }, { frameId: frame.frameId });
              foundFrame = true;
              console.log('[BT1 devtools_panel.js] Sent getSelectedApps to child frameId:', frame.frameId, 'Response:', response, 'Frame:', frame);
              break;
            } catch (err) {
              console.warn('[BT1 devtools_panel.js] Error sending message to child frameId', frame.frameId, err);
            }
          }
        }
      }
      if (!foundFrame) {
        // fallback: send to top frame
        try {
          response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedApps' });
          console.log('[BT1 devtools_panel.js] Sent getSelectedApps to top frame. Response:', response);
        } catch (err) {
          console.warn('[BT1 devtools_panel.js] Error sending message to top frame', err);
        }
      }
      if (!response || !response.appNumbers || response.appNumbers.length === 0) {
        document.getElementById('formattedOutput').innerText = 'No apps selected. Please select apps in the ServiceNow list view and try again.';
        return;
      }
      // Set the app numbers for main logic
      window._bt1_selectedAppNumbers = response.appNumbers;
      const release = document.getElementById('release').value;
      console.log('[BT1 devtools_panel.js] Selected apps:', response.appNumbers, 'Release:', release);
      // Test API call first
      const testResult = await makeApiCall('https://buildtools1.service-now.com/api/now/table/sys_user?sysparm_limit=1');
      console.log('[BT1 devtools_panel.js] Test API call result:', testResult);
      await main();
    } catch (error) {
      console.error('[BT1 devtools_panel.js] Error in Get Dependencies:', error);
      document.getElementById('formattedOutput').innerText = `Error: ${error.message}`;
    }
  });
  const copyBtn = document.getElementById('copyButton');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    const textToCopy = document.getElementById('formattedOutput').innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert("Text copied to clipboard!");
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  });
  const downloadBtn = document.getElementById('downloadButton');
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    const output = document.getElementById('formattedOutput');
    if (!output) return;
    const content = output.innerText;
    const fileName = `output.json`;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Manual session check logic
function manualSessionCheck() {
  chrome.storage.local.get('bt1_token', (result) => {
    console.log('[BT1 devtools_panel.js] Manual session check:', result);
    const loginStatus = document.getElementById('loginStatus');
    if (result && result.bt1_token) {
      userToken = result.bt1_token;
      showMainUI();
      loadInitialData();
      if (loginStatus) loginStatus.textContent = 'Session detected!';
    } else {
      if (loginStatus) loginStatus.textContent = 'No session detected. Make sure you are on a ServiceNow UI page after login and try again.';
    }
  });
}

// --- Dependency Fetching Logic from StoreAppLens ---
async function main() {
  let certificationTableUrl = '';
  let compatibilityTableUrl = '';
  // Remove username and password fields if present
  if(document.getElementById('username')) document.getElementById('username').style.display = 'none';
  if(document.getElementById('password')) document.getElementById('password').style.display = 'none';
  if(document.querySelector('label[for="username"]')) document.querySelector('label[for="username"]').style.display = 'none';
  if(document.querySelector('label[for="password"]')) document.querySelector('label[for="password"]').style.display = 'none';

  // Use selected app numbers from content script
  let appNumberIds = Array.isArray(window._bt1_selectedAppNumbers) ? window._bt1_selectedAppNumbers : [];

  const familyRelease = document.getElementById('release').value;
  const familyReleaseId = FAMILY_RELEASE_IDS[familyRelease] || '';
  // templateType is now set by button click

  document.getElementById('formattedOutput').innerText = "Retrieving main application details from BT1...";
  appSysIds = [];
  finalResultsArray = [];
  finalResultdb = [];

  for (let i = 0; i < appNumberIds.length; i++) {
    certificationTableUrl = BT1_TABLE_API + APP_CERTIFICATION_TABLE + '?sysparm_query=sys_created_on>=2024-01-01^app_number=' + appNumberIds[i];
    try {
      let appSysIdsData = await makeApiCall(certificationTableUrl);
      if (appSysIdsData.result && appSysIdsData.result.length > 0) {
        appSysIds.push(appSysIdsData.result[0].sys_id);
        let mainAppScope = appSysIdsData.result[0].scope;
        let mainAppVersion = appSysIdsData.result[0].version;
        finalResultsArray.push({
          scope: mainAppScope,
          version: mainAppVersion
        });
      } else {
        throw new Error(`No application found with number: ${appNumberIds[i]}`);
      }
    } catch (error) {
      document.getElementById('formattedOutput').innerText = `Error: ${error.message}`;
      throw error;
    }
  }

  for (let i = 0; i < appSysIds.length; i++) {
    compatibilityTableUrl = BT1_TABLE_API + STORE_APP_COMPATIBILITY_TABLE + '?sysparm_query=application=' + appSysIds[i] + '^platform_release=' + familyReleaseId;
    try {
      let appCompatibilityData = await makeApiCall(compatibilityTableUrl);
      if (appCompatibilityData.result && appCompatibilityData.result.length > 0 && appCompatibilityData.result[0].dependencies) {
        let dependecyStr = appCompatibilityData.result[0].dependencies;
        document.getElementById('formattedOutput').innerText = "Fetching dependent application details... Hang tight!";
        let dependecyPairs = dependecyStr.split(',');
        dependecyPairs.forEach(function (pair) {
          if (pair.trim()) {
            let parts = pair.split(':');
            if (parts.length >= 2) {
              let scope1 = parts[0].trim();
              let version1 = parts[1].trim();
              if (version1) {
                if (version1.includes('-')) {
                  version1 = version1.split('-')[0] + '-SNAPSHOT';
                }
                finalResultsArray.push({
                  scope: scope1,
                  version: version1
                });
              }
            }
          }
        });
      }
    } catch (error) {
      document.getElementById('formattedOutput').innerText = `Error fetching compatibility data: ${error.message}`;
      throw error;
    }
  }

  // --- Ensure main app(s) are always at the end ---
  // Remove duplicates, retain order
  let seen = new Set();
  let deduped = [];
  for (const item of finalResultsArray) {
    const key = item.scope + '|' + item.version;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  // Move all main app(s) to the end
  let otherApps = deduped.filter(item => !appSysIds.includes(item.sys_id));
  let mainApps = deduped.filter(item => appSysIds.includes(item.sys_id));
  let uniqueArray = [...otherApps, ...mainApps];


  document.getElementById('formattedOutput').innerText = "Retrieving group and artifact IDs for applications... This may take a few moments.";
  let pluginList = "";
  let scopeList = "";

  // Prepare pluginList and scopeList for artifact API
  uniqueArray.forEach((item) => {
    if (item.version === 'sys') {
      pluginList += `${item.scope}, `;
    } else {
      scopeList += `${item.scope}, `;
    }
  });

  let appRepoArtifactTableUrl = BT1_TABLE_API + APP_REPO_ARTIFACT_TABLE + '?sysparm_query=scopeIN' + scopeList;
  let appartifactData = await makeApiCall(appRepoArtifactTableUrl);
  let artifactMap = {};
  if (appartifactData.result && appartifactData.result.length > 0) {
    appartifactData.result.forEach((artifact) => {
      artifactMap[artifact.scope] = artifact;
    });
  }
  finalResultdb.length = 0; // clear previous
  uniqueArray.forEach((item) => {
    if (item.version === 'sys') {
      finalResultdb.push({
        scope: item.scope,
        version: item.version,
        artifactId: item.version,
        groupId: item.version,
        name: item.scope,
        isMainApp: appSysIds.includes(item.sys_id)
      });
    } else {
      const artifact = artifactMap[item.scope] || {};
      finalResultdb.push({
        scope: item.scope,
        version: item.version,
        artifactId: artifact.artifact_id || '',
        groupId: artifact.group_id || '',
        name: artifact.app_name || '',
        isMainApp: appSysIds.includes(item.sys_id)
      });
    }
  });
  // Default to TD Template after fetch
  updateFormattedOutput('tdTemplate');
  enableButtons(true);
}

function enableButtons(hasOutput = true) {
  // Enable or disable format, copy, and download buttons based on output presence
  const copyBtn = document.getElementById('copyButton');
  const downloadBtn = document.getElementById('downloadButton');
  const tdBtn = document.getElementById('tdTemplateButton');
  const pomBtn = document.getElementById('pomFormatButton');
  const snAppBtn = document.getElementById('snAppDeployButton');

  if (copyBtn) copyBtn.disabled = !hasOutput;
  if (downloadBtn) downloadBtn.disabled = !hasOutput;
  if (tdBtn) tdBtn.disabled = !hasOutput;
  if (pomBtn) pomBtn.disabled = !hasOutput;
  if (snAppBtn) snAppBtn.disabled = !hasOutput;

  // Add event listeners for format switch buttons
  if (tdBtn) tdBtn.onclick = () => updateFormattedOutput('tdTemplate');
  if (pomBtn) pomBtn.onclick = () => updateFormattedOutput('testProjectPOM');
  if (snAppBtn) snAppBtn.onclick = () => updateFormattedOutput('snAppDeploy');
}

// Disable all buttons on load
window.addEventListener('DOMContentLoaded', () => {
  enableButtons(false);

  // Set up Copy Output button event listener
  const copyBtn = document.getElementById('copyButton');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const output = document.getElementById('formattedOutput');
      if (!output) return;
      const textToCopy = output.innerText;
      // Try Clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.title = 'Copied!';
          setTimeout(() => { copyBtn.title = 'Copy the output to clipboard'; }, 1200);
        }).catch(() => {
          // Fallback to textarea method
          fallbackCopyTextToClipboard(textToCopy, copyBtn);
        });
      } else {
        fallbackCopyTextToClipboard(textToCopy, copyBtn);
      }
    });
  }

  // Fallback for clipboard copy in DevTools panel
  function fallbackCopyTextToClipboard(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      btn.title = successful ? 'Copied!' : 'Copy failed';
    } catch (err) {
      btn.title = 'Copy failed';
      console.error('Fallback: Failed to copy text: ', err);
    }
    setTimeout(() => { btn.title = 'Copy the output to clipboard'; }, 1200);
    document.body.removeChild(textarea);
  }
});

function updateFormattedOutput(outputFormat) {
  // Always use the last fetched finalResultdb for switching formats
  switch (outputFormat) {
    case 'tdTemplate':
      formatForTdTemplate(finalResultdb);
      break;
    case 'testProjectPOM':
      formatForTestProjectPOM(finalResultdb);
      break;
    case 'snAppDeploy':
      formatForSnAppDeploy(finalResultdb);
      break;
  }
}

function formatForTdTemplate(data) {
  document.getElementById('formattedOutput').innerText = "Formatting results as per the selected output template... Almost there!";
  // Move main app(s) to the end, reverse dependencies
  const nonMain = data.filter(d => d.version !== 'sys' && !d.isMainApp);
  const main = data.filter(d => d.version !== 'sys' && d.isMainApp);
  const allAppsOrdered = [...nonMain].reverse().concat(main);
  const appsOutput = allAppsOrdered.map(d => `${d.groupId}:${d.artifactId}:${d.version}`).join(',\n');
  const pluginsOutput = data.filter(d => d.version === 'sys').map(d => d.scope).join(',\n');
  document.getElementById('formattedOutput').innerText = `"Plugins List:"\n${pluginsOutput}\n\n"Apps List:"\n${appsOutput}`;
}

function formatForTestProjectPOM(data) {
  document.getElementById('formattedOutput').innerText = "Formatting results as per the selected output template... Almost there!";
  // Move main app(s) to the end, reverse dependencies
  const plugins = Array.from(new Set(data.filter(d => d.version === 'sys').map(d => d.scope))).join(', ');
  const nonMain = data.filter(d => d.version !== 'sys' && !d.isMainApp);
  const main = data.filter(d => d.version !== 'sys' && d.isMainApp);
  const ordered = [...nonMain].reverse().concat(main);
  const scopedApps = Array.from(new Set(ordered.map(d => `"${d.artifactId}"`))).join(', ');
  const properties = Array.from(new Set(
    ordered
      .map(d => `<${d.artifactId}.version>${d.version}</${d.artifactId}.version>`)))
    .join('\n\t\t');
  const dependencies = Array.from(new Set(
    ordered
      .map(d => `      <dependency>\n        <groupId>${d.groupId}</groupId>\n        <artifactId>${d.artifactId}</artifactId>\n        <version>\${${d.artifactId}.version}</version>\n        <classifier>app</classifier>\n        <scope>compile</scope>\n      </dependency>`)))
    .join('\n');
  document.getElementById('formattedOutput').innerText = `\n    Add the following plugins list to the **AA_SetupIT** file:\n "plugins": [${plugins}]\n    \n    \nAdd the scoped apps to the **AB_LoadAppsIT** file:\n @WithScopedApp(value = {${scopedApps}}, loadDemoData = true)\n    \n    \nInsert the properties and dependencies below in the test project **POM file**:\n    <properties>\n${properties}\n</properties>\n    ${dependencies}`;
}

function formatForSnAppDeploy(data) {
  document.getElementById('formattedOutput').innerText = "Formatting results as per the selected output template... Almost there!";
  // Move main app(s) to the end, reverse dependencies
  const nonMain = data.filter(d => d.version !== 'sys' && !d.isMainApp);
  const main = data.filter(d => d.version !== 'sys' && d.isMainApp);
  const ordered = [...nonMain].reverse().concat(main);
  const appsData = {
    instanceURL: "http://localhost:8080/",
    username: "admin",
    password: "admin",
    plugins: Array.from(new Set(data.filter(d => d.version === 'sys').map(d => d.scope))),
    apps: Array.from(new Set(
      ordered.map(d =>
        JSON.stringify({
          type: 'NEXUS_REPOSITORY',
          groupId: d.groupId,
          artifactId: d.artifactId,
          version: d.version,
        })
      )
    )).map(app => JSON.parse(app)),
    hooks: {
      preDeploy: ""
    }
  };
  document.getElementById('formattedOutput').innerText = JSON.stringify(appsData, null, 2);
}
// --- End Dependency Fetching Logic ---


async function handleLogin() {
  try {
    const loginStatus = document.getElementById('loginStatus');
    if (!loginStatus) return;
    loginStatus.textContent = 'Opening BuildTools1...';
    console.log('[BT1 devtools_panel.js] Opening BuildTools1 login tab...');
    await chrome.tabs.create({
      url: 'https://buildtools1.service-now.com',
      active: true
    });
    loginStatus.textContent = 'Waiting for login...';
  } catch (error) {
    console.error('[BT1 devtools_panel.js] handleLogin error:', error);
    const loginStatus = document.getElementById('loginStatus');
    if (loginStatus) loginStatus.textContent = 'Error: ' + (error.message || 'Failed to start login');
  }
}

// Listen for token changes in storage (no polling)
function listenForToken() {
  chrome.storage.onChanged.addListener(function(changes, area) {
    console.log('[BT1 devtools_panel.js] chrome.storage.onChanged called', changes, area);
    if (area === 'local' && changes.bt1_token && changes.bt1_token.newValue) {
      console.log('[BT1 devtools_panel.js] Detected new bt1_token:', changes.bt1_token.newValue);
      userToken = changes.bt1_token.newValue;
      showMainUI();
      loadInitialData();
    }
  });
}

async function handleTokenReceived(token) {
  if (!token) return;
  userToken = token;
  await chrome.storage.local.set({ bt1_token: token });
  showMainUI();
  loadInitialData();
}

async function handleLogout() {
  await chrome.storage.local.remove(['bt1_token']);
  userToken = '';
  showLoginUI();
}

function showLoginUI() {
  const loginContainer = document.getElementById('loginContainer');
  const mainContent = document.getElementById('mainContent');
  const loginStatus = document.getElementById('loginStatus');
  if (loginContainer) loginContainer.style.display = 'block';
  if (mainContent) mainContent.style.display = 'none';
  if (loginStatus) loginStatus.textContent = 'You\'ll be redirected to BuildTools1 to log in';
}

function showMainUI() {
  console.log('[BT1 devtools_panel.js] showMainUI called');
  const loginContainer = document.getElementById('loginContainer');
  const mainContent = document.getElementById('mainContent');
  if (loginContainer) loginContainer.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
}

async function loadInitialData() {
  // Placeholder for any data to load after login
}

function getCookies(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, (cookies) => {
      resolve(cookies);
    });
  });
}

async function makeApiCall(url) {
  console.log('[BT1 devtools_panel.js] makeApiCall called:', url);
  const { bt1_token } = await chrome.storage.local.get('bt1_token');
  if (!bt1_token) {
    showLoginUI();
    throw new Error('Not authenticated. Please log in first.');
  }
  const apiUrl = url.includes('?') ? `${url}&sysparm_limit=1000` : `${url}?sysparm_limit=1000`;
  const cookies = await getCookies('buildtools1.service-now.com');
  const sessionCookie = cookies.find(c => c.name === 'JSESSIONID' || c.name.startsWith('BIGipServer'));
  if (!sessionCookie) {
    showLoginUI();
    throw new Error('Session expired. Please log in again.');
  }
  console.log('[BT1 devtools_panel.js] Using session cookie:', sessionCookie);
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-UserToken': bt1_token,
        'X-Transaction-Source': 'chrome-extension',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      credentials: 'include'
    });
  } catch (err) {
    console.error('[BT1 devtools_panel.js] Fetch error:', err);
    throw new Error('Network error or CORS issue. See console for details.');
  }
  console.log('[BT1 devtools_panel.js] API response status:', response.status);
  if (response.status === 401 || response.status === 403) {
    await chrome.storage.local.remove('bt1_token');
    userToken = '';
    showLoginUI();
    throw new Error('Session expired. Please log in again.');
  }
  if (!response.ok) {
    let errorMessage = `API request failed with status ${response.status}`;
    try {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
    } catch {}
    throw new Error(errorMessage);
  }
  const result = await response.json();
  console.log('[BT1 devtools_panel.js] API call result:', result);
  return result;
}

document.addEventListener('DOMContentLoaded', function() {
  init();
  listenForToken();
});
