import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { resumenAcuerdo } from '../formato.js';

const acuerdoActual = (c) => [...(c.acuerdos ?? [])].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];

export default function Clientes({ onNuevo, onEditar }) {
  const [clientes, setClientes] = useState(null);
  useEffect(() => { api.clientes().then(setClientes); }, []);

  return (
    <section>
      <div className="titulo-accion">
        <h1>Clientes</h1>
        <button className="primario" onClick={onNuevo}>+ Nuevo cliente</button>
      </div>
      {clientes?.length === 0 && (
        <div className="panel vacio">
          <strong>Todavía no hay clientes.</strong>
          <p>Cada cliente lleva su marca, sus franquiciados si tiene, los locales y el acuerdo. Con eso el cierre del mes calcula solo lo que paga cada uno.</p>
          <button className="primario" onClick={onNuevo}>Cargar el primer cliente</button>
        </div>
      )}
      <div className="panel scroll-x" hidden={!clientes?.length}>
        <table className="tabla">
          <thead>
            <tr><th>Cliente</th><th>Quién paga</th><th className="num">Locales</th><th>Acuerdo</th><th /></tr>
          </thead>
          <tbody>
            {clientes?.map((c) => {
              const propios = c.locales.filter((l) => l.tipo === 'propio').length;
              return (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong>{c.cuit && <div className="cuit">CUIT {c.cuit}</div>}</td>
                  <td>{c.quienPaga === 'franquiciados' ? `Cada franquiciado (${c.franquiciados.length})` : 'La marca'}</td>
                  <td className="num">{c.locales.length ? `${c.locales.length} (${propios} propios)` : '-'}</td>
                  <td>{resumenAcuerdo(acuerdoActual(c))}</td>
                  <td><button className="link" onClick={() => onEditar(c)}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
