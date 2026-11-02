'use strict';
// Núcleo de cálculos del monitor de blockchain BTC. Lógica pura: sin red, sin disco, sin interfaz.

const EPOCH = 2016;          // bloques por período de dificultad
const HALVING = 210000;      // bloques por era
const TARGET = 600;          // segundos objetivo por bloque
const MAX_UP = 300;          // tope de subida por ajuste (%) -> a verificar contra la regla de 4x
const MAX_DOWN = -75;        // tope de bajada por ajuste (%)

// ---------- Períodos de dificultad ----------

function epochStart(height) { return Math.floor(height / EPOCH) * EPOCH; }
function epochIndex(height) { return Math.floor(height / EPOCH); }

// Avance del período actual. Con tip 973456 -> 1744 de 2016, faltan 272.
function epochProgress(tipHeight) {
  const start = epochStart(tipHeight);
  const next = start + EPOCH;
  const into = tipHeight - start;
  return {
    index: epochIndex(tipHeight),
    startHeight: start,
    nextRetargetHeight: next,
    blocksInto: into,
    blocksRemaining: next - tipHeight,
    percent: (into / EPOCH) * 100,
  };
}

// Promedio de segundos por bloque entre dos bloques (por sus marcas de tiempo).
function averageBetween(a, b) {
  const blocks = b.height - a.height;
  if (!(blocks > 0)) return null;
  const seconds = b.timestamp - a.timestamp;
  if (!(seconds > 0)) return null;
  return { blocks, seconds, avgSeconds: seconds / blocks };
}

// Cambio estimado del próximo ajuste: (600 / promedio - 1) * 100, con los topes del protocolo.
function estimateChange(avgSeconds) {
  if (!(avgSeconds > 0)) return null;
  const raw = (TARGET / avgSeconds - 1) * 100;
  return Math.min(MAX_UP, Math.max(MAX_DOWN, raw));
}

// Estado del período en curso a partir de: altura actual, bloque de inicio y bloque actual (con hora).
function currentEpoch(tip, startBlock) {
  const p = epochProgress(tip.height);
  const out = Object.assign({}, p, { avgSeconds: null, estimatedChange: null, etaMs: null, etaTargetMs: null });
  if (p.blocksInto > 0 && startBlock && startBlock.height === p.startHeight) {
    const avg = averageBetween(startBlock, { height: tip.height, timestamp: tip.timestamp });
    if (avg) {
      out.avgSeconds = avg.avgSeconds;
      out.estimatedChange = estimateChange(avg.avgSeconds);
      // Fecha estimada si el ritmo sigue igual al promedio del período.
      out.etaMs = (tip.timestamp + p.blocksRemaining * avg.avgSeconds) * 1000;
    }
  }
  // Fecha estimada si cada bloque tardara exactamente 600 s.
  out.etaTargetMs = (tip.timestamp + p.blocksRemaining * TARGET) * 1000;
  return out;
}

// Tabla histórica. entries = [{height, timestamp, difficulty}] de cada bloque de ajuste.
// Cada fila cubre desde un ajuste hasta el siguiente (2016 bloques). Devuelve del más nuevo al más viejo.
function epochTable(entries, liveEpoch) {
  const e = entries.slice().sort((x, y) => x.height - y.height);
  const rows = [];
  for (let i = 0; i < e.length; i++) {
    const cur = e[i];
    const prev = i > 0 ? e[i - 1] : null;
    const next = i + 1 < e.length ? e[i + 1] : null;
    const row = {
      startHeight: cur.height,
      endHeight: cur.height + EPOCH,
      startTimestamp: cur.timestamp,
      difficulty: cur.difficulty,
      changeFromPrev: prev && prev.difficulty > 0 ? (cur.difficulty / prev.difficulty - 1) * 100 : null,
      avgSeconds: null,
      inProgress: false,
    };
    if (next && next.height === cur.height + EPOCH) {
      const avg = averageBetween(cur, next);
      row.avgSeconds = avg ? avg.avgSeconds : null;
    } else if (liveEpoch && liveEpoch.startHeight === cur.height) {
      row.inProgress = true;
      row.avgSeconds = liveEpoch.avgSeconds;
    }
    rows.push(row);
  }
  return rows.reverse();
}

// ---------- Eras (halvings) ----------

function eraIndex(height) { return Math.floor(height / HALVING); }
function subsidyBtc(era) { return era >= 64 ? 0 : 50 / Math.pow(2, era); }

