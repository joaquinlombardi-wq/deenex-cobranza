// Excel para el contador: el libro se arma en el navegador con ExcelJS, que se baja del CDN la
// primera vez que hace falta, y se ofrece como descarga. En claude.ai la descarga pasa por la
// capability `downloads` (la persona confirma); en la versión con la API, por el navegador.
import { armarLibroContador } from '../../server/src/facturacion/libroContador.js';
import { nombreArchivoContador } from '../../server/src/facturacion/planillaContador.js';
import { hoyLocal } from './formato.js';

const EXCELJS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
];
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const enArtifact = import.meta.env.MODE === 'artifact';

function cargarScript(src) {
  return new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => (window.ExcelJS ? resolver(window.ExcelJS) : rechazar(new Error(src)));
    script.onerror = () => {
      script.remove();
      rechazar(new Error(src));
    };
    document.head.append(script);
  });
}

let excelJS = null;
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelJS ??= EXCELJS.reduce((anterior, src) => anterior.catch(() => cargarScript(src)), Promise.reject(new Error('sin cargar')))
    .catch(() => {
      excelJS = null;
      throw new Error('No pude cargar lo que arma el Excel. Revisá la conexión y probá de nuevo.');
    });
  return excelJS;
}

let descargas = null;
const capacidadDescargas = () => {
  descargas ??= window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  return descargas;
};

// Si esta vista puede ofrecer archivos para bajar (si no, el botón no se muestra).
export const puedeDescargar = () => (enArtifact ? capacidadDescargas().then(Boolean) : Promise.resolve(true));

function descargaDelNavegador(blob, archivo) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Arma el Excel de un cierre y lo ofrece. Devuelve { estado: 'guardado' | 'cancelado', archivo }.
export async function descargarExcelContador(cierre) {
  const ExcelJS = await cargarExcelJS();
  const { libro } = armarLibroContador(ExcelJS, cierre, `${hoyLocal()}T12:00:00`);
  const archivo = nombreArchivoContador(cierre.periodo);
  const blob = new Blob([await libro.xlsx.writeBuffer()], { type: TIPO_XLSX });

  if (!enArtifact) {
    descargaDelNavegador(blob, archivo);
    return { estado: 'guardado', archivo };
  }
  const d = await capacidadDescargas();
  if (!d) throw new Error('Esta vista no permite descargar archivos.');
  try {
    await d.save({ filename: archivo, data: blob });
    return { estado: 'guardado', archivo };
  } catch (e) {
    if (e?.code === 'declined') return { estado: 'cancelado', archivo };
    if (e?.code === 'rate_limited') throw new Error('Ya hay una descarga esperando que la confirmes.');
    throw new Error(`No pude descargar el Excel: ${e?.message || e?.code || 'error desconocido'}.`);
  }
}
