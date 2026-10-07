import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { estadoDeCuenta } from '../../../server/src/engine/cuentaCorriente.js';
import { resumenAcuerdo, resumenLocales, pesos, hoyLocal, periodoActual, periodoMas, nombrePeriodo, ESTADOS_CUENTA } from '../formato.js';
import { usaLocales, localesEn } from '../../../server/src/engine/clientes.js';
import { casillerosDeVentas } from '../../../server/src/engine/ventas.js';

const acuerdoActual = (c) => [...(c.acuerdos ?? [])].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];

// Lo que debe (o tiene a favor) un cliente, dicho con palabras.
export function saldoTexto(estado) {
  if (estado.estado === 'sin-movimientos') return '-';
  const saldo = estado.totales.saldoArs;
  if (saldo > 0.005) return `Debe ${pesos(saldo)}`;
  if (saldo < -0.005) return `A favor ${pesos(-saldo)}`;
  return pesos(0);
}

// '12 locales propios · cambia en Diciembre 2026'
function localesHoy(c) {
  const hoy = periodoActual();
  const proximo = c.cambiosLocales?.find((x) => x.desde > hoy);
  return [resumenLocales(localesEn(c, hoy)), proximo && `cambia en ${nombrePeriodo(proximo.desde)}`].filter(Boolean).join(' · ');
}

export function ChipEstado({ estado }) {
  const e = ESTADOS_CUENTA[estado] ?? ESTADOS_CUENTA['sin-movimientos'];
  return <span className={`estado ${e.clase}`}>{e.texto}</span>;
}

// Clientes a los que les faltan las ventas que pide el próximo cierre, una vez que ese mes terminó.
async function faltanVentas(clientes) {
  const mes = periodoMas(await api.mesACerrar(hoyLocal()), -1);
  if (mes >= periodoActual()) return null;
  const filas = await api.ventas(mes);
  const ids = clientes.filter((c) => casillerosDeVentas(c, mes, filas).some((x) => x.monto == null)).map((c) => c.id);
  return { mes, ids: new Set(ids) };
}

export default function Clientes({ onNuevo, onEditar, onVerCuenta, onCargarMes, onIrCierre }) {
  const [clientes, setClientes] = useState(null);
  const [cuentas, setCuentas] = useState({ cargos: [], pagos: [] });
  const [sinPasar, setSinPasar] = useState([]);
  const [faltan, setFaltan] = useState(null);

  useEffect(() => {
    api.clientes().then((lista) => {
      setClientes(lista);
      faltanVentas(lista).then(setFaltan).catch(() => {});
    });
    api.cuentas().then(setCuentas).catch(() => {});
    api.cierresSinPasar().then(setSinPasar).catch(() => {});
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

      {sinPasar.map((c) => (
        <div className="alerta aviso sin-pasar" key={c.periodo}>
          <span>
            <strong>{nombrePeriodo(c.periodo)}</strong>{' '}
            {c.cambio ? 'cambió desde que lo pasaste a las cuentas corrientes' : 'está generado pero todavía no pasó a las cuentas corrientes'}, así que los saldos no incluyen
            {c.cambio ? ' los cambios' : <> sus <span className="sin-corte">{pesos(c.totalArs)}</span></>}.
          </span>
          <button className="link" onClick={() => onIrCierre(c.periodo)}>Ir al cierre de {nombrePeriodo(c.periodo)}</button>
        </div>
      ))}

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
          <p>Cada cliente lleva su marca, cuántos locales propios y franquiciados tiene y el acuerdo. Con eso el cierre del mes calcula solo lo que paga cada uno.</p>
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
                    <div className="cuit">{[localesHoy(c) || (usaLocales(acuerdoActual(c)) && 'Sin locales cargados'), c.cuit && `CUIT ${c.cuit}`].filter(Boolean).join(' · ')}</div>
                    {faltan?.ids.has(c.id) && (
                      <button className="estado aviso boton-estado" onClick={(ev) => { ev.stopPropagation(); onCargarMes(c, faltan.mes); }}>
                        Faltan las ventas de {nombrePeriodo(faltan.mes)}
                      </button>
                    )}
                  </td>
                  <td>{c.quienPaga === 'franquiciados' ? `Cada franquiciado (${c.franquiciados.length})` : 'La marca'}</td>
                  <td>{resumenAcuerdo(acuerdoActual(c))}</td>
                  <td className={`num ${e.totales.vencidoArs > 0 ? 'rojo' : ''}`}>{saldoTexto(e)}</td>
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
