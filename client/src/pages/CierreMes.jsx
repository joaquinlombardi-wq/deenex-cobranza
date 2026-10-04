import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { pesos, numero, nombrePeriodo, periodoMas, periodoActual, leerMonto } from '../formato.js';
import Liquidacion from './Liquidacion.jsx';

const fechaHora = (iso) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export default function CierreMes({ onIrVentas }) {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), 1));
  const [mep, setMep] = useState('');
  const [ipc, setIpc] = useState('');
  const [serieIpc, setSerieIpc] = useState({});
  const [cierre, setCierre] = useState(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const mesIpc = periodoMas(periodo, -2);

  useEffect(() => {
    api.ipc().then(setSerieIpc).catch(() => {});
  }, []);

  // Al cambiar de mes, muestra el último cierre guardado de ese mes (si hay).
  useEffect(() => {
    let vigente = true;
    setCierre(null);
    api.cierre(periodo).then((c) => {
      if (!vigente || !c) return;
      setCierre(c);
      setMep(c.mep ? numero(c.mep) : '');
    }).catch(() => {});
    return () => { vigente = false; };
  }, [periodo]);

  useEffect(() => {
    const v = serieIpc[mesIpc];
    setIpc(v == null ? '' : String(+(v * 100).toFixed(4)).replace('.', ','));
  }, [mesIpc, serieIpc]);

  async function generar() {
    setError('');
    const valorMep = leerMonto(mep);
    if (mep && !(valorMep > 0)) return setError('El dólar MEP tiene que ser un número, por ejemplo 1.549,80.');
    setGenerando(true);
    try {
      let serie = serieIpc;
      if (ipc !== '') {
        const valorIpc = leerMonto(ipc);
        if (Number.isNaN(valorIpc)) throw new Error('El IPC tiene que ser un porcentaje, por ejemplo 2,1.');
        serie = { ...serieIpc, [mesIpc]: valorIpc / 100 };
        if (serie[mesIpc] !== serieIpc[mesIpc]) {
          await api.guardarIpc(serie);
          setSerieIpc(serie);
        }
      }
      const resultados = await api.liquidar({ periodo, mep: valorMep || null, ipc: serie });
      setCierre({ periodo, mep: valorMep, generadoEn: new Date().toISOString(), resultados });
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerando(false);
    }
  }

  const resultado = cierre?.resultados;
  const pagadores = resultado?.flatMap((r) => r.liquidaciones) ?? [];
  const total = pagadores.reduce((s, l) => s + l.totales.netoArs, 0);
  const avisos = resultado?.reduce((n, r) => n + r.avisos.length + (r.error ? 1 : 0), 0) ?? 0;

  return (
    <section>
      <h1>Cierre del mes</h1>
      <p className="ayuda">
        Cargá el dólar del día y generá lo que tiene que pagar cada cliente. La comisión sale de las{' '}
        <button className="link" onClick={onIrVentas}>ventas de {nombrePeriodo(periodoMas(periodo, -1))}</button>.
      </p>
      <div className="panel parametros">
        <label>
          Mes a cobrar
          <input id="cierre-periodo" type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
        <label>
          Dólar MEP venta del día (dolarhoy)
          <input id="cierre-mep" inputMode="decimal" placeholder="1.549,80" value={mep} onChange={(e) => setMep(e.target.value)} />
        </label>
        <label>
          IPC de {nombrePeriodo(mesIpc)} (%)
          <input id="cierre-ipc" inputMode="decimal" placeholder="Solo para acuerdos en pesos" value={ipc} onChange={(e) => setIpc(e.target.value)} />
        </label>
        <button className="primario" onClick={generar} disabled={generando}>
          {generando ? 'Generando…' : cierre ? 'Volver a generar' : 'Generar liquidaciones'}
        </button>
      </div>
      {error && <div className="alerta error">{error}</div>}

      {resultado && (
        <>
          <p className="ayuda generado">
            Generado el {fechaHora(cierre.generadoEn)}{cierre.mep ? ` con MEP ${numero(cierre.mep)}` : ''}. Si cambiás un cliente o las ventas, volvé a generar.
          </p>
          <div className="resumen">
            <div><span className="etiqueta">Total a cobrar {nombrePeriodo(periodo)}</span><strong>{pesos(total)}</strong></div>
            <div><span className="etiqueta">Pagadores</span><strong>{pagadores.length}</strong></div>
            <div><span className="etiqueta">Para revisar</span><strong className={avisos ? 'naranja' : ''}>{avisos}</strong></div>
          </div>
          {resultado.length === 0 && <div className="panel vacio">Todavía no hay clientes cargados. Arrancá por la pestaña Clientes.</div>}
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
