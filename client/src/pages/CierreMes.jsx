import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { firmaCierre } from '../backend/repositorio.js';
import { mepEnFecha } from '../../../server/src/engine/cotizaciones.js';
import {
  pesos, numero, nombrePeriodo, periodoMas, periodoActual, leerMonto, hoyLocal, fechaCorta, diaSemana, fechaHora, porcentaje,
} from '../formato.js';
import Liquidacion from './Liquidacion.jsx';

export default function CierreMes({ onIrVentas, onIrCotizaciones }) {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), 1));
  const [fechaMep, setFechaMep] = useState(hoyLocal());
  const [mep, setMep] = useState('');
  const [mepEditado, setMepEditado] = useState(false);
  const [ipc, setIpc] = useState('');
  const [ipcEditado, setIpcEditado] = useState(false);
  const [cotizaciones, setCotizaciones] = useState(null);
  const [cierre, setCierre] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');
  const mesIpc = periodoMas(periodo, -2);

  useEffect(() => {
    api.cotizaciones().then(setCotizaciones).catch(() => setCotizaciones({ mep: { valores: {} }, ipc: { valores: {} } }));
  }, []);

  // Al cambiar de mes, trae el cierre guardado de ese mes (si hay) con el dólar que usó.
  useEffect(() => {
    let vigente = true;
    setCierre(null);
    setFechaMep(hoyLocal());
    setMepEditado(false);
    setIpcEditado(false);
    api.cierre(periodo).then((c) => {
      if (!vigente || !c) return;
      setCierre(c);
      if (c.fechaMep) setFechaMep(c.fechaMep);
      if (c.mep) {
        setMep(numero(c.mep));
        setMepEditado(true);
      }
    }).catch(() => {});
    return () => { vigente = false; };
  }, [periodo]);

  const cotizacionDelDia = cotizaciones ? mepEnFecha(cotizaciones.mep.valores, fechaMep) : null;
  const ipcSerie = cotizaciones?.ipc.valores[mesIpc];

  // Mientras no lo escriba a mano, el MEP sale de la serie para la fecha elegida.
  useEffect(() => {
    if (!mepEditado) setMep(cotizacionDelDia ? numero(cotizacionDelDia.valor) : '');
  }, [cotizacionDelDia?.valor, mepEditado]);

  useEffect(() => {
    if (!ipcEditado) setIpc(ipcSerie == null ? '' : porcentaje(ipcSerie, 4));
  }, [ipcSerie, ipcEditado]);

  function elegirFecha(f) {
    if (!f) return;
    setFechaMep(f);
    setMepEditado(false);
  }

  async function generar() {
    setError('');
    const valorMep = mep ? leerMonto(mep) : null;
    if (mep && !(valorMep > 0)) return setError('El dólar MEP tiene que ser un número, por ejemplo 1.549,80.');
    setOcupado('generar');
    try {
      if (ipc !== '') {
        const valorIpc = leerMonto(ipc);
        if (Number.isNaN(valorIpc)) throw new Error('El IPC tiene que ser un porcentaje, por ejemplo 2,1.');
        if (ipcSerie == null || Math.abs(valorIpc / 100 - ipcSerie) > 1e-9) {
          await api.guardarIpcManual(mesIpc, valorIpc / 100);
        }
      }
      // Un dólar cargado a mano para un día sin cotización queda en el historial.
      if (valorMep && cotizacionDelDia?.fecha !== fechaMep) await api.guardarMepManual(fechaMep, valorMep);
      setCotizaciones(await api.cotizaciones());
      setCierre(await api.liquidar({ periodo, mep: valorMep, fechaMep }));
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado('');
    }
  }

  async function confirmar() {
    setError('');
    setOcupado('confirmar');
    try {
      setCierre(await api.confirmarCierre(periodo));
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado('');
    }
  }

  const resultado = cierre?.resultados;
  const pagadores = resultado?.flatMap((r) => r.liquidaciones) ?? [];
  const total = pagadores.reduce((s, l) => s + l.totales.netoArs, 0);
  const avisos = resultado?.reduce((n, r) => n + r.avisos.length + (r.error ? 1 : 0), 0) ?? 0;
  const confirmadoAlDia = cierre?.confirmado && resultado && cierre.confirmado.firma === firmaCierre(resultado);

  let ayudaMep;
  if (!cotizaciones) ayudaMep = 'Buscando la cotización…';
  else if (mepEditado && cotizacionDelDia && leerMonto(mep) !== cotizacionDelDia.valor) {
    ayudaMep = `Cargado a mano. La serie dice ${numero(cotizacionDelDia.valor)} para el ${fechaCorta(cotizacionDelDia.fecha)}.`;
  } else if (cotizacionDelDia) {
    ayudaMep = cotizacionDelDia.fecha === fechaMep
      ? `MEP venta del ${diaSemana(fechaMep)} ${fechaCorta(fechaMep)}.`
      : `No hubo cotización ese día: uso la del ${diaSemana(cotizacionDelDia.fecha)} ${fechaCorta(cotizacionDelDia.fecha)}.`;
  } else ayudaMep = 'No hay cotización guardada para esa fecha. Cargala a mano y queda en el historial.';

  return (
    <section>
      <h1>Cierre del mes</h1>
      <p className="ayuda">
        El dólar y el IPC salen solos del <button className="link" onClick={onIrCotizaciones}>historial</button>. La comisión sale de las{' '}
        <button className="link" onClick={onIrVentas}>ventas de {nombrePeriodo(periodoMas(periodo, -1))}</button>.
      </p>
      <div className="panel parametros">
        <label>
          Mes a cobrar
          <input id="cierre-periodo" type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
        <label>
          Fecha del dólar
          <input id="cierre-fecha-mep" type="date" value={fechaMep} onChange={(e) => elegirFecha(e.target.value)} />
        </label>
        <label className="con-ayuda">
          Dólar MEP venta
          <input
            id="cierre-mep"
            inputMode="decimal"
            placeholder="1.549,80"
            value={mep}
            onChange={(e) => { setMep(e.target.value); setMepEditado(true); }}
          />
          <small>{ayudaMep}</small>
        </label>
        <label className="con-ayuda">
          IPC de {nombrePeriodo(mesIpc)} (%)
          <input
            id="cierre-ipc"
            inputMode="decimal"
            placeholder="Todavía sin publicar"
            value={ipc}
            onChange={(e) => { setIpc(e.target.value); setIpcEditado(true); }}
          />
          <small>
            {ipcSerie != null && !ipcEditado
              ? (cotizaciones.ipc.fuentes[mesIpc] === 'manual' ? 'Cargado a mano.' : 'Publicado por INDEC.')
              : ipcEditado ? 'Se guarda en el historial al generar.' : 'Solo hace falta para acuerdos en pesos.'}
          </small>
        </label>
        <button className="primario" onClick={generar} disabled={!!ocupado}>
          {ocupado === 'generar' ? 'Generando…' : cierre ? 'Volver a generar' : 'Generar liquidaciones'}
        </button>
      </div>
      {error && <div className="alerta error">{error}</div>}

      {resultado && (
        <>
          <p className="ayuda generado">
            Generado el {fechaHora(cierre.generadoEn)}
            {cierre.mep ? ` con MEP ${numero(cierre.mep)}${cierre.fechaMep ? ` del ${fechaCorta(cierre.fechaMep)}` : ''}` : ''}. Si cambiás un cliente o las ventas, volvé a generar.
          </p>
          <div className="resumen">
            <div><span className="etiqueta">Total a cobrar {nombrePeriodo(periodo)}</span><strong>{pesos(total)}</strong></div>
            <div><span className="etiqueta">Pagadores</span><strong>{pagadores.length}</strong></div>
            <div><span className="etiqueta">Para revisar</span><strong className={avisos ? 'naranja' : ''}>{avisos}</strong></div>
          </div>

          {pagadores.length > 0 && (
            <div className={`panel confirmacion ${confirmadoAlDia ? 'hecha' : ''}`}>
              {confirmadoAlDia ? (
                <p><strong>Ya está en las cuentas corrientes</strong> desde el {fechaHora(cierre.confirmado.en)}. Los pagos se marcan en Clientes.</p>
              ) : cierre.confirmado ? (
                <>
                  <p><strong>Este cierre cambió</strong> desde que lo pasaste a las cuentas corrientes el {fechaHora(cierre.confirmado.en)}.</p>
                  <button className="primario" onClick={confirmar} disabled={!!ocupado}>{ocupado === 'confirmar' ? 'Actualizando…' : 'Actualizar cuentas'}</button>
                </>
              ) : (
                <>
                  <p>Cuando esté bien, pasalo a las cuentas corrientes: queda registrado lo que debe cada uno y vence el día que tenga pactado (el 10 si no tiene otro).</p>
                  <button className="primario" onClick={confirmar} disabled={!!ocupado}>{ocupado === 'confirmar' ? 'Pasando…' : 'Pasar a cuentas corrientes'}</button>
                </>
              )}
            </div>
          )}

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
