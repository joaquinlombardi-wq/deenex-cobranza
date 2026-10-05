import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { acuerdoVigente } from '../../../server/src/engine/liquidar.js';
import { gruposDeVentas } from '../../../server/src/engine/clientes.js';
import { nombrePeriodo, periodoMas, periodoActual, pesos, leerMonto } from '../formato.js';

const CANALES = ['delivery', 'takeaway'];
const clave = (clienteId, grupo, canal) => `${clienteId}|${grupo}|${canal}`;
const formato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const comoTexto = (v) => formato.format(v);

const nombreGrupo = (g) => ({ propios: 'Locales propios', franquiciados: 'Locales franquiciados', todos: 'Todos los locales' })[g.id] ?? g.nombre;

// Ventas del mes por cliente, grupo de locales y canal (con IVA, sin envío). Hasta que los
// devs conecten la plataforma se cargan acá a mano.
export default function Ventas() {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), -1));
  const [clientes, setClientes] = useState(null);
  const [filas, setFilas] = useState(null); // null mientras carga el mes
  const [valores, setValores] = useState({});
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => { api.clientes().then(setClientes); }, []);

  useEffect(() => {
    let vigente = true;
    setMensaje(null);
    setFilas(null);
    api.ventas(periodo).then((f) => vigente && setFilas(f));
    return () => { vigente = false; };
  }, [periodo]);

  // Clientes que cobran comisión sobre las ventas de este mes, con los grupos que hay que cargar.
  const tablas = useMemo(() => (clientes ?? []).flatMap((c) => {
    const acuerdo = acuerdoVigente(c, periodo);
    if (!CANALES.some((k) => acuerdo?.comision?.[k] != null)) return [];
    const grupos = gruposDeVentas(c, acuerdo);
    const canales = CANALES.filter((k) => grupos.some((g) => g.tasas[k] != null));
    return [{ cliente: c, grupos, canales }];
  }), [clientes, periodo]);

  // Lo guardado, en las casillas. Si propios y franquiciados se cobran juntos pero llegaron por
  // separado, la casilla muestra la suma.
  useEffect(() => {
    if (!filas) return setValores({});
    const monto = (c, grupo, canal) => filas.find((f) => f.cliente_id === c && f.grupo === grupo && f.canal === canal)?.total_con_iva;
    const nuevos = {};
    for (const { cliente, grupos, canales } of tablas) {
      for (const g of grupos) {
        for (const k of canales) {
          let v = monto(cliente.id, g.id, k);
          if (v == null && g.miembros.length > 1) {
            const partes = g.miembros.map((m) => monto(cliente.id, m, k));
            if (partes.every((p) => p != null)) v = partes.reduce((s, p) => s + p, 0);
          }
          if (v != null) nuevos[clave(cliente.id, g.id, k)] = comoTexto(v);
        }
      }
    }
    setValores(nuevos);
  }, [filas, tablas]);

  async function guardar() {
    if (!filas) return;
    const nuevas = [];
    const reemplaza = new Set();
    for (const { cliente, grupos, canales } of tablas) {
      for (const g of grupos) {
        for (const k of canales) {
          if (g.tasas[k] == null) continue;
          // Lo que se ve acá reemplaza lo guardado: para la marca, el total y lo separado por tipo de local.
          const pisa = g.pagador === 'marca' ? ['todos', 'propios', 'franquiciados'] : [g.id];
          pisa.forEach((m) => reemplaza.add(clave(cliente.id, m, k)));
          const v = valores[clave(cliente.id, g.id, k)] ?? '';
          if (v.trim() === '') continue;
          const total = leerMonto(v);
          if (Number.isNaN(total) || total < 0) return setMensaje({ tipo: 'error', texto: `El monto "${v}" de ${cliente.nombre} no es un número.` });
          nuevas.push({ cliente_id: cliente.id, grupo: g.id, periodo, canal: k, total_con_iva: total });
        }
      }
    }
    // Se conservan las filas que esta pantalla no muestra (otros clientes o grupos).
    const otras = filas.filter((f) => !reemplaza.has(clave(f.cliente_id, f.grupo, f.canal)));
    const todas = [...otras, ...nuevas];
    try {
      await api.guardarVentas(periodo, todas);
    } catch (e) {
      return setMensaje({ tipo: 'error', texto: `No pude guardar las ventas: ${e.message}` });
    }
    setFilas(todas);
    setMensaje({ tipo: 'ok', texto: `Guardé ${nuevas.length} ${nuevas.length === 1 ? 'monto' : 'montos'} de ${nombrePeriodo(periodo)}.` });
  }

  const totalCanal = ({ cliente, grupos }, canal) =>
    grupos.reduce((s, g) => s + (leerMonto(valores[clave(cliente.id, g.id, canal)]) || 0), 0);

  return (
    <section>
      <h1>Ventas</h1>
      <p className="ayuda">Total vendido en el mes, con IVA y sin costo de envío. Lo que cargues en {nombrePeriodo(periodo)} se cobra como comisión en {nombrePeriodo(periodoMas(periodo, 1))}.</p>
      <div className="panel parametros">
        <label>
          Mes de las ventas
          <input id="ventas-periodo" type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
        <button className="primario" onClick={guardar} disabled={!filas || !tablas.length}>Guardar ventas</button>
      </div>
      {mensaje && <div className={`alerta ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {clientes && tablas.length === 0 && (
        <div className="panel vacio">Ningún cliente cobra comisión sobre las ventas de {nombrePeriodo(periodo)}. Cuando un acuerdo tenga % de delivery o takeaway, aparece acá.</div>
      )}

      {tablas.map((t) => (
        <div className="panel" key={t.cliente.id}>
          <h2>{t.cliente.nombre}</h2>
          {t.grupos.length === 0 ? (
            <p className="ayuda">No tiene locales cargados. Editá el cliente y poné cuántos tiene para cargar sus ventas.</p>
          ) : (
            <div className="scroll-x">
              <table className="tabla editable ventas">
                <thead>
                  <tr>
                    <th>Locales</th>
                    {t.canales.map((k) => <th key={k} className="num">{k === 'delivery' ? 'Delivery' : 'Takeaway'}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.grupos.map((g) => (
                    <tr key={g.id}>
                      <td>{nombreGrupo(g)} <span className="etiqueta">({g.locales})</span></td>
                      {t.canales.map((k) => (
                        <td key={k}>
                          {g.tasas[k] == null ? (
                            <span className="etiqueta">No cobra</span>
                          ) : (
                            <input
                              id={`venta-${t.cliente.id}-${g.id}-${k}`}
                              className="num"
                              inputMode="decimal"
                              placeholder="Sin cargar"
                              value={valores[clave(t.cliente.id, g.id, k)] ?? ''}
                              onChange={(e) => setValores({ ...valores, [clave(t.cliente.id, g.id, k)]: e.target.value })}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {t.grupos.length > 1 && (
                  <tfoot>
                    <tr><td>Total</td>{t.canales.map((k) => <td key={k} className="num">{pesos(totalCanal(t, k))}</td>)}</tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
