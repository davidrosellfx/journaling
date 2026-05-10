import { state } from '../state.js';
import { storage } from '../storage.js';
import { IMPORT_HEADERS, rowToTrade } from '../utils/sheet-parsers.js';
import { parsePastedText } from '../utils/paste-parser.js';
import { fetchAppsScript } from '../utils/apps-script-import.js';
import { parseCsv, toCsv, downloadFile } from '../utils/csv.js';
import { mapAppsScriptTrade } from '../utils/apps-script-import.js';
import { router } from '../router.js';

let activeTab = 'paste';
let pasteSheet = 'ZONAS';
let rows = [];   // array of { [key]: value }
const INITIAL_ROWS = 20;

export function importView(container) {
  if (!rows.length) rows = newRows(INITIAL_ROWS);
  render(container);
}

function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Importar trades</h1>
        <div class="sub">Pega desde Excel, importa desde Apps Script o sube un archivo</div>
      </div>
    </div>

    <div class="import-tabs">
      <button class="import-tab ${activeTab === 'paste' ? 'active' : ''}" data-tab="paste">Tabla / Pegar desde Excel</button>
      <button class="import-tab ${activeTab === 'url' ? 'active' : ''}" data-tab="url">Desde Apps Script (URL)</button>
      <button class="import-tab ${activeTab === 'file' ? 'active' : ''}" data-tab="file">Subir archivo (JSON / CSV)</button>
    </div>

    <div id="tabContent"></div>
  `;
  container.querySelectorAll('.import-tab').forEach(b => {
    b.addEventListener('click', () => { activeTab = b.dataset.tab; render(container); });
  });
  const c = container.querySelector('#tabContent');
  if (activeTab === 'paste') paintPasteTab(c);
  else if (activeTab === 'url') paintUrlTab(c);
  else paintFileTab(c);
}

// ── PASTE / TABLE TAB ────────────────────────────────────────
function paintPasteTab(container) {
  const headers = IMPORT_HEADERS[pasteSheet];
  container.innerHTML = `
    <div class="import-toolbar">
      <select id="sheetSel" class="select">
        <option value="ZONAS"   ${pasteSheet === 'ZONAS' ? 'selected' : ''}>Estrategia: ZONAS</option>
        <option value="LIQUIDEZ" ${pasteSheet === 'LIQUIDEZ' ? 'selected' : ''}>Estrategia: LIQUIDEZ</option>
        <option value="NASDAQ"  ${pasteSheet === 'NASDAQ' ? 'selected' : ''}>Estrategia: NASDAQ</option>
      </select>
      <button class="btn" id="addRowBtn">+ Añadir 5 filas</button>
      <button class="btn" id="clearBtn">Limpiar tabla</button>
      <button class="btn" id="exportBtn">Exportar CSV</button>
      <button class="btn primary" id="importBtn">Importar trades</button>
      <span id="rowSummary" style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted);"></span>
    </div>
    <div class="import-table-wrap">
      <table class="import-table">
        <thead>
          <tr>
            ${headers.map(h => `<th>${h.label}${h.calc ? ' <span style="color:var(--dim)">(calc)</span>' : ''}</th>`).join('')}
            <th>Estado</th>
          </tr>
        </thead>
        <tbody id="rowsBody"></tbody>
      </table>
    </div>
    <p style="margin-top:14px;color:var(--muted);font-family:var(--mono);font-size:11px;">
      Tip: copia un rango directamente desde tu hoja de Google Sheets y pega en cualquier celda con Ctrl+V.
      Las columnas en gris (BALANCE, DD, etc.) son cálculos del Sheet — se aceptan en el paste pero se ignoran al importar.
    </p>
    <div id="importResult"></div>
  `;

  container.querySelector('#sheetSel').addEventListener('change', e => {
    pasteSheet = e.target.value;
    rows = newRows(INITIAL_ROWS);
    paintPasteTab(container);
  });
  container.querySelector('#addRowBtn').addEventListener('click', () => {
    rows.push(...newRows(5));
    paintRows(container);
  });
  container.querySelector('#clearBtn').addEventListener('click', () => {
    rows = newRows(INITIAL_ROWS);
    paintRows(container);
    container.querySelector('#importResult').innerHTML = '';
  });
  container.querySelector('#exportBtn').addEventListener('click', () => exportRows());
  container.querySelector('#importBtn').addEventListener('click', () => doImport(container));

  paintRows(container);
}

function newRows(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({});
  return arr;
}

function paintRows(container) {
  const headers = IMPORT_HEADERS[pasteSheet];
  const tbody = container.querySelector('#rowsBody');
  tbody.innerHTML = '';
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      if (h.calc) td.classList.add('calc');
      const inp = document.createElement('input');
      inp.value = row[h.key] || '';
      inp.dataset.row = ri;
      inp.dataset.key = h.key;
      if (h.calc) inp.tabIndex = -1;
      if (h.key === 'idx' && !row.idx) inp.placeholder = String(ri + 1);
      inp.addEventListener('input', () => {
        rows[ri][h.key] = inp.value;
        updateRowStatus(tr, ri);
      });
      inp.addEventListener('paste', e => handlePaste(e, ri, headers.findIndex(x => x.key === h.key), container));
      td.appendChild(inp);
      tr.appendChild(td);
    });
    const status = document.createElement('td');
    status.className = 'row-status';
    tr.appendChild(status);
    tbody.appendChild(tr);
    updateRowStatus(tr, ri);
  });
  updateSummary(container);
}

function updateRowStatus(tr, ri) {
  const row = rows[ri];
  const empty = !row || Object.keys(row).every(k => !row[k] || String(row[k]).trim() === '' || ['idx', 'trade', 'dia', 'time', 'eur', 'usd', 'balance', 'pnlacc', 'max', 'ddp', 'ddpct', 'wst', 'wspct'].includes(k));
  const statusTd = tr.lastElementChild;
  if (empty) {
    statusTd.className = 'row-status';
    statusTd.textContent = '';
    return;
  }
  const r = rowToTrade(pasteSheet, row);
  if (r.error) {
    statusTd.className = 'row-status err';
    statusTd.textContent = '✗';
    statusTd.title = r.error;
  } else {
    statusTd.className = 'row-status ok';
    statusTd.textContent = '✓';
    statusTd.title = 'Listo para importar';
  }
}

function updateSummary(container) {
  const headers = IMPORT_HEADERS[pasteSheet];
  let valid = 0, errs = 0;
  rows.forEach(row => {
    const empty = Object.keys(row).every(k => !row[k] || String(row[k]).trim() === '' || ['idx', 'trade', 'dia', 'time', 'eur', 'usd', 'balance', 'pnlacc', 'max', 'ddp', 'ddpct', 'wst', 'wspct'].includes(k));
    if (empty) return;
    const r = rowToTrade(pasteSheet, row);
    if (r.error) errs++;
    else valid++;
  });
  const sumEl = container.querySelector('#rowSummary');
  if (sumEl) sumEl.textContent = `${valid} válidos · ${errs} con errores · ${rows.length} filas`;
}

function handlePaste(e, ri, ci, container) {
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text || !text.includes('\t') && !text.includes('\n')) return; // single-cell paste, let native handle
  e.preventDefault();
  const matrix = parsePastedText(text);
  const headers = IMPORT_HEADERS[pasteSheet];
  // Ensure enough rows
  while (rows.length < ri + matrix.length) rows.push({});
  matrix.forEach((mrow, i) => {
    mrow.forEach((cell, j) => {
      const targetCi = ci + j;
      if (targetCi >= headers.length) return;
      const key = headers[targetCi].key;
      rows[ri + i][key] = String(cell).trim();
    });
  });
  paintRows(container);
}

function exportRows() {
  const headers = IMPORT_HEADERS[pasteSheet];
  const data = [headers.map(h => h.label)];
  rows.forEach(row => {
    if (Object.keys(row).every(k => !row[k])) return;
    data.push(headers.map(h => row[h.key] || ''));
  });
  downloadFile(`tradinverso-${pasteSheet.toLowerCase()}-${todayStr()}.csv`, toCsv(data), 'text/csv');
}

function doImport(container) {
  const trades = [];
  let errs = 0, empty = 0;
  rows.forEach(row => {
    const isEmpty = Object.keys(row).every(k => !row[k] || String(row[k]).trim() === '' || ['idx', 'trade', 'dia', 'time', 'eur', 'usd', 'balance', 'pnlacc', 'max', 'ddp', 'ddpct', 'wst', 'wspct'].includes(k));
    if (isEmpty) { empty++; return; }
    const r = rowToTrade(pasteSheet, row);
    if (r.error) { errs++; return; }
    trades.push(r.trade);
  });
  const result = container.querySelector('#importResult');
  if (!trades.length) {
    result.className = 'import-result err';
    result.innerHTML = `Nada que importar · ${errs} fila${errs !== 1 ? 's' : ''} con errores · ${empty} vacías`;
    return;
  }
  const { added, dup } = state.addMany(trades);
  result.className = 'import-result ok';
  result.innerHTML = `${added} importados · ${dup} duplicados ignorados${errs > 0 ? ` · ${errs} con errores (revisa filas marcadas con ✗)` : ''}`;
  if (added > 0) {
    rows = newRows(INITIAL_ROWS);
    paintRows(container);
  }
}

// ── URL TAB ──────────────────────────────────────────────────
function paintUrlTab(container) {
  const url = storage.getAppsScriptUrl();
  const capital = storage.getCapital();
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Importar desde Apps Script</div>
      <div class="card-sub">URL pública del endpoint de tu Google Apps Script · capital actual ${capital.toLocaleString('es-ES')} €</div>
      <div class="form" style="max-width:none;">
        <div class="form-field">
          <label class="form-label">URL del endpoint</label>
          <input class="form-input" type="url" id="urlInput" value="${url}" placeholder="https://script.google.com/macros/s/.../exec">
        </div>
        <div class="form-actions">
          <button class="btn primary" id="urlImportBtn">Importar</button>
        </div>
      </div>
      <div id="urlResult" style="margin-top:16px;"></div>
    </div>
  `;
  container.querySelector('#urlImportBtn').addEventListener('click', async () => {
    const u = container.querySelector('#urlInput').value.trim();
    if (!u) return;
    storage.setAppsScriptUrl(u);
    const result = container.querySelector('#urlResult');
    result.className = '';
    result.innerHTML = '<div class="loader"><div class="spinner"></div><div>Cargando trades…</div></div>';
    try {
      const trades = await fetchAppsScript(u, capital);
      if (!trades.length) {
        result.className = 'import-result err';
        result.innerHTML = 'El endpoint no devolvió trades.';
        return;
      }
      const { added, dup } = state.addMany(trades);
      result.className = 'import-result ok';
      result.innerHTML = `${added} importados · ${dup} duplicados ignorados de ${trades.length} recibidos.`;
    } catch (e) {
      result.className = 'import-result err';
      result.innerHTML = 'Error: ' + e.message + '. Verifica que la URL del Apps Script sea correcta y esté publicada.';
    }
  });
}

