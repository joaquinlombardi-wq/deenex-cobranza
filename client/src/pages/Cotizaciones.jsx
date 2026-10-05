import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { mepEnFecha, ultimos } from '../../../server/src/engine/cotizaciones.js';
import { numero, nombrePeriodo, hoyLocal, periodoActual, periodoMas, fechaCorta, diaSemana, fechaHora, porcentaje, leerMonto } from '../formato.js';

function Origen({ fuente }) {
  return <span className={`origen ${fuente}`}>{fuente === 'manual' ? 'A mano' : 'Automático'}</span>;
}

// Variación acumulada de los últimos 12 meses publicados.
function acumulado12(valores) {
  const meses = Object.keys(valores).sort().slice(-12);
  if (meses.length < 12) return null;
  return { desde: meses[0], hasta: meses.at(-1), valor: meses.reduce((f, m) => f * (1 + valores[m]), 1) - 1 };
}

export default function Cotizaciones() {
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState(hoyLocal());
  const [nuevoMep, setNuevoMep] = useState({ fecha: hoyLocal(), valor: '' });
  const [nuevoIpc, setNuevoIpc] = useState({ mes: periodoMas(periodoActual(), -1), valor: '' });
  const [mensaje, setMensaje] = useState(null);

  const cargar = () => api.cotizaciones().then(setDatos);
  useEffect(() => { cargar(); }, []);

  async function guardarMep(e) {
    e.preventDefault();
    const valor = leerMonto(nuevoMep.valor);
    if (!(valor > 0) || !nuevoMep.fecha) return setMensaje({ tipo: 'error', texto: 'Poné la fecha y el valor, por ejemplo 1.549,80.' });
    await api.guardarMepManual(nuevoMep.fecha, valor);
    setNuevoMep({ ...nuevoMep, valor: '' });
    setMensaje({ tipo: 'ok', texto: `Guardé el MEP del ${fechaCorta(nuevoMep.fecha)}.` });
    cargar();
  }

  async function guardarIpc(e) {
    e.preventDefault();
    const valor = leerMonto(nuevoIpc.valor);
    if (Number.isNaN(valor) || !nuevoIpc.mes) return setMensaje({ tipo: 'error', texto: 'Poné el mes y el porcentaje, por ejemplo 2,1.' });
    await api.guardarIpcManual(nuevoIpc.mes, valor / 100);
    setNuevoIpc({ ...nuevoIpc, valor: '' });
    setMensaje({ tipo: 'ok', texto: `Guardé el IPC de ${nombrePeriodo(nuevoIpc.mes)}.` });
    cargar();
  }

  async function quitar(tipo, clave) {
    await (tipo === 'mep' ? api.guardarMepManual(clave, null) : api.guardarIpcManual(clave, null));
    cargar();
  }

  if (!datos) return <section><h1>Dólar e IPC</h1><p className="ayuda">Cargando…</p></section>;

  const { mep, ipc } = datos;
  const encontrado = mepEnFecha(mep.valores, buscar);
  const tieneAutomatico = Boolean(mep.actualizado);
  const acumulado = acumulado12(ipc.valores);

  return (
    <section>
      <h1>Dólar e IPC</h1>
      <p className="ayuda">El cierre del mes toma de acá el dólar MEP venta de la fecha que elijas y el IPC para los acuerdos en pesos.</p>
      {tieneAutomatico ? (
        <div className="alerta ok">
          El historial se actualiza solo cada día hábil. Última actualización: {fechaHora(mep.actualizado)}. Fuente: {mep.fuente}.
        </div>
      ) : (
        <div className="alerta aviso">
          Todavía no llegó la actualización automática, así que por ahora el historial tiene solo lo que cargaste a mano.
        </div>
      )}
      {mensaje && <div className={`alerta ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="dos-columnas">
        <div className="panel">
          <h2>Dólar MEP venta</h2>
          <div className="parametros compacto">
            <label>
              Buscar fecha
              <input id="buscar-mep" type="date" value={buscar} onChange={(e) => e.target.value && setBuscar(e.target.value)} />
            </label>
            <div className="dato">
              {encontrado ? (
                <>
                  <strong>{numero(encontrado.valor)}</strong>
                  <span className="cuit">
                    {encontrado.fecha === buscar ? `${diaSemana(buscar)} ${fechaCorta(buscar)}` : `sin cotización ese día, la del ${diaSemana(encontrado.fecha)} ${fechaCorta(encontrado.fecha)}`}
                  </span>
                </>
              ) : (
                <span className="cuit">No hay cotización guardada para esa fecha.</span>
              )}
            </div>
          </div>

          <table className="tabla serie">
            <thead><tr><th>Fecha</th><th className="num">Venta</th><th>Origen</th><th /></tr></thead>
            <tbody>
              {ultimos(mep.valores, 20).map(({ clave, valor }) => (
                <tr key={clave}>
                  <td>{diaSemana(clave)} {fechaCorta(clave)}</td>
                  <td className="num">{numero(valor)}</td>
                  <td><Origen fuente={mep.fuentes[clave]} /></td>
                  <td>{mep.fuentes[clave] === 'manual' && <button className="link peligro" onClick={() => quitar('mep', clave)}>Quitar</button>}</td>
                </tr>
              ))}
              {!Object.keys(mep.valores).length && <tr><td colSpan={4} className="cuit">Sin cotizaciones todavía.</td></tr>}
            </tbody>
          </table>

          <form className="form-linea" onSubmit={guardarMep}>
            <label>Fecha<input id="mep-manual-fecha" type="date" value={nuevoMep.fecha} onChange={(e) => setNuevoMep({ ...nuevoMep, fecha: e.target.value })} /></label>
            <label>Venta<input id="mep-manual-valor" inputMode="decimal" placeholder="1.549,80" value={nuevoMep.valor} onChange={(e) => setNuevoMep({ ...nuevoMep, valor: e.target.value })} /></label>
            <button className="secundario" type="submit">Cargar a mano</button>
          </form>
        </div>

        <div className="panel">
          <h2>IPC mensual (INDEC)</h2>
          {acumulado && (
            <p className="dato">
              <strong>{porcentaje(acumulado.valor, 1)}%</strong>
              <span className="cuit">acumulado de {nombrePeriodo(acumulado.desde)} a {nombrePeriodo(acumulado.hasta)}</span>
            </p>
          )}
          <table className="tabla serie">
            <thead><tr><th>Mes</th><th className="num">IPC</th><th>Origen</th><th /></tr></thead>
            <tbody>
              {ultimos(ipc.valores, 18).map(({ clave, valor }) => (
                <tr key={clave}>
                  <td>{nombrePeriodo(clave)}</td>
                  <td className="num">{porcentaje(valor, 2)}%</td>
                  <td><Origen fuente={ipc.fuentes[clave]} /></td>
                  <td>{ipc.fuentes[clave] === 'manual' && <button className="link peligro" onClick={() => quitar('ipc', clave)}>Quitar</button>}</td>
                </tr>
              ))}
              {!Object.keys(ipc.valores).length && <tr><td colSpan={4} className="cuit">Sin datos de IPC todavía.</td></tr>}
            </tbody>
          </table>
          <form className="form-linea" onSubmit={guardarIpc}>
            <label>Mes<input id="ipc-manual-mes" type="month" value={nuevoIpc.mes} onChange={(e) => setNuevoIpc({ ...nuevoIpc, mes: e.target.value })} /></label>
            <label>IPC (%)<input id="ipc-manual-valor" inputMode="decimal" placeholder="2,1" value={nuevoIpc.valor} onChange={(e) => setNuevoIpc({ ...nuevoIpc, valor: e.target.value })} /></label>
            <button className="secundario" type="submit">Cargar a mano</button>
          </form>
        </div>
      </div>
    </section>
  );
}
