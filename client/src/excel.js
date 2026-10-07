// Excel para el contador: el libro se arma en el navegador con ExcelJS, que se baja del CDN la
// primera vez que hace falta, y se ofrece como descarga (ver descargas.js).
import { armarLibroContador } from '../../server/src/facturacion/libroContador.js';
import { nombreArchivoContador } from '../../server/src/facturacion/planillaContador.js';
import { hoyLocal } from './formato.js';
import { ofrecerArchivo } from './descargas.js';

const EXCELJS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
];
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

// Arma el Excel de un cierre y lo ofrece. Devuelve { estado: 'guardado' | 'cancelado', archivo }.
export async function descargarExcelContador(cierre) {
  const ExcelJS = await cargarExcelJS();
  const { libro } = armarLibroContador(ExcelJS, cierre, `${hoyLocal()}T12:00:00`);
  const archivo = nombreArchivoContador(cierre.periodo);
  const blob = new Blob([await libro.xlsx.writeBuffer()], { type: TIPO_XLSX });
  return ofrecerArchivo(blob, archivo, 'el Excel');
}
