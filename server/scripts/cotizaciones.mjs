// Trae el dólar MEP de dolarhoy y el IPC del INDEC (con el historial de ArgentinaDatos) y deja en una
// carpeta los documentos a guardar en la base. Es lo que corre la tarea programada; no necesita
// npm install.
//   node scripts/cotizaciones.mjs --salida <carpeta> [--actuales <carpeta>] [--pedido boton|automatico] [--crudo <carpeta>]
// --actuales  los documentos de la colección cotizaciones como están en la base
//             (<carpeta>/cotizaciones/<id>.json, como los baja ArtifactData con out_dir). Sin esto
//             arma todo desde cero (el historial completo).
// --salida    escribe <salida>/cotizaciones/<id>.json por cada documento que cambió, y estado.json.
// --pedido    boton: pisa el MEP de dolarhoy del día; automatico (por defecto): solo lo completa.
// --crudo     guarda ahí la respuesta de cada fuente tal cual llegó.
// Imprime un resumen en JSON: los documentos a guardar, en orden (estado al final), y el resultado.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { traerFuentes, armarActualizacion } from '../src/cotizaciones/actualizar.js';

// Detrás de un proxy (como en las tareas en la nube de Claude Code) el fetch de Node no lo usa salvo
// con NODE_USE_ENV_PROXY=1 (Node 22.21 o más nuevo), así que el script se vuelve a lanzar con eso.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const { status } = spawnSync(process.execPath, [...process.execArgv, '--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(status ?? 1);
}

const { values: opciones, positionals } = parseArgs({
  options: {
    salida: { type: 'string' },
    actuales: { type: 'string' },
    pedido: { type: 'string', default: 'automatico' },
    crudo: { type: 'string' },
  },
  allowPositionals: true,
});
const salida = opciones.salida ?? positionals[0] ?? 'cotizaciones-out';
if (!['boton', 'automatico'].includes(opciones.pedido)) {
  console.error('--pedido tiene que ser boton o automatico');
  process.exit(2);
}

function leerActuales(carpeta) {
  const dir = carpeta ? join(carpeta, 'cotizaciones') : null;
  if (!dir || !existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
  );
}

const inicio = new Date().toISOString();
const actuales = leerActuales(opciones.actuales);
const crudo = opciones.crudo
  ? (nombre, texto) => {
      mkdirSync(opciones.crudo, { recursive: true });
      writeFileSync(join(opciones.crudo, nombre), texto);
    }
  : null;
const fuentes = await traerFuentes({ crudo });
const { documentos, estado } = armarActualizacion({ actuales, fuentes, ahora: inicio, pedido: opciones.pedido });
estado.ultima.fin = new Date().toISOString();

const dir = resolve(salida, 'cotizaciones');
mkdirSync(dir, { recursive: true });
const escribir = [...documentos, { id: 'estado', data: estado }].map(({ id, data }) => {
  const archivo = join(dir, `${id}.json`);
  writeFileSync(archivo, JSON.stringify(data));
  return { collection: 'cotizaciones', doc_id: id, file_path: archivo, existe: id in actuales };
});
const { documentos: _, ...resultado } = estado.ultima;
console.log(JSON.stringify({ escribir, resultado }, null, 2));
