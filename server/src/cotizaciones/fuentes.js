// Fuentes públicas de dólar MEP e IPC.
// - dolarhoy: el MEP venta que usa Joaco para facturar (se lee la página, solo da el valor del momento).
// - INDEC: el IPC mensual oficial (CSV de la serie desde diciembre de 2016).
// - ArgentinaDatos: el historial completo de MEP (dólar bolsa) y de IPC (INDEC, desde 1943).
// - DolarApi: la cotización del momento en JSON (queda para el importador).

export const FUENTES = {
  dolarhoy: 'https://dolarhoy.com/cotizacion-dolar-mep',
  indec: 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv',
  mepHistorico: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa',
  mepHoy: 'https://dolarapi.com/v1/dolares/bolsa',
  ipc: 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion',
};

export const FUENTE_DOLARHOY = 'dolarhoy.com (dólar MEP, venta)';
export const FUENTE_MEP = 'ArgentinaDatos (dólar bolsa, venta)';
export const FUENTE_IPC = 'INDEC vía ArgentinaDatos';
export const FUENTE_IPC_AUTOMATICA = 'INDEC (directo, con el historial de ArgentinaDatos)';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const dos = (n) => String(n).padStart(2, '0');

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

// '$1549.80', '$ 1.549,80', '1549,8' -> 1549.8. Un solo separador con tres cifras detrás es de miles.
export function leerPesos(texto) {
  let t = String(texto ?? '').replace(/[$\s ]/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (coma >= 0 || punto >= 0) {
    const sep = coma >= 0 ? ',' : '.';
    const partes = t.split(sep);
    t = partes.length > 2 || partes.at(-1).length === 3 ? partes.join('') : partes.join('.');
  }
  return Number(t);
}

const ENTIDADES = { amp: '&', nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', quot: '"', lt: '<', gt: '>' };

// El texto visible de una página, en una sola línea.
function textoVisible(html) {
  return String(html ?? '')
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMERO = String.raw`\$?\s*(\d[\d.,]*)`;

// "Actualizado por última vez: 07/10/26 10:44 AM" -> '2026-10-07T10:44'
export function leerHoraDolarhoy(texto) {
  const m = String(texto ?? '').match(/actualizad[oa][^0-9]{0,40}(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (!m) return null;
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  let hora = Number(m[4]);
  const pm = /^p/i.test(m[6] ?? '');
  if (m[6] && pm && hora < 12) hora += 12;
  if (m[6] && !pm && hora === 12) hora = 0;
  if (Number(m[2]) > 12 || Number(m[1]) > 31 || hora > 23) return null;
  return `${anio}-${dos(m[2])}-${dos(m[1])}T${dos(hora)}:${m[5]}`;
}

// La página del dólar MEP de dolarhoy: dos casilleros, "Compra" y "Venta", con su valor, y la hora
// de la última actualización. Toma los primeros de la página, que son los del MEP (más abajo hay
// otros dólares).
// -> { compra, venta, publicado: 'AAAA-MM-DDTHH:MM' | null }
export function leerMepDolarhoy(html) {
  const casillero = (nombre) => {
    // Primero el formato de la página (<div class="topic">Venta</div><div class="value">$1549.80</div>);
    // si cambió, el primer número que aparezca después de la palabra en el texto visible.
    const etiquetas = String(html ?? '').match(new RegExp(String.raw`>\s*${nombre}\s*<\/[^>]+>\s*<[^>]*class="[^"]*value[^"]*"[^>]*>\s*${NUMERO}`, 'i'));
    const texto = etiquetas ? null : textoVisible(html).match(new RegExp(String.raw`\b${nombre}\b\s*:?\s*${NUMERO}`, 'i'));
    return leerPesos((etiquetas ?? texto)?.[1]);
  };
  const venta = casillero('Venta');
  const compra = casillero('Compra');
  if (!positivo(venta)) throw new Error('No encontré el valor de venta en la página de dolarhoy.');
  if (positivo(compra) && compra > venta) throw new Error(`En dolarhoy la compra (${compra}) quedó mayor que la venta (${venta}): parece mal leído.`);
  return { compra: positivo(compra) ? compra : null, venta, publicado: leerHoraDolarhoy(textoVisible(html)) };
}

// Una línea de un CSV con comillas opcionales.
function celdasCsv(linea, sep) {
  const celdas = [];
  let actual = '';
  let comillas = false;
  for (const c of linea) {
    if (c === '"') comillas = !comillas;
    else if (c === sep && !comillas) {
      celdas.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// CSV del INDEC con la serie del IPC por divisiones: una fila por código, período y región, con la
// variación mensual (v_m_IPC). Toma el nivel general nacional.
// -> { 'AAAA-MM': 0.021 }, con la variación redondeada a un decimal, como la publica el INDEC.
export function leerIpcIndec(csv) {
  const lineas = String(csv ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const iEncabezado = lineas.findIndex((l) => /periodo/i.test(l) && /v_m/i.test(l));
  if (iEncabezado < 0) throw new Error('El CSV del INDEC no tiene las columnas Periodo y v_m_IPC.');
  const sep = [';', ',', '\t'].find((s) => lineas[iEncabezado].includes(s));
  const columnas = celdasCsv(lineas[iEncabezado], sep).map(sinAcentos);
  const col = (re) => columnas.findIndex((c) => re.test(c));
  const [cCodigo, cDescripcion, cPeriodo, cVariacion, cRegion] = [/^c.?digo$/, /^descrip/, /^periodo$/, /^v_m/, /^regi/].map(col);
  if (cPeriodo < 0 || cVariacion < 0) throw new Error('El CSV del INDEC no tiene las columnas Periodo y v_m_IPC.');
  const valores = {};
  for (const linea of lineas.slice(iEncabezado + 1)) {
    const c = celdasCsv(linea, sep);
    if (cRegion >= 0 && sinAcentos(c[cRegion]) !== 'nacional') continue;
    const general = (cCodigo >= 0 && c[cCodigo] === '0') || (cDescripcion >= 0 && /nivel general/.test(sinAcentos(c[cDescripcion])));
    if (!general) continue;
    const m = String(c[cPeriodo]).match(/^(\d{4})-?(\d{2})/);
    const variacion = Number(String(c[cVariacion]).replace(',', '.'));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || c[cVariacion] === '' || !Number.isFinite(variacion)) continue;
    valores[`${m[1]}-${m[2]}`] = Number((Math.round(variacion * 10) / 1000).toFixed(6));
  }
  if (!Object.keys(valores).length) throw new Error('El CSV del INDEC no trajo el nivel general nacional.');
  return valores;
}
