// Trae el historial de dólar MEP venta e IPC y escribe un JSON por documento en la carpeta
// indicada (por defecto ./cotizaciones-out), listo para cargar en la base del sistema.
//   node scripts/cotizaciones.mjs [carpeta]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { traerCotizaciones, documentosCotizaciones } from '../src/cotizaciones/fuentes.js';

const carpeta = process.argv[2] ?? 'cotizaciones-out';
const datos = await traerCotizaciones();
const documentos = documentosCotizaciones(datos);
mkdirSync(carpeta, { recursive: true });
for (const { path, data } of documentos) {
  writeFileSync(join(carpeta, `${path.replace('/', '__')}.json`), JSON.stringify(data));
}
const fechas = Object.keys(datos.mep).sort();
const meses = Object.keys(datos.ipc).sort();
console.log(JSON.stringify({
  carpeta,
  documentos: documentos.map((d) => d.path),
  mep: { desde: fechas[0], hasta: fechas.at(-1), ultimo: datos.mep[fechas.at(-1)] },
  ipc: { desde: meses[0], hasta: meses.at(-1), ultimo: datos.ipc[meses.at(-1)] },
}, null, 2));
