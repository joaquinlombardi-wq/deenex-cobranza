import { useState } from 'react';
import { api } from '../api.js';
import { pesos, nombrePeriodo, periodoMas, periodoActual } from '../formato.js';
import Liquidacion from './Liquidacion.jsx';

export default function CierreMes() {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), 1));
  const [mep, setMep] = useState('');
  const [ipc, setIpc] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const mesIpc = periodoMas(periodo, -2);

  async function generar() {
    setError('');
    try {
      const ipcMap = ipc === '' ? {} : { [mesIpc]: Number(ipc.replace(',', '.')) / 100 };
      setResultado(await api.liquidar({ periodo, mep: Number(mep.replace(/\./g, '').replace(',', '.')), ipc: ipcMap }));
    } catch (e) {
      setError(e.message);
    }
  }

  const pagadores = resultado?.flatMap((r) => r.liquidaciones) ?? [];
  const total = pagadores.reduce((s, l) => s + l.totales.netoArs, 0);
  const avisos = resultado?.reduce((n, r) => n + r.avisos.length + (r.error ? 1 : 0), 0) ?? 0;

  return (
    <section>
      <h1>Cierre del mes</h1>
      <p className="ayuda">Cargá el dólar del día y generá lo que tiene que pagar cada cliente. La comisión se calcula sobre las ventas de {nombrePeriodo(periodoMas(periodo, -1))}.</p>
      <div className="panel parametros">
        <label>
          Mes a cobrar
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <label>
          Dólar MEP venta del día (dolarhoy)
          <input inputMode="decimal" placeholder="1.549,80" value={mep} onChange={(e) => setMep(e.target.value)} />
        </label>
        <label>
          IPC de {nombrePeriodo(mesIpc)} (%)
          <input inputMode="decimal" placeholder="2,1" value={ipc} onChange={(e) => setIpc(e.target.value)} />
        </label>
        <button className="primario" onClick={generar}>Generar liquidaciones</button>
      </div>
      {error && <div className="alerta error">{error}</div>}

      {resultado && (
        <>
          <div className="resumen">
            <div><span className="etiqueta">Total a cobrar {nombrePeriodo(periodo)}</span><strong>{pesos(total)}</strong></div>
            <div><span className="etiqueta">Pagadores</span><strong>{pagadores.length}</strong></div>
            <div><span className="etiqueta">Para revisar</span><strong className={avisos ? 'naranja' : ''}>{avisos}</strong></div>
          </div>
          {resultado.map((r) => (
            <div className="panel cliente" key={r.cliente.id}>
              <div className="cabecera-cliente">
                <h2>{r.cliente.nombre}</h2>
                <span className="monto">{pesos(r.liquidaciones.reduce((s, l) => s + l.totales.netoArs, 0))}</span>
              </div>
              {r.error && <div className="alerta error">{r.error}</div>}
              {r.avisos.map((a, i) => <div className="alerta aviso" key={i}>{a}</div>)}
              {r.liquidaciones.map((l) => <Liquidacion key={l.pagador.id} liquidacion={l} />)}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
