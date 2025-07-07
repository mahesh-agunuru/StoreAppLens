# StoreAppLens Chrome Extension

A Chrome DevTools extension for ServiceNow Store App dependency analysis and export.

---

## 🚀 Features
- **Fetch and analyze dependencies** for ServiceNow Store apps directly from the list view.
- **Switch output formats instantly** (TD Template, Test Project POM, SN App Deploy) with no re-query.
- **Copy or download** formatted output in one click.
- **ServiceNow-native UI/UX:** Polaris/Now Experience styling, tooltips, and robust error handling.

---

## 🛠️ Installation
1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the `chrome_extension_current` folder.

---

## 🔑 How to Login
1. Open your ServiceNow instance (e.g., BuildTools1) and log in as usual.
2. Open Chrome DevTools (`F12` or `Ctrl+Shift+I`).
3. Go to the **StoreAppLens** tab in DevTools.
4. If prompted, click **Login to BuildTools1**. A new tab will open for login.
5. Once logged in, return to the DevTools panel. The extension will automatically detect your session.

---

## 📦 How to Use
### 1. **Select Apps**
- Use the native ServiceNow list view checkboxes to select one or more apps.

### 2. **Fetch Dependencies**
- Click **Get Dependencies** in the StoreAppLens panel.
- The extension will query the BuildTools1 API for all dependencies of the selected app(s).
- The output area will display a loading message, then the results.

### 3. **Switch Output Format**
- After fetching, use the format buttons:
    - **TD Template**
    - **Test Project POM**
    - **SN App Deploy**
- Switching formats is instant and does not re-query the backend.

### 4. **Copy or Download Output**
- Use **Copy Output** to copy results to your clipboard.
- Use **Download Output** to save as a file.

---

## 🔒 Authentication Details
- **Session-based authentication:** Uses your existing ServiceNow login session and session cookies.
- **Token extraction:** Content script extracts the `g_ck` or `sysparm_ck` token from the ServiceNow page.
- **No passwords or OAuth:** No credentials are stored or required beyond your ServiceNow session.

---

## 🧩 Internal Implementation
### **Architecture**
- **DevTools Panel:** UI and logic in `devtools_panel.html` + `devtools_panel.js`.
- **Content Script:** (`content.js`, `inject_token.js`) extracts tokens and app selections from the ServiceNow DOM.
- **Background:** (`background.js`) minimal, for lifecycle events.

### **Key Flows**
- **Authentication:**
  - Injected script grabs session token and saves to extension storage.
  - DevTools panel retrieves and uses token for API calls.
- **Dependency Fetching:**
  - Gets selected app sys_ids via content script.
  - Queries BuildTools1 API for dependencies.
  - Deduplicates and orders dependencies (main app always last, dependencies reversed if configured).
  - Fetches artifact details for each dependency.
- **Output Formatting:**
  - Three formats: TD Template, Test Project POM, SN App Deploy.
  - Format switching is instant using cached data.
- **Copy/Download:**
  - Clipboard API with fallback for DevTools context.
  - Downloads output as a file.

---

## 🎨 UI/UX
- ServiceNow Polaris/Now Experience styling.
- Buttons enabled/disabled based on output state.
- Tooltips on all buttons.
- Main app always at the end of the dependency list (or reversed, as configured).
- Robust error handling and debug logging.

---

## 🛡️ Security
- No passwords or OAuth tokens are stored.
- All authentication is via your browser session and ServiceNow’s own security.
- Extension only runs on ServiceNow domains (as per manifest permissions).

---

## 🧹 Troubleshooting
- If you see “Not authenticated” or “No token,” ensure you are logged into ServiceNow in the same browser.
- If copy-to-clipboard fails in DevTools, the extension uses a fallback method.
- For API errors, check your ServiceNow session and network connectivity.

---

## 🛠️ Customization & Extending
- Add new output formats by extending formatter functions in `devtools_panel.js`.
- To support other authentication methods, update the token extraction and API logic.
- For advanced dependency graph ordering, enhance the deduplication and sorting logic.

---

## 📁 File Structure
```
chrome_extension_current/
├── background.js
├── compass.png
├── content.js
├── devtools.html
├── devtools.js
├── devtools_panel.html
├── devtools_panel.js
├── inject_token.js
├── manifest.json
└── README.md
```

