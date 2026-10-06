import { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { api } from '../api.js';
import { acuerdoVigente } from '../../../server/src/engine/liquidar.js';
import { gruposDeVentas, localesEn } from '../../../server/src/engine/clientes.js';
import { nombrePeriodo, periodoMas, pesos, porcentaje, leerMonto } from '../formato.js';

const CANALES = ['delivery', 'takeaway'];
const clave = (clienteId, grupo, canal) => `${clienteId}|${grupo}|${canal}`;
const formato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const nombreGrupo = (g) => ({ propios: 'Locales propios', franquiciados: 'Locales franquiciados', todos: 'Todos los locales' })[g.id] ?? g.nombre;
const tasaTexto = (g, k) => `${porcentaje(g.tasas[k], 4)}%`;

// Ventas del mes anterior de los clientes que cobran comisión, dentro del cierre: total con IVA y
// sin envío por grupo de locales y canal. Hasta que los devs conecten la plataforma se cargan acá.
// El cierre llama a `guardar()` antes de generar.
export default function VentasComision({ periodo, ref }) {
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

  // Clientes que cobran comisión sobre las ventas de este mes, con los grupos de locales que tenían.
  const tablas = useMemo(() => (clientes ?? []).flatMap((c) => {
    const acuerdo = acuerdoVigente(c, periodo);
    if (!CANALES.some((k) => acuerdo?.comision?.[k] != null)) return [];
    const grupos = gruposDeVentas(localesEn(c, periodo), acuerdo);
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
          if (v != null) nuevos[clave(cliente.id, g.id, k)] = formato.format(v);
        }
      }
    }
    setValores(nuevos);
  }, [filas, tablas]);

  // Guarda lo que hay en pantalla. Devuelve { error } si algún monto no se entiende.
  async function guardar() {
    if (!filas || !tablas.length) return {};
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
          if (Number.isNaN(total) || total < 0) {
            const error = `Las ventas de ${cliente.nombre} ("${v}") no son un número. Escribilas así: 1.244.000,50.`;
            setMensaje({ tipo: 'error', texto: error });
            return { error };
          }
          nuevas.push({ cliente_id: cliente.id, grupo: g.id, periodo, canal: k, total_con_iva: total });
        }
      }
    }
    // Se conservan las filas que esta pantalla no muestra (otros clientes o grupos).
    const todas = [...filas.filter((f) => !reemplaza.has(clave(f.cliente_id, f.grupo, f.canal))), ...nuevas];
    if (JSON.stringify(todas) === JSON.stringify(filas)) return {};
    try {
      await api.guardarVentas(periodo, todas);
    } catch (e) {
      const error = `No pude guardar las ventas: ${e.message}`;
      setMensaje({ tipo: 'error', texto: error });
      return { error };
    }
    setFilas(todas);
    setMensaje({ tipo: 'ok', texto: `Guardé las ventas de ${nombrePeriodo(periodo)}.` });
    return {};
  }

  useImperativeHandle(ref, () => ({ guardar }));

  if (!clientes || !tablas.length) return null;

  const totalCanal = ({ cliente, grupos }, canal) =>
    grupos.reduce((s, g) => s + (leerMonto(valores[clave(cliente.id, g.id, canal)]) || 0), 0);

  return (
    <div className="panel ventas-comision">
      <h2>Ventas de {nombrePeriodo(periodo)} para la comisión</h2>
      <p className="ayuda sin-margen">
        Lo que vendió cada cliente en {nombrePeriodo(periodo)}, con IVA y sin envío. La comisión se cobra en {nombrePeriodo(periodoMas(periodo, 1))}
        {' '}y se guarda al generar las liquidaciones.
      </p>
      {tablas.map((t) => (
        <div className="ventas-cliente" key={t.cliente.id}>
          <h3>{t.cliente.nombre}</h3>
          {t.grupos.length === 0 ? (
            <p className="ayuda">No tiene locales en {nombrePeriodo(periodo)}. Cargá cuántos tiene en su cuenta para pedir sus ventas.</p>
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
                            <label className="venta">
                              <input
                                id={`venta-${t.cliente.id}-${g.id}-${k}`}
                                className="num"
                                inputMode="decimal"
                                placeholder="Sin cargar"
                                aria-label={`Ventas de ${k} de ${nombreGrupo(g)} de ${t.cliente.nombre}`}
                                value={valores[clave(t.cliente.id, g.id, k)] ?? ''}
                                onChange={(e) => setValores({ ...valores, [clave(t.cliente.id, g.id, k)]: e.target.value })}
                              />
                              <small>Cobra {tasaTexto(g, k)}</small>
                            </label>
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
      <div className="botones">
        <button className="secundario" onClick={guardar} disabled={!filas}>Guardar ventas</button>
      </div>
      {mensaje && <div className={`alerta ${mensaje.tipo}`}>{mensaje.texto}</div>}
    </div>
  );
}
