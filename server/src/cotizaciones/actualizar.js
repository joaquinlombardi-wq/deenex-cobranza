// Actualización del dólar MEP y del IPC: lo que corre la tarea programada (y el botón Actualizar de
// la app). Trae dolarhoy, el CSV del INDEC y el historial de ArgentinaDatos, y arma los documentos a
// guardar combinándolos con lo que ya hay en la base. No usa dependencias: corre con Node solo.
//
// Documentos de la colección cotizaciones:
//   mep-dolarhoy  { valores: { fecha: venta }, detalle: { fecha: { compra, venta, publicado, leidoEn, pedido } } }
//   mep-<AAAA>    { valores: { fecha: venta } } historial de ArgentinaDatos
//   ipc           { valores: { 'AAAA-MM': 0.021 } } INDEC, con el historial desde 1943
//   estado        { ultima: { pedido, inicio, fin, ok, mep, ipc, errores, documentos } }
import {
  FUENTES, FUENTE_DOLARHOY, FUENTE_MEP, FUENTE_IPC_AUTOMATICA,
  leerMepDolarhoy, leerIpcIndec, leerMepHistorico, leerIpc, fechaArgentina,
} from './fuentes.js';

const ESPERA_MAXIMA = 30000;
const AGENTE = 'Mozilla/5.0 (compatible; DeenexCobranza/1.0)';
// Una lectura de dolarhoy que se aleja más que esto del último MEP conocido se descarta.
const SALTO_MAXIMO = 0.25;
// Si se corta la conexión antes de que conteste (le pasa al INDEC desde la nube), se vuelve a probar.
const INTENTOS = 4;
const PAUSA = 3000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirTexto(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': AGENTE }, redirect: 'follow', signal: AbortSignal.timeout(ESPERA_MAXIMA) });
  if (!res.ok) throw new Error(`${new URL(url).host} respondió ${res.status}`);
  const bytes = await res.arrayBuffer();
  const latin = /charset=(iso-8859-1|latin-?1|windows-1252)/i.test(res.headers.get('content-type') ?? '');
  return new TextDecoder(latin ? 'latin1' : 'utf-8').decode(bytes);
}

// Por qué no se pudo traer una fuente, en una línea. fetch solo dice "fetch failed": el motivo real
// viene en la causa, y si es el proxy de la red el que no deja pasar, lo dice así.
function motivo(e, url) {
  const host = new URL(url).host;
  if (e.name === 'TimeoutError') return `${host} no respondió`;
  const causa = e.cause?.message || e.cause?.code;
  if (!causa) return e.message;
  const proxy = /Proxy response \((\d+)\)/.exec(causa);
  if (proxy) return `la red de la tarea no deja entrar a ${host} (${proxy[1]})`;
  return `no pude conectarme con ${host}: ${causa}`;
}

// Trae cada fuente por separado: si una falla, las otras siguen. `crudo(nombre, texto)` recibe cada
// respuesta tal cual llegó, antes de leerla, para revisar el formato si algo no se pudo leer.
// Un corte de conexión se reintenta; una respuesta con error o un tiempo de espera agotado, no.
export async function traerFuentes({ fetch: fetchImpl = globalThis.fetch, crudo = null, esperar = dormir } = {}) {
  const pedir = async (url) => {
    for (let intento = 1; ; intento++) {
      try {
        return await pedirTexto(url, fetchImpl);
      } catch (e) {
        if (intento >= INTENTOS || e.name === 'TimeoutError' || !(e instanceof TypeError)) throw e;
        await esperar(PAUSA * intento);
      }
    }
  };
  const traer = async (nombre, url, leer) => {
    try {
      const texto = await pedir(url);
      if (crudo) await crudo(nombre, texto);
      return { ok: true, valor: leer(texto) };
    } catch (e) {
      return { ok: false, error: motivo(e, url) };
    }
  };
  const [dolarhoy, ipcIndec, mepHistorico, ipcHistorico] = await Promise.all([
    traer('dolarhoy.html', FUENTES.dolarhoy, leerMepDolarhoy),
    traer('indec-ipc.csv', FUENTES.indec, leerIpcIndec),
    traer('argentinadatos-mep.json', FUENTES.mepHistorico, (t) => leerMepHistorico(JSON.parse(t))),
    traer('argentinadatos-ipc.json', FUENTES.ipc, (t) => leerIpc(JSON.parse(t))),
  ]);
  return { dolarhoy, ipcIndec, mepHistorico, ipcHistorico };
}

const ordenado = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const iguales = (a, b) => ordenado(a) === ordenado(b);

// El último MEP conocido hasta `fecha` (inclusive) entre todas las series, para controlar la lectura.
function ultimoMep(series, fecha) {
  let mejor = null;
  for (const valores of series) {
    for (const [f, v] of Object.entries(valores ?? {})) {
      if (f <= fecha && v > 0 && (!mejor || f > mejor.fecha)) mejor = { fecha: f, valor: v };
    }
  }
  return mejor;
}