// marks = { "0": ts, "210000": ts, ... } marcas de tiempo de los bloques 0, 210000, 420000...
// tip = {height, timestamp}. Devuelve una fila por era (la actual, con avance).
function eraTable(marks, tip) {
  const rows = [];
  const lastEra = eraIndex(tip.height);
  for (let era = 0; era <= lastEra; era++) {
    const startH = era * HALVING;
    const endH = startH + HALVING;
    const startTs = marks[String(startH)];
    const row = {
      era, startHeight: startH, endHeight: endH, subsidy: subsidyBtc(era),
      startTimestamp: startTs == null ? null : startTs,
      avgSeconds: null, blocks: null, inProgress: era === lastEra,
    };
    let endBlock = null;
    if (era < lastEra) {
      const endTs = marks[String(endH)];
      if (endTs != null) endBlock = { height: endH, timestamp: endTs };
    } else {
      endBlock = { height: tip.height, timestamp: tip.timestamp };
    }
    if (startTs != null && endBlock) {
      const avg = averageBetween({ height: startH, timestamp: startTs }, endBlock);
      if (avg) { row.avgSeconds = avg.avgSeconds; row.blocks = avg.blocks; }
    }
    rows.push(row);
  }
  return rows.reverse();
}

// Próximo halving: bloques que faltan y fecha estimada (con 600 s por bloque o con el promedio de la era).
function nextHalving(tip, eraAvgSeconds) {
  const era = eraIndex(tip.height);
  const nextH = (era + 1) * HALVING;
  const remaining = nextH - tip.height;
  const at = (s) => (tip.timestamp + remaining * s) * 1000;
  return {
    height: nextH, blocksRemaining: remaining, newSubsidy: subsidyBtc(era + 1),
    eraStart: era * HALVING, blocksInto: tip.height - era * HALVING,
    percent: ((tip.height - era * HALVING) / HALVING) * 100,
    etaTargetMs: at(TARGET),
    etaMs: eraAvgSeconds > 0 ? at(eraAvgSeconds) : null,
  };
}

// Alturas cuyas marcas de tiempo hacen falta para la tabla de eras.
function halvingHeightsNeeded(tipHeight) {
  const out = [];
  for (let e = 0; e <= eraIndex(tipHeight); e++) out.push(e * HALVING);
  return out;
}

// ---------- Rango de fechas ----------

// a y b: bloques {height, timestamp}. Devuelve promedio y advertencias.
function rangeAverage(a, b) {
  if (b.height < a.height) { const t = a; a = b; b = t; }
  const avg = averageBetween(a, b);
  if (!avg) return null;
  return {
    fromBlock: a, toBlock: b, blocks: avg.blocks, seconds: avg.seconds,
    avgSeconds: avg.avgSeconds,
    vsTargetPercent: (avg.avgSeconds / TARGET - 1) * 100,
    shortRange: avg.blocks < 50,
  };
}

// ---------- Texto ----------

function formatDuration(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '—';
  let s = Math.round(Math.abs(totalSeconds));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return d + ' d ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  if (m > 0) return m + ' min ' + s + ' s';
  return s + ' s';
}

// Días, horas, minutos y segundos completos: "1458 d 7 h 12 min 5 s".
function formatDHMS(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '—';
  let s = Math.round(Math.abs(totalSeconds));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return d + ' d ' + h + ' h ' + m + ' min ' + s + ' s';
}

// Variación porcentual entre dos precios (null si falta alguno).
function priceChangePercent(a, b) {
  return a > 0 && b > 0 ? (b / a - 1) * 100 : null;
}

function formatBlockTime(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return Math.round(sec) + ' s (' + m + ' min ' + (s < 10 ? '0' : '') + s + ' s)';
}


// ---------- Informe de una era (para el panel de detalle) ----------

const YEAR_S = 31557600; // año juliano

