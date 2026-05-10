import {
  winrate, pnlPct, currentSlStreak, sortChrono, statsByGroup,
  wrByHour, longVsShort, avgRR, monthlyPnl
} from './calculations.js';
import {
  withSensacion, groupByEmotion, sensacionStats, maxSlStreakBySensacion,
  classify, NEGATIVAS,
} from './sensaciones.js';
import { dayOfWeekIndex } from './date-helpers.js';

const A = (type, icon, title, body) => ({ type, icon, title, body });
const danger  = (icon, title, body) => A('danger', icon, title, body);
const warn    = (icon, title, body) => A('warning', icon, title, body);
const success = (icon, title, body) => A('success', icon, title, body);

export function buildAlerts(trades) {
  const tecAlertas = [];
  const tecInsights = [];
  const emoAlertas = [];
  const emoInsights = [];

  if (!trades.length) return { tecAlertas, tecInsights, emoAlertas, emoInsights };

  const globalWR = winrate(trades);

  // ── TÉCNICO ────────────────────────────────────────────────

  // Pair WR (best/worst)
  const byPair = statsByGroup(trades, t => t.pair).filter(p => p.total >= 5);
  if (byPair.length) {
    const worst = [...byPair].sort((a, b) => a.wr - b.wr)[0];
    if (worst.wr < globalWR - 10) {
      tecAlertas.push(danger('!',
        `${worst.key} — ${worst.wr.toFixed(0)}% WR`,
        `${worst.total} trades. Cae ${(globalWR - worst.wr).toFixed(0)}pp bajo media (${globalWR.toFixed(0)}%). Reducir o eliminar.`));
    }
    const best = [...byPair].sort((a, b) => b.wr - a.wr)[0];
    if (best.wr > globalWR + 5) {
      tecInsights.push(success('✓',
        `${best.key} — ${best.wr.toFixed(0)}% WR`,
        `${best.total} trades, +${(best.wr - globalWR).toFixed(0)}pp sobre media. Concentrar operativa aquí.`));
    }
  }

  // Sobreoperar diario
  const dayCount = {};
  for (const t of trades) dayCount[t.date] = (dayCount[t.date] || 0) + 1;
  const overDays = Object.entries(dayCount).filter(([, n]) => n >= 5);
  if (overDays.length) {
    const worst = overDays.sort((a, b) => b[1] - a[1])[0];
    tecAlertas.push(danger('!',
      `Sobreoperar — ${overDays.length} día${overDays.length > 1 ? 's' : ''} con 5+ trades`,
      `Tu regla: máx 5 trades/día. Peor día: ${worst[0]} con ${worst[1]} trades.`));
  }

  // Sobreoperar por sesión (3+ trades misma estrategia mismo día)
  const dayStratCount = {};
  for (const t of trades) {
    const k = `${t.date}|${t.sheet}`;
    dayStratCount[k] = (dayStratCount[k] || 0) + 1;
  }
  const overSessions = Object.entries(dayStratCount).filter(([, n]) => n >= 3);
  if (overSessions.length) {
    tecAlertas.push(warn('⏳',
      `Sobreoperar por sesión — ${overSessions.length} sesión${overSessions.length > 1 ? 'es' : ''}`,
      `Días con 3+ trades en la misma estrategia. Recomendado: máx 2/sesión.`));
  }

  // Días ganadores vs perdedores
  const dayPnl = {};
  for (const t of trades) {
    if (t.result !== 'BE') dayPnl[t.date] = (dayPnl[t.date] || 0) + (t.pnl_pct || 0);
  }
  const dayVals = Object.values(dayPnl);
  if (dayVals.length) {
    const win = dayVals.filter(p => p > 0).length;
    const loss = dayVals.filter(p => p < 0).length;
    const be = dayVals.filter(p => p === 0).length;
    const total = dayVals.length;
    const dayWR = win / total * 100;
    const ratio = loss > 0 ? (win / loss).toFixed(2) : '∞';
    const type = dayWR >= 60 ? 'success' : dayWR >= 50 ? 'warning' : 'danger';
    const item = A(type, type === 'success' ? '✓' : '⏳',
      `Días ganadores vs perdedores — ${dayWR.toFixed(0)}%`,
      `${win} positivos · ${loss} negativos · ${be} neutros · Ratio ${ratio}:1`);
    if (type === 'success') tecInsights.push(item); else tecAlertas.push(item);
  }

  // Semana en rojo: 3+ días operativos consecutivos con PnL < 0
  const dayKeys = Object.keys(dayPnl).sort();
  let consec = 0, maxConsec = 0;
  for (const k of dayKeys) {
    if (dayPnl[k] < 0) { consec++; if (consec > maxConsec) maxConsec = consec; }
    else consec = 0;
  }
  if (maxConsec >= 3) {
    tecAlertas.push(danger('🛑',
      `Semana en rojo — ${maxConsec} días seguidos negativos`,
      `Considera Protocolo Reseteo: parar 24h, revisar journaling, validar plan.`));
  }

  // Racha SL activa
  const slStreak = currentSlStreak(trades);
  if (slStreak >= 5) {
    tecAlertas.push(danger('🛑',
      `Racha activa de ${slStreak} SL — Protocolo Reseteo`,
      `Para 24h obligatorio, revisar journaling, validar plan antes de volver.`));
  } else if (slStreak >= 3) {
    tecAlertas.push(danger('!',
      `Racha activa de ${slStreak} SL consecutivos`,
      `Revisa el contexto de mercado antes de operar el siguiente.`));
  } else if (slStreak === 2) {
    tecAlertas.push(warn('⏳',
      `2 SL consecutivos — precaución`,
      `Un SL más activaría la alerta de racha. Evalúa bien el siguiente setup.`));
  } else if (slStreak === 0) {
    const sorted = sortChrono(trades);
    const last5 = sorted.slice(-5);
    const recentTP = last5.filter(t => t.result === 'TP').length;
    tecInsights.push(success('✓',
      `Sin racha de SL activa`,
      `Últimos 5 trades: ${recentTP} TP.`));
  }

  // Racha SL por estrategia
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const st = trades.filter(t => t.sheet === sheet);
    const cur = currentSlStreak(st);
    if (cur >= 5) {
      tecAlertas.push(danger('🛑',
        `${sheet}: ${cur} SL consecutivos — Protocolo Reseteo`,
        `Pausa esta estrategia 24h, revisa setups recientes.`));
    } else if (cur >= 3) {
      tecAlertas.push(danger('!',
        `${sheet}: ${cur} SL consecutivos`,
        `Considera pausar esta estrategia hasta entender la causa.`));
    }
  }

  // Mejor/peor franja horaria
  const hours = wrByHour(trades).filter(h => h.n >= 3);
  if (hours.length) {
    const worst = [...hours].sort((a, b) => a.wr - b.wr)[0];
    if (worst.wr < globalWR - 8) {
      tecAlertas.push(warn('⏳',
        `${worst.label} — franja peligrosa (${worst.wr.toFixed(0)}% WR)`,
        `${worst.n} trades. Considerar reducir operativa en esta franja.`));
    }
    const best = [...hours].sort((a, b) => b.wr - a.wr)[0];
    if (best.wr > globalWR + 8) {
      tecInsights.push(success('✓',
        `${best.label} — mejor franja (${best.wr.toFixed(0)}% WR)`,
        `${best.n} trades. Concentrar operativa aquí.`));
    }
  }

  // Londres (08-12) vs Nueva York (14-18)
  const london = trades.filter(t => t.open_hour != null && t.open_hour >= 8 && t.open_hour < 12);
  const ny = trades.filter(t => t.open_hour != null && t.open_hour >= 14 && t.open_hour < 18);
  if (london.length >= 5 && ny.length >= 5) {
    const lwr = winrate(london), nwr = winrate(ny);
    if (Math.abs(lwr - nwr) >= 10) {
      const dom = lwr > nwr ? 'Londres' : 'Nueva York';
      const domWR = Math.max(lwr, nwr);
      const weakWR = Math.min(lwr, nwr);
      tecInsights.push(success('✓',
        `${dom} dominante — ${domWR.toFixed(0)}% vs ${weakWR.toFixed(0)}%`,
        `Diferencia ${(domWR - weakWR).toFixed(0)}pp. Priorizar sesión ${dom}.`));
    }
  }

  // RR medio real vs 2.0
  const tradesWithRR = trades.filter(t => t.rr != null && t.rr > 0);
  if (tradesWithRR.length >= 10) {
    const rr = avgRR(tradesWithRR);
    if (rr < 2.0) {
      tecAlertas.push(warn('⏳',
        `RR medio ${rr.toFixed(2)} bajo objetivo 1:2`,
        `${tradesWithRR.length} trades con RR. Trabajar parciales y trailing.`));
    } else {
      tecInsights.push(success('✓',
        `RR medio ${rr.toFixed(2)} cumple objetivo 1:2`,
        `${tradesWithRR.length} trades con RR registrado.`));
    }
  }

  // Tendencia 4 últimas semanas vs histórico
  const sorted = sortChrono(trades);
  if (sorted.length >= 30) {
    const last4w = sorted.filter(t => {
      const d = new Date(t.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 28);
      return d >= cutoff;
    });
    if (last4w.length >= 5) {
      const recentWR = winrate(last4w);
      const diff = recentWR - globalWR;
      if (Math.abs(diff) >= 8) {
        const item = diff > 0
          ? success('✓', `Tendencia 4 semanas — mejorando (+${diff.toFixed(0)}pp)`, `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico.`)
          : warn('⏳', `Tendencia 4 semanas — bajando (${diff.toFixed(0)}pp)`, `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico.`);
        if (diff > 0) tecInsights.push(item); else tecAlertas.push(item);
      }
    }
  }

  // Cobertura emocional
  const withSens = withSensacion(trades);
  const coverage = trades.length > 0 ? (withSens.length / trades.length * 100) : 0;
  if (coverage < 60) {
    tecAlertas.push(warn('⏳',
      `Cobertura emocional baja — ${coverage.toFixed(0)}%`,
      `Solo ${withSens.length}/${trades.length} trades con sensación. Sin esto el diagnóstico emocional pierde valor.`));
  }

  // ── EMOCIONAL ──────────────────────────────────────────────

  if (withSens.length < 3) {
    emoAlertas.push(warn('⏳',
      `Pocos datos emocionales — ${withSens.length} trades`,
      `Registra al menos 3 trades con sensación para diagnóstico emocional.`));
    return { tecAlertas, tecInsights, emoAlertas, emoInsights };
  }

  const sensWR = winrate(withSens);
  const sensStats = sensacionStats(withSens);

  // Mejor / peor sensación global (min 3 trades)
  const valid = [...sensStats].filter(([, d]) => d.total >= 3);
  if (valid.length) {
    const best = [...valid].sort((a, b) => b[1].wr - a[1].wr)[0];
    if (best[1].wr > sensWR + 5) {
      emoInsights.push(success('✓',
        `Mejor sensación: "${best[0]}" — ${best[1].wr.toFixed(0)}% WR (${best[1].total} trades)`,
        `+${(best[1].wr - sensWR).toFixed(0)}pp sobre tu media (${sensWR.toFixed(0)}%). Opera más cuando estés así.`));
    }
    if (valid.length > 1) {
      const worst = [...valid].sort((a, b) => a[1].wr - b[1].wr)[0];
      if (worst[1].wr < sensWR - 5) {
        const t = NEGATIVAS.includes(worst[0]) ? 'danger' : 'warning';
        const item = A(t, '!',
          `Peor sensación: "${worst[0]}" — ${worst[1].wr.toFixed(0)}% WR (${worst[1].total} trades)`,
          `Cae ${(sensWR - worst[1].wr).toFixed(0)}pp bajo tu media. Considera no operar en este estado.`);
        emoAlertas.push(item);
      }
    }
  }

  // Positivos vs negativos
  const { positivas, negativas } = groupByEmotion(withSens);
  if (positivas.length >= 3 && negativas.length >= 3) {
    const pwr = winrate(positivas), nwr = winrate(negativas);
    const diff = pwr - nwr;
    const item = diff > 0
      ? success('✓',
        `Estados positivos ${pwr.toFixed(0)}% WR vs negativos ${nwr.toFixed(0)}% WR`,
        `Ganas ${diff.toFixed(0)}pp operando desde estado positivo. ${positivas.length} positivos vs ${negativas.length} negativos.`)
      : warn('⏳',
        `Negativos (${nwr.toFixed(0)}%) igualan o superan positivos (${pwr.toFixed(0)}%)`,
        `Revisa si estás sobre-filtrando o si el problema técnico no es emocional.`);
    if (diff > 0) emoInsights.push(item); else emoAlertas.push(item);
  }

  // "Dudoso-Inseguro" propio
  const dudoso = sensStats.get('Dudoso - Inseguro');
  if (dudoso && dudoso.total >= 3 && dudoso.wr < sensWR - 5) {
    emoAlertas.push(warn('⏳',
      `"Dudoso - Inseguro" — ${dudoso.wr.toFixed(0)}% WR (${dudoso.total} trades)`,
      `Si hay duda no se opera. Cae ${(sensWR - dudoso.wr).toFixed(0)}pp bajo tu media.`));
  }

  // Por estrategia: mejor / peor (umbral ≥8pp)
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const st = withSens.filter(t => t.sheet === sheet);
    if (st.length < 3) continue;
    const stWR = winrate(st);
    const stStats = sensacionStats(st);
    const stValid = [...stStats].filter(([, d]) => d.total >= 3);
    if (!stValid.length) continue;
    const best = [...stValid].sort((a, b) => b[1].wr - a[1].wr)[0];
    if (best[1].wr > stWR + 8) {
      emoInsights.push(success('✓',
        `${sheet} — mejor sensación "${best[0]}" (${best[1].wr.toFixed(0)}% WR)`,
        `+${(best[1].wr - stWR).toFixed(0)}pp sobre media de ${sheet} con ${best[1].total} trades.`));
    }
    if (stValid.length > 1) {
      const worst = [...stValid].sort((a, b) => a[1].wr - b[1].wr)[0];
      if (worst[1].wr < stWR - 8) {
        const t = NEGATIVAS.includes(worst[0]) ? 'danger' : 'warning';
        emoAlertas.push(A(t, '!',
          `${sheet} — peor sensación "${worst[0]}" (${worst[1].wr.toFixed(0)}% WR)`,
          `Cae ${(stWR - worst[1].wr).toFixed(0)}pp bajo media de ${sheet} con ${worst[1].total} trades.`));
      }
    }
  }

  // Racha SL por sensación negativa (≥3)
  const slStreaks = maxSlStreakBySensacion(withSens);
  for (const [s, n] of slStreaks) {
    if (n >= 3 && NEGATIVAS.includes(s)) {
      emoAlertas.push(danger('!',
        `Racha de ${n} SL seguidos con "${s}"`,
        `Tu peor racha de pérdidas consecutivas con esta sensación. Señal clara.`));
    }
  }

  return { tecAlertas, tecInsights, emoAlertas, emoInsights };
}