// ── FILE TAB ─────────────────────────────────────────────────
function paintFileTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Subir archivo</div>
      <div class="card-sub">Acepta JSON (formato Apps Script o export propio) o CSV (formato export propio)</div>
      <div class="form-field" style="margin-top:14px;">
        <input type="file" id="fileInput" accept=".json,.csv" class="form-input" style="padding:14px;">
      </div>
      <div id="fileResult" style="margin-top:16px;"></div>
    </div>
  `;
  container.querySelector('#fileInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const result = container.querySelector('#fileResult');
    try {
      const text = await f.text();
      const capital = storage.getCapital();
      let trades = [];
      if (f.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (parsed.trades || []);
        // Try canonical shape first; if no pnl_pct, fall back to Apps Script mapping
        if (arr.length && arr[0].pnl_pct != null) {
          trades = arr;
        } else {
          trades = arr.map(t => mapAppsScriptTrade(t, capital)).filter(Boolean);
        }
      } else {
        // CSV: assume first row is headers matching IMPORT_HEADERS for one strategy.
        // Detect strategy by header presence.
        const csv = parseCsv(text);
        const header = csv[0].map(h => h.toLowerCase());
        let detectedSheet = 'ZONAS';
        if (header.includes('htf') && header.includes('ltf') && header.includes('rr') && !header.includes('pip sl') && !header.includes('par')) detectedSheet = 'NASDAQ';
        else if (header.includes('htf') && header.includes('ltf')) detectedSheet = 'LIQUIDEZ';
        const headers = IMPORT_HEADERS[detectedSheet];
        for (let i = 1; i < csv.length; i++) {
          const row = {};
          headers.forEach((h, j) => row[h.key] = (csv[i][j] || '').trim());
          const r = rowToTrade(detectedSheet, row);
          if (r.trade) trades.push(r.trade);
        }
      }
      if (!trades.length) {
        result.className = 'import-result err';
        result.innerHTML = 'No se pudo extraer ningún trade del archivo.';
        return;
      }
      const { added, dup } = state.addMany(trades);
      result.className = 'import-result ok';
      result.innerHTML = `${added} importados · ${dup} duplicados ignorados de ${trades.length} extraídos.`;
    } catch (err) {
      result.className = 'import-result err';
      result.innerHTML = 'Error al leer el archivo: ' + err.message;
    }
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
