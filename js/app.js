import { storage } from './storage.js';
import { state } from './state.js';
import { theme } from './theme.js';
import { router } from './router.js';
import { renderSidebar } from './components/sidebar.js';

import { dashboardView } from './views/dashboard.js';
import { newTradeView } from './views/new-trade.js';
import { strategyView } from './views/strategy.js';
import { calendarView } from './views/calendar.js';
import { diagnosticView } from './views/diagnostic.js';
import { importView } from './views/import-table.js';
import { settingsView } from './views/settings.js';

storage.init();
state.load();
theme.init();

const view = document.getElementById('view');

router
  .add('#/dashboard', (_, c) => dashboardView(c))
  .add('#/nuevo', (_, c) => newTradeView(c))
  .add('#/zonas', (_, c) => strategyView(c, 'ZONAS'))
  .add('#/liquidez', (_, c) => strategyView(c, 'LIQUIDEZ'))
  .add('#/nasdaq', (_, c) => strategyView(c, 'NASDAQ'))
  .add('#/calendario', (_, c) => calendarView(c))
  .add('#/diagnostico', (_, c) => diagnosticView(c))
  .add('#/importar', (_, c) => importView(c))
  .add('#/ajustes', (_, c) => settingsView(c));

renderSidebar(document.getElementById('sidebar'));
router.onChange(() => renderSidebar(document.getElementById('sidebar')));
router.start(view);
