// Series pegadas a mano en la pestaña Dólar e IPC: el JSON de ArgentinaDatos copiado del
// navegador, o columnas de fecha y valor copiadas de un Excel.
import { leerIpc, leerMepHistorico, leerMepHoy } from './fuentes.js';

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const dos = (n) => String(n).padStart(2, '0');

function armarFecha(anio, mes, dia = null) {
  if (!(mes >= 1 && mes <= 12) || !(anio >= 1900 && anio <= 2100)) return null;
  if (dia !== null && !(dia >= 1 && dia <= 31)) return null;
  return { anio, mes, dia };
}

// '2017-01', '2017-01-31', '31/01/2017', '01/2017', 'ene-17', 'enero de 2017' -> { anio, mes, dia }
export function leerFecha(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return armarFecha(+m[1], +m[2], m[3] ? +m[3] : null);
  if ((m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) return armarFecha(+m[3], +m[2], +m[1]);
  if ((m = t.match(/^(\d{1,2})[/-](\d{4})$/))) return armarFecha(+m[2], +m[1]);
  if ((m = t.match(/^([a-zñ]{3})[a-zñ]*\.?[\s/-]*(?:de\s+)?(\d{2}|\d{4})$/))) {
    const anio = m[2].length === 2 ? (+m[2] < 40 ? 2000 : 1900) + +m[2] : +m[2];
    return MESES[m[1]] ? armarFecha(anio, MESES[m[1]]) : null;
  }
  return null;
}

// '2,1' '-0.3' '1.549,80' '1549.8' '1,549.80'. En el IPC el punto siempre es decimal; en el dólar
// '1.549' se lee como mil quinientos cuarenta y nueve.
export function leerNumero(texto, tipo) {
  let t = String(texto ?? '').trim().replace(/[%$\s]/g, '');
  if (!/^-?\d[\d.,]*$/.test(t)) return NaN;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (coma >= 0) t = t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (tipo === 'mep' && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}

function celdas(linea) {
  if (/[\t;]/.test(linea)) return linea.split(/[\t;]/).map((c) => c.trim()).filter(Boolean);
  const m = linea.match(/^(.+?)(?:\s*,\s*|\s+)(-?\d[\d.,]*\s*%?)$/);
  return m ? [m[1], m[2]] : [linea];
}

function leerJson(texto, tipo) {
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('Parece el JSON de la página pero está incompleto. Copiá la página entera (Ctrl+A y después Ctrl+C).');
  }
  if (tipo === 'ipc') return leerIpc(json);
  if (!Array.isArray(json) && json?.fechaActualizacion) {
    const hoy = leerMepHoy(json);
    return { [hoy.fecha]: hoy.venta };
  }
  return leerMepHistorico(json);
}

// tipo 'ipc' -> { valores: { 'AAAA-MM': 0.021 } } (lo pegado va en %)
// tipo 'mep' -> { valores: { 'AAAA-MM-DD': 1549.8 } } (si hay varias columnas, toma la última: la venta)
export function leerSeriePegada(texto, tipo) {
  const t = String(texto ?? '').trim();
  if (!t) throw new Error('No pegaste nada.');
  if (t.startsWith('[') || t.startsWith('{')) return { valores: leerJson(t, tipo), formato: 'json', descartadas: [] };

  const valores = {};
  const descartadas = [];
  for (const linea of t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [primera, ...resto] = celdas(linea);
    const fecha = leerFecha(primera);
    const valor = resto.map((c) => leerNumero(c, tipo)).filter(Number.isFinite).at(-1);
    const sirve = fecha && valor !== undefined && (tipo === 'ipc' || (fecha.dia !== null && valor > 0));
    if (!sirve) {
      descartadas.push(linea);
      continue;
    }
    if (tipo === 'ipc') valores[`${fecha.anio}-${dos(fecha.mes)}`] = Number((valor / 100).toFixed(6));
    else valores[`${fecha.anio}-${dos(fecha.mes)}-${dos(fecha.dia)}`] = valor;
  }
  if (!Object.keys(valores).length) {
    throw new Error(tipo === 'ipc'
      ? 'No encontré meses con su IPC. Pegá el JSON de la página o dos columnas: mes y porcentaje.'
      : 'No encontré días con su cotización. Pegá el JSON de la página o dos columnas: fecha y venta.');
  }
  return { valores, formato: 'texto', descartadas };
}
