import { state } from '../state.js';
import { storage } from '../storage.js';
import { theme } from '../theme.js';
import { downloadFile } from '../utils/csv.js';
import { openModal } from '../components/modal.js';
import { router } from '../router.js';

export function settingsView(container) {
  const capital = storage.getCapital();
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
          <div class="setting-label">Capital base</div>
          <div class="setting-desc">Usado para convertir importes en € a % al importar desde Apps Script. Cambiarlo no recalcula trades existentes.</div>
        </div>
        <div class="setting-control">
          <input class="form-input" type="number" id="capitalInput" value="${capital}" min="1" step="100">
        </div>
      </div>

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

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Reparar valores anómalos</div>
          <div class="setting-desc">Si tras importar ves trades con porcentajes desorbitados (ej. -500% por trade), este botón divide los <code>pnl_pct</code> &gt; 50 entre el capital para recuperar el % real. Útil tras corregir el bug de columnas LIQUIDEZ/NASDAQ.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn" id="repairBtn">Reparar</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar trades por estrategia</div>
          <div class="setting-desc">Elimina solo los trades de una estrategia concreta. Útil para reimportar tras corregir el bug.</div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;justify-content:flex-end;">
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
        Para usarla en otro dispositivo: exporta el JSON desde aquí, ábrelo en el otro
        navegador y reimpórtalo desde la sección Importar.
      </p>
    </div>
  `;

  container.querySelector('#capitalInput').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) state.setCapital(v);
  });
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

  container.querySelector('#repairBtn').addEventListener('click', () => {
    const candidates = state.trades.filter(t => Math.abs(t.pnl_pct || 0) > 50).length;
    if (!candidates) {
      openModal({
        title: 'Reparar valores anómalos',
        body: 'No hay trades con <code>pnl_pct</code> > 50%. Tus datos parecen correctos.',
        actions: [{ label: 'Cerrar', onClick: close => close() }],
      });
      return;
    }
    openModal({
      title: 'Reparar valores anómalos',
      body: `Se encontraron <strong>${candidates} trades</strong> con valores fuera de rango (probablemente € en vez de %).
             Se dividirán entre el capital actual (<strong>${capital.toLocaleString('es-ES')} €</strong>) para recuperar el % real.
             <br><br>Recomendado solo si acabas de actualizar la app y los datos quedaron mal importados. ¿Continuar?`,
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: 'Reparar ahora', variant: 'primary', onClick: close => {
          const fixed = state.repairAnomalousPct();
          close();
          openModal({
            title: 'Reparados',
            body: `<strong>${fixed} trades</strong> corregidos. Revisa el dashboard.`,
            actions: [{ label: 'Ir al dashboard', variant: 'primary', onClick: c => { c(); router.go('#/dashboard'); } }],
          });
        } },
      ],
    });
  });

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
