// El Excel para el contador, con el formato de la facturación mensual: hoja DETALLE (un renglón por
// concepto de cada factura, con fórmulas) y hoja PRODUCTOS DUX. Recibe la librería ExcelJS para
// poder usarla igual en el navegador (desde el CDN) y en los tests (desde npm).

import { planillaContador } from './planillaContador.js';

const COLUMNAS = [
  { titulo: 'FACTURA', ancho: 9 },
  { titulo: 'CLIENTE', ancho: 34 },
  { titulo: 'CUIT', ancho: 15 },
  { titulo: 'CÓDIGO DUX', ancho: 12 },
  { titulo: 'PRODUCTO DUX (sistema contable)', ancho: 46 },
  { titulo: 'DETALLE EN LA FACTURA', ancho: 52 },
  { titulo: 'CANT.', ancho: 8 },
  { titulo: 'MON.', ancho: 7 },
  { titulo: 'P. UNIT.', ancho: 13 },
  { titulo: 'IVA %', ancho: 7 },
  { titulo: 'BRUTO', ancho: 14 },
  { titulo: 'IVA', ancho: 13 },
  { titulo: 'NETO', ancho: 14 },
  { titulo: 'BRUTO', ancho: 16 },
  { titulo: 'IVA', ancho: 15 },
  { titulo: 'NETO', ancho: 16 },
  { titulo: 'OBSERVACIONES', ancho: 50 },
];

const FORMATO = {
  precio: '#,##0.00;\\(#,##0.00\\)',
  pct: '0%',
  usd: '"USD "#,##0.00;"(USD "#,##0.00\\)',
  ars: '"$ "#,##0.00;"($ "#,##0.00\\)',
};

const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const COLOR = {
  titulos: 'FF404040',
  usd: 'FF92D050',
  ars: 'FF00B0F0',
  alterna: 'FFF2F2F2',
  editable: 'FFFFFF00',
  total: 'FFBFBFBF',
  usado: 'FFE2EFDA',
  gris: 'FF808080',
  azul: 'FF0000FF',
  mep: 'FF1E27F3',
  rojo: 'FFC00000',
};

const fecha = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

