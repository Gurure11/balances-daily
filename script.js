const SPREADSHEET_ID = "1UQGbv8dZcvOzshC5AimrZC7dFr6QdyxkUrh2JP-kitQ";

/*
  1. Deploy the Apps Script as a Web App.
  2. Copy the deployment URL.
  3. Paste it below.
*/
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

const fileInput = document.getElementById("fileInput");
const refreshBtn = document.getElementById("refreshBtn");
const lookupBtn = document.getElementById("lookupBtn");
const statusBox = document.getElementById("statusBox");

let records = [];

fileInput.addEventListener("change", handleUpload);
refreshBtn.addEventListener("click", loadSheetData);
lookupBtn.addEventListener("click", lookupBalanceByDate);

function setStatus(message, type = "") {
  statusBox.className = "status-card";
  if (type) statusBox.classList.add(type);
  statusBox.textContent = message;
}

async function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) {
    setStatus("Please paste your deployed Google Apps Script Web App URL into script.js first.", "error");
    return;
  }

  try {
    setStatus("Reading statement...");

    const text = await extractText(file);
    const parsed = parseStatement(text, file.name);

    setStatus("Saving extracted statement data to Google Sheets...");

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "append",
        ...parsed
      })
    });

    const resultText = await response.text();
    let result;

    try {
      result = JSON.parse(resultText);
    } catch {
      throw new Error("Apps Script did not return JSON. Response: " + resultText);
    }

    if (!result.success) {
      throw new Error(result.error || "Google Sheets save failed.");
    }

    records.unshift(result.record || parsed);
    renderDashboard();

    setStatus("Upload saved successfully to Google Sheet: Bank.", "success");
    fileInput.value = "";
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "pdf") return extractPdfText(file);
  if (ext === "csv") return await file.text();
  if (ext === "xlsx" || ext === "xls") return extractExcelText(file);

  throw new Error("Unsupported file type. Please upload PDF, CSV, XLS, or XLSX.");
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;

  let fullText = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(" ") + "\n";
  }

  return fullText;
}

async function extractExcelText(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  let text = "";

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_csv(sheet);
    text += rows + "\n";
  });

  return text;
}

function parseStatement(text, fileName) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  const upper = cleanText.toUpperCase();

  const bankName = detectBank(upper);
  const accountHolder = detectAccountHolder(cleanText);
  const accountNumber = detectAccountNumber(cleanText);
  const statementDate = detectStatementDate(cleanText);
  const balance = detectClosingBalance(cleanText);

  return {
    uploadId: "UPL-" + Date.now(),
    uploadedAt: new Date().toISOString(),
    fileName,
    bankName,
    accountHolder,
    accountNumber,
    statementDate,
    transactionDate: statementDate,
    description: "Statement upload",
    debit: "",
    credit: "",
    runningBalance: balance,
    closingBalance: balance,
    currency: "ZAR"
  };
}

function detectBank(upperText) {
  const banks = [
    ["STANDARD BANK", "Standard Bank"],
    ["FIRST NATIONAL BANK", "FNB"],
    ["FNB", "FNB"],
    ["NEDBANK", "Nedbank"],
    ["ABSA", "ABSA"],
    ["CAPITEC", "Capitec"],
    ["INVESTEC", "Investec"],
    ["TYMEBANK", "TymeBank"],
    ["AFRICAN BANK", "African Bank"]
  ];

  const match = banks.find(([keyword]) => upperText.includes(keyword));
  return match ? match[1] : "Unknown Bank";
}