// eraRow: fila de eraTable. epochs: salida de epochTable (más nuevo primero).
// Los períodos de dificultad se asignan a la era donde EMPIEZAN (los bordes no coinciden exactamente).
function eraReport(eraRow, epochs) {
  const inEra = epochs
    .filter((e) => e.startHeight >= eraRow.startHeight && e.startHeight < eraRow.endHeight)
    .sort((a, b) => a.startHeight - b.startHeight);
  const withAvg = inEra.filter((e) => e.avgSeconds != null);
  const done = withAvg.filter((e) => !e.inProgress);
  const pool = done.length ? done : withAvg;
  let fastest = null, slowest = null;
  for (const e of pool) {
    if (!fastest || e.avgSeconds < fastest.avgSeconds) fastest = e;
    if (!slowest || e.avgSeconds > slowest.avgSeconds) slowest = e;
  }
  const withDiff = inEra.filter((e) => e.difficulty > 0);
  const d0 = withDiff.length ? withDiff[0].difficulty : null;
  const d1 = withDiff.length ? withDiff[withDiff.length - 1].difficulty : null;
  const duration = eraRow.avgSeconds != null && eraRow.blocks != null ? eraRow.avgSeconds * eraRow.blocks : null;
  const expected = eraRow.blocks != null ? eraRow.blocks * TARGET : null;
  return {
    era: eraRow.era, startHeight: eraRow.startHeight, endHeight: eraRow.endHeight, subsidy: eraRow.subsidy,
    inProgress: eraRow.inProgress, startTimestamp: eraRow.startTimestamp,
    endTimestamp: !eraRow.inProgress && duration != null && eraRow.startTimestamp != null ? eraRow.startTimestamp + duration : null,
    blocks: eraRow.blocks, avgSeconds: eraRow.avgSeconds,
    deviationPercent: eraRow.avgSeconds != null ? (eraRow.avgSeconds / TARGET - 1) * 100 : null,
    durationSeconds: duration, expectedSeconds: expected,
    durationYears: duration != null ? duration / YEAR_S : null,
    expectedYears: expected != null ? expected / YEAR_S : null,
    percentDone: eraRow.blocks != null ? (eraRow.blocks / HALVING) * 100 : null,
    periods: inEra.length,
    fastest: fastest ? { startHeight: fastest.startHeight, avgSeconds: fastest.avgSeconds } : null,
    slowest: slowest ? { startHeight: slowest.startHeight, avgSeconds: slowest.avgSeconds } : null,
    difficultyStart: d0, difficultyEnd: d1,
    growthFactor: d0 && d1 ? d1 / d0 : null,
    speedSeries: withAvg.map((e) => ({ x: e.startTimestamp, y: e.avgSeconds, startHeight: e.startHeight, inProgress: e.inProgress })),
    changeSeries: inEra.filter((e) => e.changeFromPrev != null).map((e) => ({ x: e.startTimestamp, y: e.changeFromPrev, startHeight: e.startHeight })),
    difficultySeries: withDiff.map((e) => ({ x: e.startTimestamp, y: e.difficulty, startHeight: e.startHeight })),
  };
}

// ---------- Evolución dentro de un rango ----------

// samples: bloques {height, timestamp} ordenados por tiempo (extremos incluidos).
// Devuelve un tramo por cada par consecutivo válido (altura y hora crecientes).
function segmentsFromSamples(samples) {
  const segs = [];
  let prev = null;
  for (const s of samples) {
    if (!prev) { prev = s; continue; }
    if (s.height > prev.height && s.timestamp > prev.timestamp) {
      segs.push({
        fromHeight: prev.height, toHeight: s.height, fromTs: prev.timestamp, toTs: s.timestamp,
        midTs: (prev.timestamp + s.timestamp) / 2,
        blocks: s.height - prev.height,
        avgSeconds: (s.timestamp - prev.timestamp) / (s.height - prev.height),
      });
      prev = s;
    }
  }
  return segs;
}

function segmentStats(segs) {
  if (!segs || segs.length < 2) return null;
  let min = segs[0], max = segs[0];
  for (const g of segs) { if (g.avgSeconds < min.avgSeconds) min = g; if (g.avgSeconds > max.avgSeconds) max = g; }
  return { min, max };
}

// ---------- Dificultad: qué significa ----------

// La dificultad no tiene unidad: es relativa al bloque génesis (dificultad 1).
// Hashes esperados por bloque = dificultad x 2^32. Hashrate implícito = eso / 600 s (estimación).
function difficultyInfo(difficulty) {
  if (!(difficulty > 0)) return null;
  const hashes = difficulty * 4294967296;
  return { hashesPerBlock: hashes, impliedHashrate: hashes / TARGET };
}

const chainApi = {
  EPOCH, HALVING, TARGET,
  epochStart, epochIndex, epochProgress, averageBetween, estimateChange, currentEpoch, epochTable,
  eraIndex, subsidyBtc, eraTable, nextHalving, halvingHeightsNeeded, rangeAverage,
  formatDuration, formatBlockTime, formatDHMS, priceChangePercent,
  eraReport, segmentsFromSamples, segmentStats, difficultyInfo,
};

// Funciona en Node (pruebas, ventana) y también como script de la interfaz (window.BtcChain).
if (typeof module !== 'undefined' && module.exports) module.exports = chainApi;
else if (typeof window !== 'undefined') window.BtcChain = chainApi;
