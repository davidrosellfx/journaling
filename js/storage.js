const KEYS = {
  trades: 'tradinverso_trades',
  theme: 'tradinverso_theme',
  capital: 'tradinverso_capital',
  url: 'tradinverso_apps_script_url',
  version: 'tradinverso_schema_version',
};

const SCHEMA_VERSION = 1;

export const storage = {
  getTrades() {
    try {
      const raw = localStorage.getItem(KEYS.trades);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to read trades from storage', e);
      return [];
    }
  },
  setTrades(trades) {
    localStorage.setItem(KEYS.trades, JSON.stringify(trades));
  },
  getTheme() {
    return localStorage.getItem(KEYS.theme) || 'dark';
  },
  setTheme(t) {
    localStorage.setItem(KEYS.theme, t);
  },
  getCapital() {
    const v = parseFloat(localStorage.getItem(KEYS.capital));
    return isNaN(v) ? 50000 : v;
  },
  setCapital(v) {
    localStorage.setItem(KEYS.capital, String(v));
  },
  getAppsScriptUrl() {
    return localStorage.getItem(KEYS.url) || '';
  },
  setAppsScriptUrl(s) {
    localStorage.setItem(KEYS.url, s || '');
  },
  init() {
    const v = parseInt(localStorage.getItem(KEYS.version), 10);
    if (isNaN(v) || v < SCHEMA_VERSION) {
      localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
    }
  },
  clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  },
  exportJson() {
    return {
      version: SCHEMA_VERSION,
      capital: this.getCapital(),
      trades: this.getTrades(),
      exportedAt: new Date().toISOString(),
    };
  },
};
