import { state } from '../state.js';
import { storage } from '../storage.js';
import { theme } from '../theme.js';
import { downloadFile } from '../utils/csv.js';
import { openModal } from '../components/modal.js';
import { router } from '../router.js';

export function settingsView(container) {
  const url = storage.getAppsScriptUrl();
  const tradeCount = state.trades.length;
  const countSheet = sheet => state.trades.filter(t => t.sheet === sheet).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Ajustes</h1>
        <div class="sub">Configuración de la app · ${tradeCount} trades almacenados</div>
      </div>
    </div>

    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">URL del Apps Script</div>
          <div class="setting-desc">Endpoint público que devuelve tus trades en JSON. Se usa para reimportar.</div>
        </div>
        <div class="setting-control">
          <input class="form-input" type="url" id="urlInput" value="${url}" placeholder="https://script.google.com/macros/s/.../exec">
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Tema</div>
          <div class="setting-desc">Modo oscuro o claro. También se puede cambiar desde la barra lateral.</div>
        </div>
        <div class="setting-control">
          <select class="select" id="themeSel">
            <option value="dark"  ${theme.current() === 'dark'  ? 'selected' : ''}>Oscuro</option>
            <option value="light" ${theme.current() === 'light' ? 'selected' : ''}>Claro</option>
          </select>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Exportar datos</div>
          <div class="setting-desc">Descarga un JSON con todos tus trades. Sirve como backup y se puede reimportar.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn primary" id="exportBtn">Descargar JSON</button>
        </div>
      </div>
    </div>

    <div class="section-title">Mantenimiento</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Reparar valores anómalos</div>
          <div class="setting-desc">
            Corrige trades cuyos % salen desorbitados o están escalados con un capital incorrecto.
            <br>· <strong>Caso A</strong> (auto): trades con |%| &gt; 50 — se reescalan al capital del sheet (50.000 €).
            <br>· <strong>Caso B</strong> (manual): si importaste con capital incorrecto en versiones anteriores, indica qué capital usaste y se ajustarán los trades de las estrategias seleccionadas.
          </div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn" id="repairBtn">Reparar…</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar trades por estrategia</div>
          <div class="setting-desc">Elimina solo los trades de una estrategia. Útil para reimportar desde cero.</div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn danger" data-wipe-sheet="ZONAS">Zonas (${countSheet('ZONAS')})</button>
          <button class="btn danger" data-wipe-sheet="LIQUIDEZ">Liquidez (${countSheet('LIQUIDEZ')})</button>
          <button class="btn danger" data-wipe-sheet="NASDAQ">Nasdaq (${countSheet('NASDAQ')})</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar todos los datos</div>
          <div class="setting-desc">Elimina todos los trades y la configuración. Esta acción no se puede deshacer.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn danger" id="wipeBtn">Borrar todo</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">Sobre Tradinverso</div>
      <div class="card-sub">Trading journal local · sin servidor · datos en tu navegador (localStorage)</div>
      <p style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:12px;">
        Esta app funciona 100% en tu navegador. Tus datos no salen de tu equipo.
        Toda la operativa se mide en porcentajes; la conversión a € se hará cuando
        asignes cada trade a una cuenta concreta (próximamente, en gestión de cuentas).
        Para usarla en otro dispositivo: exporta el JSON desde aquí, ábrelo en el otro
        navegador y reimpórtalo desde la sección Importar.
      </p>
    </div>
  `;

  container.querySelector('#urlInput').addEventListener('change', e => {
    storage.setAppsScriptUrl(e.target.value.trim());
  });
  container.querySelector('#themeSel').addEventListener('change', e => theme.apply(e.target.value));
  container.querySelector('#exportBtn').addEventListener('click', () => {
    const data = storage.exportJson();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    downloadFile(`tradinverso-export-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
  });
  container.querySelector('#wipeBtn').addEventListener('click', () => {
    openModal({
      title: 'Borrar todos los datos',
      body: `Vas a eliminar <strong>${state.trades.length} trades</strong> y toda tu configuración.
             Esta acción <strong>no se puede deshacer</strong>. ¿Continuar?`,
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: 'Sí, borrar todo', variant: 'danger', onClick: close => {
          storage.clearAll();
          state.replaceAll([]);
          close();
          router.go('#/dashboard');
        } },
      ],
    });
  });

  container.querySelector('#repairBtn').addEventListener('click', () => openRepairModal(container));

  container.querySelectorAll('[data-wipe-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sheet = btn.dataset.wipeSheet;
      const n = countSheet(sheet);
      if (!n) return;
      openModal({
        title: `Borrar trades de ${sheet}`,
        body: `Vas a eliminar <strong>${n} trades</strong> de la estrategia ${sheet}. Las demás estrategias no se ven afectadas. ¿Continuar?`,
        actions: [
          { label: 'Cancelar', onClick: close => close() },
          { label: `Sí, borrar ${n}`, variant: 'danger', onClick: close => {
            const removed = state.removeBySheet(sheet);
            close();
            openModal({
              title: 'Borrado',
              body: `<strong>${removed}</strong> trades de ${sheet} eliminados.`,
              actions: [{ label: 'Cerrar', onClick: c => { c(); settingsView(container); } }],
            });
          } },
        ],
      });
    });
  });
}

