import { storage } from './storage.js';
import { uuid } from './utils/uuid.js';
import { parseTime, durationMinutes } from './utils/date-helpers.js';
import { SHEET_CONVERSION_FACTOR } from './utils/constants.js';

const SENS_VALID = new Set([
  'Seguro - Confiado',
  'Convencido - Calma',
  'Dudoso - Inseguro',
  'Fomo - Acelerado',
  'Venganza - Rabia',
  'Miedo - Parálisis',
]);

function deriveResult(pnl_pct) {
  if (pnl_pct == null || isNaN(pnl_pct)) return 'BE';
  if (pnl_pct > 0.2) return 'TP';
  if (pnl_pct < -0.2) return 'SL';
  return 'BE';
}

function sanitizeTrade(t) {
  if (!t) return null;
  const pnl_pct = typeof t.pnl_pct === 'number' ? t.pnl_pct : (parseFloat(t.pnl_pct) || 0);
  const open_str = t.open_str || '';
  const close_str = t.close_str || '';
  return {
    id: t.id || uuid(),
    sheet: t.sheet,
    date: t.date,
    result: t.result || deriveResult(pnl_pct),
    pnl_pct,
    open_hour: t.open_hour != null ? t.open_hour : parseTime(open_str),
    open_str,
    close_str,
    dur: t.dur != null ? t.dur : durationMinutes(open_str, close_str),
    setup: t.setup || '',
    pair: t.pair || '',
    zone: t.zone || '',
    entry: t.entry || '',
    rr: t.rr != null ? t.rr : null,
    pips: t.pips != null ? t.pips : null,
    sensacion: SENS_VALID.has(t.sensacion) ? t.sensacion : '',
    url1: t.url1 || '',
    url2: t.url2 || '',
    reflexion: t.reflexion || '',
    createdAt: t.createdAt || Date.now(),
  };
}

const listeners = new Set();

export const state = {
  trades: [],
  load() {
    this.trades = storage.getTrades().map(sanitizeTrade).filter(Boolean);
  },
  save() {
    storage.setTrades(this.trades);
    this.emit();
  },
  add(trade) {
    const t = sanitizeTrade(trade);
    if (!t) return null;
    this.trades.push(t);
    this.save();
    return t;
  },
  addMany(trades) {
    let added = 0, dup = 0;
    const existing = new Set(this.trades.map(dedupKey));
    for (const t of trades) {
      const sanitized = sanitizeTrade(t);
      if (!sanitized || !sanitized.date || !sanitized.sheet) continue;
      const k = dedupKey(sanitized);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k);
      this.trades.push(sanitized);
      added++;
    }
    if (added) this.save(); else this.emit();
    return { added, dup };
  },
  remove(id) {
    this.trades = this.trades.filter(t => t.id !== id);
    this.save();
  },
  update(id, patch) {
    const i = this.trades.findIndex(t => t.id === id);
    if (i < 0) return null;
    this.trades[i] = sanitizeTrade({ ...this.trades[i], ...patch });
    this.save();
    return this.trades[i];
  },
  replaceAll(trades) {
    this.trades = trades.map(sanitizeTrade).filter(Boolean);
    this.save();
  },
  removeBySheet(sheet) {
    const before = this.trades.length;
    this.trades = this.trades.filter(t => t.sheet !== sheet);
    const removed = before - this.trades.length;
    this.save();
    return removed;
  },
  // Repair trades where pnl_pct is suspect.
  // Case A — paste-from-Excel column bug: pnl_pct stored as € amount (|pct| > 50).
  //   Fix: divide by SHEET_CONVERSION_FACTOR/100 = 500.
  // Case B — apps-script imported with wrong capital: pnl_pct stored at scale of
  //   (€/oldCapital × 100). Real % = stored × oldCapital / SHEET_CONVERSION_FACTOR.
  //   Caller passes oldCapital; only trades with affected sheets are touched.
  repairAnomalousPct({ oldCapital = null, sheets = null } = {}) {
    let fixed = 0;
    for (const t of this.trades) {
      if (sheets && !sheets.includes(t.sheet)) continue;
      const pct = t.pnl_pct || 0;
      let corrected = null;
      if (Math.abs(pct) > 50) {
        // Case A
        corrected = (pct / SHEET_CONVERSION_FACTOR) * 100;
      } else if (oldCapital && oldCapital > 0 && oldCapital !== SHEET_CONVERSION_FACTOR) {
        // Case B — only when user explicitly provided the old capital
        corrected = pct * (oldCapital / SHEET_CONVERSION_FACTOR);
      }
      if (corrected != null) {
        t.pnl_pct = +corrected.toFixed(4);
        t.result = t.pnl_pct > 0.2 ? 'TP' : t.pnl_pct < -0.2 ? 'SL' : 'BE';
        fixed++;
      }
    }
    if (fixed) this.save();
    return fixed;
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
};

function dedupKey(t) {
  return `${t.sheet}|${t.date}|${t.open_str || ''}|${t.pair || ''}|${t.setup || ''}`;
}
