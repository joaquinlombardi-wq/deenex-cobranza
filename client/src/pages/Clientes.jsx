import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { estadoDeCuenta } from '../../../server/src/engine/cuentaCorriente.js';
import { resumenAcuerdo, pesos, hoyLocal, ESTADOS_CUENTA } from '../formato.js';

const acuerdoActual = (c) => [...(c.acuerdos ?? [])].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];

export function ChipEstado({ estado }) {
  const e = ESTADOS_CUENTA[estado] ?? ESTADOS_CUENTA['sin-movimientos'];
  return <span className={`estado ${e.clase}`}>{e.texto}</span>;
}

export default function Clientes({ onNuevo, onEditar, onVerCuenta }) {
  const [clientes, setClientes] = useState(null);
  const [cuentas, setCuentas] = useState({ cargos: [], pagos: [] });

  useEffect(() => {
    api.clientes().then(setClientes);
    api.cuentas().then(setCuentas).catch(() => {});
  }, []);

  const hoy = hoyLocal();
  const estados = new Map(
    (clientes ?? []).map((c) => [
      c.id,
      estadoDeCuenta({
        cargos: cuentas.cargos.filter((x) => x.clienteId === c.id),
        pagos: cuentas.pagos.filter((x) => x.clienteId === c.id),
        hoy,
      }),
    ]),
  );
  const todos = [...estados.values()];
  const porCobrar = todos.reduce((s, e) => s + Math.max(0, e.totales.saldoArs), 0);
  const vencido = todos.reduce((s, e) => s + e.totales.vencidoArs, 0);
  const conDeuda = todos.filter((e) => e.estado === 'vencido').length;

  return (
    <section>
      <div className="titulo-accion">
        <h1>Clientes</h1>
        <button className="primario" onClick={onNuevo}>+ Nuevo cliente</button>
      </div>

      {clientes?.length > 0 && (
        <div className="resumen">
          <div><span className="etiqueta">Por cobrar</span><strong>{pesos(porCobrar)}</strong></div>
          <div><span className="etiqueta">Vencido</span><strong className={vencido > 0 ? 'rojo' : ''}>{pesos(vencido)}</strong></div>
          <div><span className="etiqueta">Clientes con deuda vencida</span><strong className={conDeuda ? 'rojo' : ''}>{conDeuda}</strong></div>
        </div>
      )}

      {clientes?.length === 0 && (
        <div className="panel vacio">
          <strong>Todavía no hay clientes.</strong>
          <p>Cada cliente lleva su marca, sus franquiciados si tiene, los locales y el acuerdo. Con eso el cierre del mes calcula solo lo que paga cada uno.</p>
          <button className="primario" onClick={onNuevo}>Cargar el primer cliente</button>
        </div>
      )}
      <div className="panel scroll-x" hidden={!clientes?.length}>
        <table className="tabla clientes">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Quién paga</th>
              <th>Acuerdo</th>
              <th className="num">Saldo</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clientes?.map((c) => {
              const e = estados.get(c.id);
              return (
                <tr key={c.id} className="fila-click" onClick={() => onVerCuenta(c)}>
                  <td>
                    <strong>{c.nombre}</strong>
                    <div className="cuit">{c.locales.length ? `${c.locales.length} ${c.locales.length === 1 ? 'local' : 'locales'}` : 'Sin locales'}{c.cuit ? ` · CUIT ${c.cuit}` : ''}</div>
                  </td>
                  <td>{c.quienPaga === 'franquiciados' ? `Cada franquiciado (${c.franquiciados.length})` : 'La marca'}</td>
                  <td>{resumenAcuerdo(acuerdoActual(c))}</td>
                  <td className="num">{e.totales.saldoArs < 0 ? `A favor ${pesos(-e.totales.saldoArs)}` : pesos(e.totales.saldoArs)}</td>
                  <td><ChipEstado estado={e.estado} /></td>
                  <td className="acciones-fila">
                    <button className="link" onClick={(ev) => { ev.stopPropagation(); onVerCuenta(c); }}>Ver cuenta</button>
                    <button className="link" onClick={(ev) => { ev.stopPropagation(); onEditar(c); }}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