/**
 * @param actuales  { id: data } los documentos de cotizaciones como están en la base
 * @param fuentes   lo que devolvió traerFuentes
 * @param ahora     instante ISO de la corrida
 * @param pedido    'boton' (alguien tocó Actualizar: pisa el valor de dolarhoy de ese día) o
 *                  'automatico' (la corrida diaria: solo completa el día si no tenía valor)
 * @returns { documentos: [{ id, data }], estado } documentos que cambiaron, y el estado (siempre va)
 */
export function armarActualizacion({ actuales = {}, fuentes, ahora, pedido = 'automatico' }) {
  const documentos = [];
  const errores = [];
  const ultima = { pedido, inicio: ahora, fin: ahora, ok: false, mep: null, ipc: null, errores, documentos: [] };
  const anotar = (fuente, r) => {
    if (!r.ok) errores.push({ fuente, mensaje: r.error });
  };
  anotar('dolarhoy', fuentes.dolarhoy);
  anotar('INDEC', fuentes.ipcIndec);
  anotar('ArgentinaDatos (MEP)', fuentes.mepHistorico);
  anotar('ArgentinaDatos (IPC)', fuentes.ipcHistorico);

  // Historial de MEP: un documento por año, solo los que cambiaron.
  const historico = fuentes.mepHistorico.ok ? fuentes.mepHistorico.valor : {};
  const porAnio = {};
  for (const [fecha, venta] of Object.entries(historico)) (porAnio[fecha.slice(0, 4)] ??= {})[fecha] = venta;
  for (const [anio, nuevos] of Object.entries(porAnio).sort()) {
    const id = `mep-${anio}`;
    const valores = { ...actuales[id]?.valores, ...nuevos };
    if (iguales(valores, actuales[id]?.valores)) continue;
    documentos.push({ id, data: { valores, fuente: FUENTE_MEP, origen: 'automatico', actualizado: ahora } });
  }

  // dolarhoy: el valor del día de la publicación (un sábado muestra el del viernes).
  if (fuentes.dolarhoy.ok) {
    const { compra, venta, publicado } = fuentes.dolarhoy.valor;
    const fecha = publicado?.slice(0, 10) ?? fechaArgentina(ahora);
    const actual = actuales['mep-dolarhoy'] ?? {};
    const anteriores = Object.entries(actuales)
      .filter(([id]) => /^mep-(\d{4}|manual|dolarhoy)$/.test(id))
      .map(([, d]) => d.valores);
    const referencia = ultimoMep([...anteriores, historico], fecha);
    if (referencia && Math.abs(venta / referencia.valor - 1) > SALTO_MAXIMO) {
      errores.push({
        fuente: 'dolarhoy',
        mensaje: `Leí una venta de ${venta} y el último MEP conocido es ${referencia.valor} (${referencia.fecha}): parece mal leído y no lo guardé.`,
      });
    } else if (pedido !== 'boton' && actual.valores?.[fecha] != null) {
      // La corrida diaria no pisa el valor que ya se tomó ese día (por ejemplo, con el botón).
      const previo = actual.detalle?.[fecha] ?? {};
      ultima.mep = { fecha, venta: actual.valores[fecha], compra: previo.compra ?? null, publicado: previo.publicado ?? null, guardado: false };
    } else {
      ultima.mep = { fecha, venta, compra, publicado, guardado: true };
      documentos.push({
        id: 'mep-dolarhoy',
        data: {
          valores: { ...actual.valores, [fecha]: venta },
          detalle: { ...actual.detalle, [fecha]: { compra, venta, publicado, leidoEn: ahora, pedido } },
          fuente: FUENTE_DOLARHOY,
          origen: 'automatico',
          actualizado: ahora,
        },
      });
    }
  }

  // IPC: el historial de ArgentinaDatos y, encima, lo que publica el INDEC.
  const ipcIndec = fuentes.ipcIndec.ok ? fuentes.ipcIndec.valor : {};
  const ipcHistorico = fuentes.ipcHistorico.ok ? fuentes.ipcHistorico.valor : {};
  const ipc = { ...actuales.ipc?.valores, ...ipcHistorico, ...ipcIndec };
  if (Object.keys(ipc).length && !iguales(ipc, actuales.ipc?.valores)) {
    documentos.push({ id: 'ipc', data: { valores: ipc, fuente: FUENTE_IPC_AUTOMATICA, origen: 'automatico', actualizado: ahora } });
  }
  const mes = Object.keys(ipc).sort().at(-1);
  if (mes && (fuentes.ipcIndec.ok || fuentes.ipcHistorico.ok)) {
    ultima.ipc = { mes, valor: ipc[mes], fuente: ipcIndec[mes] != null ? 'INDEC' : 'ArgentinaDatos' };
  }

  ultima.ok = Boolean(ultima.mep && ultima.ipc);
  ultima.documentos = documentos.map((d) => d.id);
  return { documentos, estado: { ultima } };
}