function detectAccountHolder(text) {
  const patterns = [
    /account\s*holder[:\s]+([A-Z0-9 &().,'/-]{3,80})/i,
    /account\s*name[:\s]+([A-Z0-9 &().,'/-]{3,80})/i,
    /name[:\s]+([A-Z0-9 &().,'/-]{3,80})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return cleanField(match[1]);
  }

  if (/ON\s*POINT|ONPOINT/i.test(text)) return "OnPoint Group";

  return "OnPoint Group";
}

function detectAccountNumber(text) {
  const patterns = [
    /account\s*(number|no|num)[:\s]*([0-9 -]{6,20})/i,
    /acc\s*(number|no|num)[:\s]*([0-9 -]{6,20})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2]) return match[2].replace(/\D/g, "");
  }

  const fallback = text.match(/\b\d{8,13}\b/);
  return fallback ? fallback[0] : "Unknown";
}

function detectStatementDate(text) {
  const isoDate = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoDate) return normalizeDate(isoDate[0]);

  const date = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (date) return normalizeDate(date[0]);

  return new Date().toISOString().slice(0, 10);
}

function detectClosingBalance(text) {
  const balancePatterns = [
    /closing\s*balance[:\s-]*R?\s*([+-]?\d[\d,\s]*\.\d{2})/i,
    /available\s*balance[:\s-]*R?\s*([+-]?\d[\d,\s]*\.\d{2})/i,
    /balance[:\s-]*R?\s*([+-]?\d[\d,\s]*\.\d{2})/i
  ];

  for (const pattern of balancePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) return numberString(match[1]);
  }

  const amounts = text.match(/[+-]?\d{1,3}(?:[,\s]\d{3})*\.\d{2}/g);
  if (!amounts || amounts.length === 0) return "0.00";

  return numberString(amounts[amounts.length - 1]);
}

function cleanField(value) {
  return value
    .replace(/account|number|statement|date|balance/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

function numberString(value) {
  const cleaned = String(value).replace(/\s/g, "").replace(/,/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function normalizeDate(value) {
  const parts = value.replace(/\//g, "-").split("-").map(Number);

  if (String(parts[0]).length === 4) {
    const [y, m, d] = parts;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const [d, m, y] = parts;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function loadSheetData() {
  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) {
    setStatus("Please paste your deployed Google Apps Script Web App URL into script.js first.", "error");
    return;
  }

  try {
    setStatus("Loading existing data from Google Sheets...");

    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=list`);
    const result = await response.json();

    if (!result.success) throw new Error(result.error || "Could not load sheet data.");

    records = result.records || [];
    renderDashboard();

    setStatus("Sheet data loaded successfully.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

async function lookupBalanceByDate() {
  const date = document.getElementById("historyDate").value;

  if (!date) {
    setStatus("Please choose a date for balance lookup.", "error");
    return;
  }

  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) {
    setStatus("Please paste your deployed Google Apps Script Web App URL into script.js first.", "error");
    return;
  }

  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=balanceByDate&date=${encodeURIComponent(date)}`);
    const result = await response.json();

    if (!result.success) throw new Error(result.error || "Lookup failed.");

    renderHistoryResults(date, result.records || []);
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

function renderDashboard() {
  const banks = new Set(records.map(r => r.bankName).filter(Boolean));
  const accounts = new Set(records.map(r => `${r.bankName}-${r.accountNumber}`).filter(Boolean));

  const latestByAccount = {};

  records.forEach(record => {
    const key = `${record.bankName}-${record.accountNumber}`;
    const dateValue = new Date(record.statementDate || record.uploadedAt || 0).getTime();

    if (!latestByAccount[key] || dateValue >= latestByAccount[key]._dateValue) {
      latestByAccount[key] = { ...record, _dateValue: dateValue };
    }
  });

  const latestRecords = Object.values(latestByAccount);

  const total = latestRecords.reduce((sum, r) => {
    return sum + (parseFloat(r.runningBalance || r.closingBalance || 0) || 0);
  }, 0);

  document.getElementById("totalBanks").textContent = banks.size;
  document.getElementById("totalAccounts").textContent = accounts.size;
  document.getElementById("consolidatedBalance").textContent = formatCurrency(total);
  document.getElementById("lastUpload").textContent = records[0]?.uploadedAt
    ? new Date(records[0].uploadedAt).toLocaleDateString()
    : "-";

  renderBanks(latestRecords);
  renderTransactions(records.slice(0, 12));
}

function renderBanks(latestRecords) {
  const container = document.getElementById("banksContainer");
  container.innerHTML = "";

  if (latestRecords.length === 0) {
    container.innerHTML = `<p class="empty">No accounts available yet.</p>`;
    return;
  }

  const grouped = {};

  latestRecords.forEach(record => {
    if (!grouped[record.bankName]) grouped[record.bankName] = [];
    grouped[record.bankName].push(record);
  });

  Object.entries(grouped).forEach(([bankName, accounts], index) => {
    const total = accounts.reduce((sum, r) => sum + (parseFloat(r.runningBalance || r.closingBalance || 0) || 0), 0);

    const card = document.createElement("div");
    card.className = "bank-card";

    card.innerHTML = `
      <div class="bank-header" onclick="toggleBank(${index})">
        <div>
          <h4>${bankName}</h4>
          <p>${accounts.length} account(s)</p>
        </div>
        <div class="bank-balance">${formatCurrency(total)}</div>
      </div>

      <div class="bank-details" id="bank-${index}">
        ${accounts.map(account => `
          <div class="detail-row">
            <span>Account Holder</span>
            <strong>${account.accountHolder || "Unknown"}</strong>
          </div>
          <div class="detail-row">
            <span>Account Number</span>
            <strong>${account.accountNumber || "Unknown"}</strong>
          </div>
          <div class="detail-row">
            <span>Statement Date</span>
            <strong>${account.statementDate || "-"}</strong>
          </div>
          <div class="detail-row">
            <span>Running Balance</span>
            <strong>${formatCurrency(account.runningBalance || account.closingBalance || 0)}</strong>
          </div>
          <br>
        `).join("")}
      </div>
    `;

    container.appendChild(card);
  });
}

function toggleBank(index) {
  document.getElementById(`bank-${index}`).classList.toggle("show");
}

function renderTransactions(rows) {
  const table = document.getElementById("transactionsTable");

  if (!rows.length) {
    table.innerHTML = `<tr><td colspan="5" class="empty">No data loaded yet.</td></tr>`;
    return;
  }

  table.innerHTML = rows.map(row => `
    <tr>
      <td>${row.statementDate || row.transactionDate || "-"}</td>
      <td>${row.bankName || "-"}</td>
      <td>${row.accountNumber || "-"}</td>
      <td>${row.accountHolder || "-"}</td>
      <td>${formatCurrency(row.runningBalance || row.closingBalance || 0)}</td>
    </tr>
  `).join("");
}

function renderHistoryResults(date, rows) {
  const container = document.getElementById("historyResults");

  if (!rows.length) {
    container.innerHTML = `<p class="empty">No balances found for ${date}.</p>`;
    return;
  }

  container.innerHTML = rows.map(row => `
    <div class="history-item">
      <div>
        <strong>${row.bankName}</strong><br>
        <span>${row.accountHolder} - ${row.accountNumber}</span>
      </div>
      <strong>${formatCurrency(row.runningBalance || row.closingBalance || 0)}</strong>
    </div>
  `).join("");
}

function formatCurrency(value) {
  const number = parseFloat(value || 0) || 0;

  return number.toLocaleString("en-ZA", {
    style: "currency",
    currency: "ZAR"
  });
}

// Try loading existing sheet data automatically when app opens.
window.addEventListener("load", () => {
  if (GOOGLE_SCRIPT_URL.includes("script.google.com")) {
    loadSheetData();
  }
});
