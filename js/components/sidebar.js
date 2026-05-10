import { theme } from '../theme.js';
import { router } from '../router.js';
import { state } from '../state.js';

const NAV = [
  { section: 'Operativa' },
  { path: '#/dashboard',  label: 'Dashboard',   icon: '📊', class: '' },
  { path: '#/nuevo',      label: 'Nuevo trade', icon: '✏️', class: '' },
  { path: '#/calendario', label: 'Calendario',  icon: '📅', class: '' },

  { section: 'Estrategias' },
  { path: '#/zonas',    label: 'Zonas',    icon: '🎯', class: 'zonas',    sheet: 'ZONAS' },
  { path: '#/liquidez', label: 'Liquidez', icon: '💧', class: 'liquidez', sheet: 'LIQUIDEZ' },
  { path: '#/nasdaq',   label: 'Nasdaq',   icon: '🚀', class: 'nasdaq',   sheet: 'NASDAQ' },

  { section: 'Análisis' },
  { path: '#/diagnostico', label: 'Diagnóstico', icon: '🩺', class: '' },

  { section: 'Datos' },
  { path: '#/importar', label: 'Importar', icon: '📥', class: '' },
  { path: '#/ajustes',  label: 'Ajustes',  icon: '⚙️', class: '' },
];

export function renderSidebar(container) {
  if (!container) return;
  const current = router.current();
  const counts = countsBySheet();

  container.innerHTML = `
    <a href="#/dashboard" class="brand">
      <div class="brand-logo">T</div>
      <div class="brand-text">
        <span class="brand-line1">Journaling</span>
        <span class="brand-line2">Tradinver<span>so</span></span>
      </div>
    </a>
    <nav class="nav">
      ${NAV.map(item => {
        if (item.section) return `<div class="nav-section">${item.section}</div>`;
        const active = item.path === current ? 'active' : '';
        const meta = item.sheet ? `<span class="nav-meta">${counts[item.sheet] || 0}</span>` : '';
        return `
          <a href="${item.path}" class="nav-item ${item.class} ${active}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
            ${meta}
          </a>`;
      }).join('')}
    </nav>
    <button class="theme-toggle" id="themeToggle" title="Cambiar tema">
      <span class="theme-toggle-icon">${theme.current() === 'dark' ? '🌙' : '☀️'}</span>
      <span>${theme.current() === 'dark' ? 'Modo oscuro' : 'Modo claro'}</span>
      <span style="opacity:.5;">↔</span>
    </button>
  `;
  container.querySelector('#themeToggle').addEventListener('click', () => {
    theme.toggle();
    renderSidebar(container);
  });
}

function countsBySheet() {
  const c = { ZONAS: 0, LIQUIDEZ: 0, NASDAQ: 0 };
  for (const t of state.trades) if (c[t.sheet] != null) c[t.sheet]++;
  return c;
}
