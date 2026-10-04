import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { acuerdoVigente } from '../../../server/src/engine/liquidar.js';
import { diasActivos } from '../../../server/src/engine/periodos.js';
import { nombrePeriodo, periodoMas, periodoActual, pesos, leerMonto } from '../formato.js';

const CANALES = ['delivery', 'takeaway'];
const clave = (localId, canal) => `${localId}|${canal}`;

// Ventas del mes por local y canal (con IVA, sin envío). Hasta que los devs conecten la
// plataforma se cargan acá, a mano o pegando un CSV.
export default function Ventas() {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), -1));
  const [clientes, setClientes] = useState(null);
  const [valores, setValores] = useState({});
  const [csv, setCsv] = useState('');
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => { api.clientes().then(setClientes); }, []);

  useEffect(() => {
    let vigente = true;
    setMensaje(null);
    api.ventas(periodo).then((filas) => {
      if (!vigente) return;
      setValores(Object.fromEntries(filas.map((f) => [clave(f.local_id, f.canal), String(f.total_con_iva).replace('.', ',')])));
    });
    return () => { vigente = false; };
  }, [periodo]);

  // Locales que cobran comisión en este mes, agrupados por cliente.
  const grupos = useMemo(() => (clientes ?? []).flatMap((c) => {
    const comision = acuerdoVigente(c, periodo)?.comision;
    const canales = CANALES.filter((k) => comision?.[k] != null);
    if (!canales.length) return [];
    const locales = c.locales.filter((l) => diasActivos(l, periodo) > 0).map((l) => ({ ...l, idVentas: l.plataformaId ?? l.id }));
    return locales.length ? [{ cliente: c, canales, locales }] : [];
  }), [clientes, periodo]);

  function pegarCsv() {
    const nuevos = { ...valores };
    let leidas = 0;
    const errores = [];
    csv.split(/\r?\n/).forEach((linea, i) => {
      const partes = linea.split(/[;\t,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim().replace(/^"|"$/g, ''));
      if (partes.length < 3 || !partes[0] || /local/i.test(partes[0])) return;
      const [localId, canal, total] = partes;
      const monto = leerMonto(total);
      if (!CANALES.includes(canal.toLowerCase()) || Number.isNaN(monto)) return errores.push(i + 1);
      nuevos[clave(localId, canal.toLowerCase())] = String(monto).replace('.', ',');
      leidas += 1;
    });
    setValores(nuevos);
    setMensaje({ tipo: errores.length ? 'aviso' : 'ok', texto: `Leí ${leidas} filas.${errores.length ? ` No entendí las líneas ${errores.join(', ')}.` : ''} Revisá y guardá.` });
  }

  async function guardar() {
    const filas = [];
    for (const [k, v] of Object.entries(valores)) {
      if (v === '') continue;
      const monto = leerMonto(v);
      const [local_id, canal] = k.split('|');
      if (Number.isNaN(monto)) return setMensaje({ tipo: 'error', texto: `El monto "${v}" no es un número.` });
      filas.push({ local_id, periodo, canal, total_con_iva: monto });
    }
    await api.guardarVentas(periodo, filas);
    setMensaje({ tipo: 'ok', texto: `Guardé ${filas.length} montos de ${nombrePeriodo(periodo)}.` });
  }

  const totalCanal = (g, canal) => g.locales.reduce((s, l) => s + (leerMonto(valores[clave(l.idVentas, canal)]) || 0), 0);

  return (
    <section>
      <h1>Ventas</h1>
      <p className="ayuda">Total vendido por local y canal, con IVA y sin costo de envío. Lo que cargues en {nombrePeriodo(periodo)} se cobra como comisión en {nombrePeriodo(periodoMas(periodo, 1))}.</p>
      <div className="panel parametros">
        <label>
          Mes de las ventas
          <input id="ventas-periodo" type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
        <button className="primario" onClick={guardar}>Guardar ventas</button>
      </div>
      {mensaje && <div className={`alerta ${mensaje.tipo === 'ok' ? 'ok' : mensaje.tipo}`}>{mensaje.texto}</div>}

      {clientes && grupos.length === 0 && (
        <div className="panel vacio">Ningún cliente cobra comisión en {nombrePeriodo(periodo)}. Cuando un acuerdo tenga % de delivery o takeaway, sus locales aparecen acá.</div>
      )}

      {grupos.map((g) => (
        <div className="panel" key={g.cliente.id}>
          <h2>{g.cliente.nombre}</h2>
          <div className="scroll-x">
            <table className="tabla editable ventas">
              <thead>
                <tr><th>Local</th><th>Id en la plataforma</th>{g.canales.map((k) => <th key={k} className="num">{k === 'delivery' ? 'Delivery' : 'Takeaway'}</th>)}</tr>
              </thead>
              <tbody>
                {g.locales.map((l) => (
                  <tr key={l.id}>
                    <td>{l.nombre}</td>
                    <td className="cuit">{l.idVentas}</td>
                    {g.canales.map((k) => (
                      <td key={k}>
                        <input
                          id={`venta-${l.idVentas}-${k}`}
                          className="num"
                          inputMode="decimal"
                          placeholder="Sin cargar"
                          value={valores[clave(l.idVentas, k)] ?? ''}
                          onChange={(e) => setValores({ ...valores, [clave(l.idVentas, k)]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2}>Total</td>{g.canales.map((k) => <td key={k} className="num">{pesos(totalCanal(g, k))}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      <details className="panel">
        <summary>Pegar ventas desde un CSV o Excel</summary>
        <p className="ayuda">Una fila por local y canal: <code>id_local, canal, total</code>. El canal es <code>delivery</code> o <code>takeaway</code>. Sirve copiar las columnas desde Excel.</p>
        <textarea id="ventas-csv" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'quem-palermo, delivery, 1.244.000\nquem-palermo, takeaway, 380.500'} />
        <button className="secundario" onClick={pegarCsv} disabled={!csv.trim()}>Leer filas</button>
      </details>
    </section>
  );
}
