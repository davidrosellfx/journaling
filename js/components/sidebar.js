import { theme } from '../theme.js';
import { router } from '../router.js';

const NAV = [
  { section: 'Operativa' },
  { path: '#/dashboard',   label: 'Dashboard',   class: '' },
  { path: '#/nuevo',       label: 'Nuevo trade', class: '' },
  { path: '#/calendario',  label: 'Calendario',  class: '' },

  { section: 'Estrategias' },
  { path: '#/zonas',    label: 'Zonas',    class: 'zonas' },
  { path: '#/liquidez', label: 'Liquidez', class: 'liquidez' },
  { path: '#/nasdaq',   label: 'Nasdaq',   class: 'nasdaq' },

  { section: 'Análisis' },
  { path: '#/diagnostico', label: 'Diagnóstico', class: '' },

  { section: 'Datos' },
  { path: '#/importar', label: 'Importar',   class: '' },
  { path: '#/ajustes',  label: 'Ajustes',    class: '' },
];

export function renderSidebar(container) {
  if (!container) return;
  const current = router.current();
  container.innerHTML = `
    <a href="#/dashboard" class="brand">
      <div class="brand-logo">T</div>
      <div class="brand-name">Tradinver<span>so</span></div>
    </a>
    <nav class="nav">
      ${NAV.map(item => {
        if (item.section) return `<div class="nav-section">${item.section}</div>`;
        const active = item.path === current ? 'active' : '';
        return `<a href="${item.path}" class="nav-item ${item.class} ${active}"><span class="dot"></span><span>${item.label}</span></a>`;
      }).join('')}
    </nav>
    <button class="theme-toggle" id="themeToggle">
      <span>${theme.current() === 'dark' ? '🌙 Oscuro' : '☀ Claro'}</span>
      <span>${theme.current() === 'dark' ? '→ ☀' : '→ 🌙'}</span>
    </button>
  `;
  container.querySelector('#themeToggle').addEventListener('click', () => {
    theme.toggle();
    renderSidebar(container);
  });
}
