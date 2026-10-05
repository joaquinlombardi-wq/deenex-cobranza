// Fuentes públicas de dólar MEP e IPC. ArgentinaDatos publica el historial completo; DolarApi
// (del mismo autor) da la cotización del momento. El IPC de ArgentinaDatos sale de INDEC.

export const FUENTES = {
  mepHistorico: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa',
  mepHoy: 'https://dolarapi.com/v1/dolares/bolsa',
  ipc: 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion',
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// [{ casa: 'bolsa', compra, venta, fecha: 'AAAA-MM-DD' }] -> { 'AAAA-MM-DD': venta }
export function leerMepHistorico(json) {
  if (!Array.isArray(json)) throw new Error('El historial de MEP no vino como lista.');
  const valores = {};
  for (const fila of json) {
    if (FECHA.test(fila?.fecha) && positivo(fila?.venta)) valores[fila.fecha] = fila.venta;
  }
  if (!Object.keys(valores).length) throw new Error('El historial de MEP vino vacío.');
  return valores;
}

// Fecha calendario en Argentina (UTC-3, sin horario de verano) de un instante ISO.
export function fechaArgentina(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - 3 * 3600000).toISOString().slice(0, 10);
}

// { casa: 'bolsa', compra, venta, fechaActualizacion } -> { fecha, venta }
export function leerMepHoy(json) {
  const fecha = fechaArgentina(json?.fechaActualizacion);
  if (!fecha || !positivo(json?.venta)) throw new Error('La cotización del día vino incompleta.');
  return { fecha, venta: json.venta };
}

// [{ fecha: 'AAAA-MM-DD' (fin de mes), valor: 2.1 }] -> { 'AAAA-MM': 0.021 }
export function leerIpc(json) {
  if (!Array.isArray(json)) throw new Error('La serie de IPC no vino como lista.');
  const valores = {};
  for (const fila of json) {
    if (!FECHA.test(fila?.fecha) || typeof fila?.valor !== 'number' || !Number.isFinite(fila.valor)) continue;
    valores[fila.fecha.slice(0, 7)] = Number((fila.valor / 100).toFixed(6));
  }
  if (!Object.keys(valores).length) throw new Error('La serie de IPC vino vacía.');
  return valores;
}

async function pedirJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res.json();
}

// Trae todo: historial de MEP (con el valor de hoy encima) e IPC mensual.
export async function traerCotizaciones() {
  const [historico, hoy, ipc] = await Promise.all([
    pedirJson(FUENTES.mepHistorico).then(leerMepHistorico),
    pedirJson(FUENTES.mepHoy).then(leerMepHoy).catch(() => null),
    pedirJson(FUENTES.ipc).then(leerIpc),
  ]);
  const mep = { ...historico };
  if (hoy) mep[hoy.fecha] = hoy.venta;
  return { mep, ipc, actualizado: new Date().toISOString() };
}

// Arma los documentos tal como los guarda el sistema: un documento de MEP por año y uno de IPC.
export function documentosCotizaciones({ mep, ipc, actualizado }, desde = '2023-01-01') {
  const porAnio = {};
  for (const [fecha, venta] of Object.entries(mep)) {
    if (fecha < desde) continue;
    const anio = fecha.slice(0, 4);
    (porAnio[anio] ??= {})[fecha] = venta;
  }
  const docs = Object.entries(porAnio).map(([anio, valores]) => ({
    path: `cotizaciones/mep-${anio}`,
    data: { valores, fuente: 'ArgentinaDatos y DolarApi (dólar bolsa, venta)', actualizado },
  }));
  const ipcDesde = Object.fromEntries(Object.entries(ipc).filter(([mes]) => mes >= desde.slice(0, 7)));
  docs.push({ path: 'cotizaciones/ipc', data: { valores: ipcDesde, fuente: 'INDEC vía ArgentinaDatos', actualizado } });
  return docs;
}