function openRepairModal(container) {
  const caseA = state.trades.filter(t => Math.abs(t.pnl_pct || 0) > 50).length;
  const sheets = [...new Set(state.trades.map(t => t.sheet))];
  openModal({
    title: 'Reparar valores anómalos',
    body: `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Caso A · valores fuera de rango</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:8px;">
          Trades con |%| &gt; 50 (probablemente son € en vez de %). Detectados: <strong>${caseA}</strong>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">
      <div>
        <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Caso B · capital incorrecto al importar</div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:12px;">
          Si importaste con un capital distinto a 50.000 €, los % quedaron escalados.
          Indica el capital que usaste entonces y selecciona qué estrategias re-escalar.
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:10px 14px;align-items:center;">
          <label style="font-size:11px;font-family:var(--mono);color:var(--muted);">Capital antiguo</label>
          <input class="form-input" type="number" id="oldCapInput" placeholder="ej. 10000" min="100" step="100">
          <label style="font-size:11px;font-family:var(--mono);color:var(--muted);">Estrategias</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['ZONAS','LIQUIDEZ','NASDAQ'].map(s => `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                <input type="checkbox" data-sheet="${s}" ${sheets.includes(s) ? '' : 'disabled'}> ${s}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      ...(caseA > 0 ? [{ label: `Reparar Caso A (${caseA})`, variant: 'primary', onClick: close => {
        const fixed = state.repairAnomalousPct();
        close();
        showRepairResult(container, fixed, 'A');
      } }] : []),
      { label: 'Aplicar Caso B', onClick: close => {
        const root = document.getElementById('modal-root');
        const oldCap = parseFloat(root.querySelector('#oldCapInput').value);
        const checked = [...root.querySelectorAll('[data-sheet]:checked')].map(c => c.dataset.sheet);
        if (!oldCap || oldCap <= 0) { alert('Indica un capital antiguo válido'); return; }
        if (!checked.length) { alert('Selecciona al menos una estrategia'); return; }
        const fixed = state.repairAnomalousPct({ oldCapital: oldCap, sheets: checked });
        close();
        showRepairResult(container, fixed, 'B');
      } },
    ],
  });
}

function showRepairResult(container, fixed, mode) {
  openModal({
    title: 'Reparados',
    body: fixed > 0
      ? `<strong>${fixed} trades</strong> corregidos (Caso ${mode}). Revisa el dashboard para confirmar.`
      : `Ningún trade requería corrección.`,
    actions: [
      { label: 'Cerrar', onClick: c => { c(); settingsView(container); } },
      ...(fixed > 0 ? [{ label: 'Ir al dashboard', variant: 'primary', onClick: c => { c(); router.go('#/dashboard'); } }] : []),
    ],
  });
}
