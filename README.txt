# OnPoint Group Bank Dashboard

## Files

- `index.html`
- `style.css`
- `script.js`
- `Code.gs`

## Setup

### 1. Google Apps Script

1. Open https://script.google.com
2. Create a new project.
3. Paste the contents of `Code.gs`.
4. Save.
5. Run `setupBankDashboard` once and approve permissions.
6. Click **Deploy > New deployment**.
7. Choose **Web app**.
8. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Deploy and copy the Web App URL.

### 2. Connect the website

Open `script.js`.

Replace:

```js
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

with your deployed Web App URL.

### 3. Open the app

Open `index.html` in your browser.

## Why your error happened

This error happens when `doPost(e)` is run manually inside Apps Script.

Manual runs do not provide the `e.postData` object. `doPost(e)` only receives `postData` when a real HTTP POST request is sent from the web app.

This fixed version prevents that crash and returns a clear message instead.