function hojaDetalle(libro, planilla, generadoEn) {
  const hoja = libro.addWorksheet('DETALLE', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  COLUMNAS.forEach((c, i) => { hoja.getColumn(i + 1).width = c.ancho; });

  hoja.getCell('A1').value = `DETALLE POR FACTURA - ${planilla.mes.toUpperCase()}`;
  hoja.getCell('A1').font = { bold: true, size: 13 };
  hoja.getCell('A2').value = 'Cada fila es un renglón de factura. El CÓDIGO DUX y el PRODUCTO DUX son los del sistema contable.';
  hoja.getCell('A2').font = { color: { argb: COLOR.gris } };
  hoja.getCell('G2').value = 'DÓLAR MEP VENTA';
  hoja.getCell('G2').font = { bold: true };
  hoja.getCell('I2').value = planilla.mep ?? null;
  hoja.getCell('I2').numFmt = FORMATO.precio;
  hoja.getCell('I2').font = { bold: true, color: { argb: COLOR.mep } };
  if (planilla.fechaMep) {
    hoja.getCell('J2').value = `del ${fecha(planilla.fechaMep)}`;
    hoja.getCell('J2').font = { color: { argb: COLOR.gris } };
  }

  hoja.mergeCells('K3:M3');
  hoja.mergeCells('N3:P3');
  for (const [celda, texto, color] of [['K3', 'MONTO USD', COLOR.usd], ['N3', 'MONTO ARGENTINO', COLOR.ars]]) {
    Object.assign(hoja.getCell(celda), { value: texto, fill: relleno(color), font: { bold: true }, alignment: { horizontal: 'center' } });
  }

  const titulos = hoja.getRow(4);
  COLUMNAS.forEach((c, i) => {
    Object.assign(titulos.getCell(i + 1), {
      value: c.titulo,
      fill: relleno(COLOR.titulos),
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      alignment: { vertical: 'middle', wrapText: true },
    });
  });

  let fila = 5;
  planilla.facturas.forEach((factura, nFactura) => {
    factura.renglones.forEach((r, nRenglon) => {
      const f = fila;
      const usd = r.usd;
      const observaciones = nRenglon === 0 ? factura.observaciones.join(' ') : '';
      const valores = [
        factura.numero,
        factura.cliente,
        factura.cuit || null,
        r.productoDux,
        r.productoDuxNombre,
        r.detalle,
        r.cantidad,
        r.moneda,
        r.precioUnitario,
        r.ivaPct,
        // Las fórmulas son las de la planilla de siempre; los pesos se redondean al centavo por
        // renglón, como el sistema.
        { formula: `IF($H${f}="USD",$G${f}*$I${f},"")`, result: usd ? usd.bruto : '' },
        { formula: `IF($H${f}="USD",$K${f}*$J${f},"")`, result: usd ? usd.iva : '' },
        { formula: `IF($H${f}="USD",$K${f}+$L${f},"")`, result: usd ? usd.neto : '' },
        { formula: `IF($H${f}="USD",ROUND($G${f}*$I${f}*$I$2,2),ROUND($G${f}*$I${f},2))`, result: r.ars.bruto },
        { formula: `ROUND($N${f}*$J${f},2)`, result: r.ars.iva },
        { formula: `$N${f}+$O${f}`, result: r.ars.neto },
        observaciones || null,
      ];
      const row = hoja.getRow(f);
      valores.forEach((v, i) => {
        const celda = row.getCell(i + 1);
        celda.value = v;
        if (nFactura % 2 === 0) celda.fill = relleno(COLOR.alterna);
      });
      row.getCell(1).font = { bold: true };
      for (const col of [7, 9]) {
        row.getCell(col).fill = relleno(COLOR.editable);
        row.getCell(col).font = { bold: true, color: { argb: COLOR.azul } };
      }
      row.getCell(9).numFmt = FORMATO.precio;
      row.getCell(10).numFmt = FORMATO.pct;
      for (const col of [11, 12, 13]) row.getCell(col).numFmt = FORMATO.usd;
      for (const col of [14, 15, 16]) row.getCell(col).numFmt = FORMATO.ars;
      if (observaciones) row.getCell(17).font = { color: { argb: COLOR.rojo } };
      fila += 1;
    });
  });

  const ultima = fila - 1;
  const total = hoja.getRow(fila);
  hoja.mergeCells(`A${fila}:J${fila}`);
  total.getCell(1).value = 'TOTAL GENERAL';
  const sumas = [
    ['K', planilla.totales.usd.bruto, FORMATO.usd], ['L', planilla.totales.usd.iva, FORMATO.usd], ['M', planilla.totales.usd.neto, FORMATO.usd],
    ['N', planilla.totales.ars.bruto, FORMATO.ars], ['O', planilla.totales.ars.iva, FORMATO.ars], ['P', planilla.totales.ars.neto, FORMATO.ars],
  ];
  for (const [col, result, numFmt] of sumas) {
    Object.assign(hoja.getCell(`${col}${fila}`), { value: { formula: `SUM(${col}5:${col}${Math.max(ultima, 5)})`, result }, numFmt });
  }
  for (let col = 1; col <= COLUMNAS.length; col += 1) {
    Object.assign(total.getCell(col), { fill: relleno(COLOR.total), font: { bold: true } });
  }

  const notas = [
    'AMARILLO = celda editable (cantidad y precio unitario). Las columnas BRUTO / IVA / NETO son fórmulas: no se tocan.',
    'Todo lo informado es + IVA (21%), salvo los renglones con IVA 0%.',
    `Generado por Deenex Cobranza el ${fecha(generadoEn)} a partir del cierre de ${planilla.mes}.`,
    ...planilla.pendientes.map((p) => `SIN FACTURAR: ${p.cliente}. ${p.motivo}`),
  ];
  notas.forEach((texto, i) => {
    const f = fila + 2 + i;
    hoja.mergeCells(`A${f}:Q${f}`);
    hoja.getCell(`A${f}`).value = texto;
    if (texto.startsWith('SIN FACTURAR')) hoja.getCell(`A${f}`).font = { bold: true, color: { argb: COLOR.rojo } };
  });
  return hoja;
}

function hojaProductos(libro, planilla) {
  const hoja = libro.addWorksheet('PRODUCTOS DUX', { views: [{ state: 'frozen', ySplit: 4 }] });
  [13, 58, 18, 9, 12, 36].forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  hoja.getCell('A1').value = 'LISTADO DE PRODUCTOS DEL SISTEMA DUX';
  hoja.getCell('A1').font = { bold: true };
  hoja.getCell('A2').value = 'Fuente: exportación del sistema Dux.';
  hoja.getCell('A2').font = { color: { argb: COLOR.gris } };
  const titulos = ['CÓDIGO', 'PRODUCTO', 'DISPONIBLE PARA', 'IVA %', 'MONEDA', `USADO EN ${planilla.mes.split(' ')[0].toUpperCase()}`];
  titulos.forEach((t, i) => {
    Object.assign(hoja.getRow(4).getCell(i + 1), { value: t, fill: relleno(COLOR.titulos), font: { bold: true, color: { argb: 'FFFFFFFF' } } });
  });
  planilla.productos.forEach((p, n) => {
    const row = hoja.getRow(5 + n);
    [p.codigo, p.nombre, p.disponiblePara, p.ivaPct, p.moneda, p.usadoEn.join(' / ') || null].forEach((v, i) => {
      const celda = row.getCell(i + 1);
      celda.value = v;
      if (p.usadoEn.length) celda.fill = relleno(COLOR.usado);
    });
    row.getCell(4).numFmt = FORMATO.pct;
    if (p.usadoEn.length) {
      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true };
    }
  });
  hoja.getCell(`A${5 + planilla.productos.length + 1}`).value = 'Las filas verdes son los productos usados en la facturación de este mes.';
  return hoja;
}

/**
 * @param ExcelJS    la librería (window.ExcelJS en el navegador, el paquete de npm en los tests)
 * @param cierre     el cierre del mes, como lo guarda el sistema
 * @param generadoEn fecha ISO en que se arma (por defecto, ahora)
 */
export function armarLibroContador(ExcelJS, cierre, generadoEn = new Date().toISOString()) {
  const planilla = planillaContador(cierre);
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Deenex Cobranza';
  libro.created = new Date(generadoEn);
  hojaDetalle(libro, planilla, generadoEn);
  hojaProductos(libro, planilla);
  return { libro, planilla };
}
