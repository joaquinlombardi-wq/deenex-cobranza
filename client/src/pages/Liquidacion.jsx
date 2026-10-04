import { useState } from 'react';
import { pesos, numero } from '../formato.js';

export default function Liquidacion({ liquidacion }) {
  const [abierta, setAbierta] = useState(false);
  const { pagador, renglones, totales } = liquidacion;
  return (
    <div className="liquidacion">
      <button className="fila-pagador" onClick={() => setAbierta(!abierta)}>
        <span className={`chip ${pagador.tipo}`}>{pagador.tipo === 'marca' ? 'Marca' : 'Franquiciado'}</span>
        <span className="nombre-pagador">
          {pagador.razonSocial ?? pagador.nombre}
          {pagador.cuit && <span className="cuit">CUIT {pagador.cuit}</span>}
        </span>
        <span className="monto">{pesos(totales.netoArs)}</span>
        <span className="flecha">{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && (
        <div className="scroll-x">
        <table className="renglones">
          <thead>
            <tr>
              <th>Detalle</th>
              <th>Dux</th>
              <th className="num">Cant.</th>
              <th className="num">P. unit.</th>
              <th className="num">Bruto</th>
              <th className="num">IVA</th>
              <th className="num">Neto</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r, i) => (
              <tr key={i}>
                <td>{r.detalle}</td>
                <td>{r.productoDux}</td>
                <td className="num">{r.cantidad}</td>
                <td className="num">{r.moneda} {numero(r.precioUnitario)}</td>
                <td className="num">{pesos(r.brutoArs)}</td>
                <td className="num">{r.ivaPct ? pesos(r.ivaArs) : 'Sin IVA'}</td>
                <td className="num">{pesos(r.netoArs)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td className="num">{pesos(totales.brutoArs)}</td>
              <td className="num">{pesos(totales.ivaArs)}</td>
              <td className="num">{pesos(totales.netoArs)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      )}
    </div>
  );
}
