import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { mepEnFecha, ultimos, actualizarPorIpc } from '../../../server/src/engine/cotizaciones.js';
import {
  numero, pesos, nombrePeriodo, hoyLocal, periodoActual, periodoMas, fechaCorta, diaSemana, fechaHora, porcentaje, leerMonto,
} from '../formato.js';

// Páginas públicas con el historial completo, para copiar y pegar en el importador.
const PAGINAS = {
  ipc: 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion',
  mep: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa',
};
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const entero = (n) => n.toLocaleString('es-AR');

function Origen({ fuente, origen }) {
  if (fuente === 'manual') return <span className="origen manual">A mano</span>;
  return <span className="origen">{origen === 'importado' ? 'Importado' : 'Automático'}</span>;
}

// Variación acumulada de los últimos 12 meses publicados.
function acumulado12(valores) {
  const hasta = Object.keys(valores).sort().at(-1);
  if (!hasta) return null;
  const r = actualizarPorIpc(1, valores, periodoMas(hasta, -12), hasta);
  return r.faltan.length ? null : { desde: periodoMas(hasta, -11), hasta, valor: r.variacion };
}

function Importador({ tipo, onListo, onCancelar }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function importar(e) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      onListo(await api.importarSerie(tipo, texto));
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="importador" onSubmit={importar}>
      <ol>
        <li>
          Abrí <a href={PAGINAS[tipo]} target="_blank" rel="noopener noreferrer">esta página</a> en otra pestaña
          {' '}(si no abre, copiá <code>{PAGINAS[tipo]}</code> en la barra del navegador).
        </li>
        <li>Seleccioná todo con Ctrl+A (Cmd+A en Mac) y copialo con Ctrl+C.</li>
        <li>Pegalo acá abajo y tocá Importar.</li>
      </ol>
      <textarea
        id={`importar-${tipo}`}
        rows={5}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={tipo === 'ipc' ? '[{"fecha":"1943-03-31","valor":1.6}, …' : '[{"casa":"bolsa","compra":…,"venta":…,"fecha":"…"}, …'}
      />
      <p className="cuit">También sirve pegar dos columnas de un Excel: {tipo === 'ipc' ? 'mes y porcentaje' : 'fecha y venta'}.</p>
      <div className="botones">
        <button type="submit" className="primario" disabled={ocupado || !texto.trim()}>{ocupado ? 'Importando…' : 'Importar'}</button>
        <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <div className="alerta error">{error}</div>}
    </form>
  );
}

// Toda la serie de IPC, un año por fila, con la inflación de diciembre a diciembre.
function SerieAnual({ valores, fuentes }) {
  const anios = [...new Set(Object.keys(valores).map((k) => k.slice(0, 4)))].sort().reverse();
  return (
    <>
      <div className="scroll-x">
        <table className="tabla anual">
          <thead>
            <tr><th>Año</th>{MESES_CORTOS.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Año</th></tr>
          </thead>
          <tbody>
            {anios.map((anio) => {
              const anual = actualizarPorIpc(1, valores, `${+anio - 1}-12`, `${anio}-12`);
              return (
                <tr key={anio}>
                  <td>{anio}</td>
                  {MESES_CORTOS.map((_, i) => {
                    const mes = `${anio}-${String(i + 1).padStart(2, '0')}`;
                    return <td key={mes} className={`num${fuentes[mes] === 'manual' ? ' manual' : ''}`}>{porcentaje(valores[mes], 2)}</td>;
                  })}
                  <td className="num total-anio">{porcentaje(anual.variacion, 1)}{anual.faltan.length > 0 && '*'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cuit">En %. La última columna es la inflación del año, de diciembre a diciembre. Con * el año no está completo. En naranja, lo cargado a mano.</p>
    </>
  );
}

function Calculadora({ valores }) {
  const ultimo = Object.keys(valores).sort().at(-1) ?? periodoMas(periodoActual(), -2);
  const [monto, setMonto] = useState('');
  const [desde, setDesde] = useState(periodoMas(ultimo, -12));
  const [hasta, setHasta] = useState(ultimo);
  const valor = leerMonto(monto);
  const r = valor > 0 && desde && hasta && desde < hasta ? actualizarPorIpc(valor, valores, desde, hasta) : null;
  const faltan = r?.faltan ?? [];

  return (
    <div className="panel">
      <h2>Actualizar un monto por IPC</h2>
      <p className="ayuda sin-margen">Lleva un monto del mes en que se pactó al mes que elijas, con el IPC de cada mes del medio.</p>
      <div className="form-linea">
        <label>Monto ($)<input id="calc-monto" inputMode="decimal" placeholder="500.000" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
        <label>Pactado en<input id="calc-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Llevar a<input id="calc-hasta" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      {desde && hasta && desde >= hasta && <p className="cuit">El mes al que lo llevás tiene que ser posterior al pactado.</p>}
      {r && (
        <div className="resultado-calc">
          <div className="dato">
            <strong>{pesos(r.monto)}</strong>
            <span className="cuit">a {nombrePeriodo(hasta)}</span>
          </div>
          <p>
            Inflación de {nombrePeriodo(periodoMas(desde, 1))} a {nombrePeriodo(hasta)}: <strong>{porcentaje(r.variacion, 1)}%</strong>
            {' '}({r.meses === 1 ? 'un mes' : `${entero(r.meses)} meses`}, el monto se multiplica por {r.factor.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}).
          </p>
          {faltan.length > 0 && (
            <div className="alerta aviso">
              {faltan.length <= 4
                ? `Faltan los IPC de ${faltan.map(nombrePeriodo).join(', ')}, así que no están en la cuenta.`
                : `Faltan ${entero(faltan.length)} meses de IPC (desde ${nombrePeriodo(faltan[0])}), así que no están en la cuenta.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Cotizaciones() {
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState(hoyLocal());
  const [nuevoMep, setNuevoMep] = useState({ fecha: hoyLocal(), valor: '' });
  const [nuevoIpc, setNuevoIpc] = useState({ mes: periodoMas(periodoActual(), -1), valor: '' });
  const [importando, setImportando] = useState(null);
  const [verSerie, setVerSerie] = useState(false);
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

  function importado(tipo, r) {
    setImportando(null);
    const rango = tipo === 'ipc'
      ? `${entero(r.cantidad)} meses de IPC, de ${nombrePeriodo(r.desde)} a ${nombrePeriodo(r.hasta)}`
      : `${entero(r.cantidad)} días de dólar MEP, del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`;
    const salteadas = r.descartadas.length
      ? ` Salteé ${r.descartadas.length === 1 ? 'un renglón que no entendí' : `${entero(r.descartadas.length)} renglones que no entendí`}: «${r.descartadas[0].slice(0, 60)}».`
      : '';
    setMensaje({ tipo: 'ok', texto: `Importé ${rango}.${salteadas}` });
    cargar();
  }

  if (!datos) return <section><h1>Dólar e IPC</h1><p className="ayuda">Cargando…</p></section>;

  const { mep, ipc } = datos;
  const encontrado = mepEnFecha(mep.valores, buscar);
  const automatico = [mep, ipc].find((s) => s.origen === 'automatico');
  const acumulado = acumulado12(ipc.valores);
  const diasMep = Object.keys(mep.valores).sort();
  const mesesIpc = Object.keys(ipc.valores).sort();

  return (
    <section>
      <h1>Dólar e IPC</h1>
      <p className="ayuda">El cierre del mes toma de acá el dólar MEP venta de la fecha que elijas y el IPC para los acuerdos en pesos.</p>
      {automatico ? (
        <div className="alerta ok">
          El historial se actualiza solo cada día hábil. Última actualización: {fechaHora(automatico.actualizado)}. Fuente: {automatico.fuente}.
        </div>
      ) : (
        <div className="alerta aviso">
          La actualización automática todavía no está activa. Mientras tanto podés traer el historial completo con "Importar historial" y cargar a mano lo que falte.
        </div>
      )}
      {mensaje && <div className={`alerta ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="dos-columnas">
        <div className="panel">
          <h2>Dólar MEP venta</h2>
          <p className="cuit rango">
            {diasMep.length
              ? `Historial del ${fechaCorta(diasMep[0])} al ${fechaCorta(diasMep.at(-1))} (${entero(diasMep.length)} días)`
              : 'Todavía sin historial.'}
            {mep.origen === 'importado' && ` · importado el ${fechaHora(mep.actualizado)}`}
          </p>
          {importando === 'mep' ? (
            <Importador tipo="mep" onListo={(r) => importado('mep', r)} onCancelar={() => setImportando(null)} />
          ) : (
            <button className="link" onClick={() => setImportando('mep')}>Importar historial</button>
          )}
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
                  <td><Origen fuente={mep.fuentes[clave]} origen={mep.origen} /></td>
                  <td>{mep.fuentes[clave] === 'manual' && <button className="link peligro" onClick={() => quitar('mep', clave)}>Quitar</button>}</td>
                </tr>
              ))}
              {!diasMep.length && <tr><td colSpan={4} className="cuit">Sin cotizaciones todavía.</td></tr>}
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
          <p className="cuit rango">
            {mesesIpc.length
              ? `Serie de ${nombrePeriodo(mesesIpc[0])} a ${nombrePeriodo(mesesIpc.at(-1))} (${entero(mesesIpc.length)} meses)`
              : 'Todavía sin datos.'}
            {ipc.origen === 'importado' && ` · importada el ${fechaHora(ipc.actualizado)}`}
          </p>
          {importando === 'ipc' ? (
            <Importador tipo="ipc" onListo={(r) => importado('ipc', r)} onCancelar={() => setImportando(null)} />
          ) : (
            <div className="acciones-serie">
              <button className="link" onClick={() => setImportando('ipc')}>Importar historial</button>
              {mesesIpc.length > 0 && <button className="link" onClick={() => setVerSerie(!verSerie)}>{verSerie ? 'Ocultar la serie completa' : 'Ver la serie completa'}</button>}
            </div>
          )}
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
                  <td><Origen fuente={ipc.fuentes[clave]} origen={ipc.origen} /></td>
                  <td>{ipc.fuentes[clave] === 'manual' && <button className="link peligro" onClick={() => quitar('ipc', clave)}>Quitar</button>}</td>
                </tr>
              ))}
              {!mesesIpc.length && <tr><td colSpan={4} className="cuit">Sin datos de IPC todavía.</td></tr>}
            </tbody>
          </table>
          <form className="form-linea" onSubmit={guardarIpc}>
            <label>Mes<input id="ipc-manual-mes" type="month" value={nuevoIpc.mes} onChange={(e) => setNuevoIpc({ ...nuevoIpc, mes: e.target.value })} /></label>
            <label>IPC (%)<input id="ipc-manual-valor" inputMode="decimal" placeholder="2,1" value={nuevoIpc.valor} onChange={(e) => setNuevoIpc({ ...nuevoIpc, valor: e.target.value })} /></label>
            <button className="secundario" type="submit">Cargar a mano</button>
          </form>
        </div>
      </div>

      {verSerie && mesesIpc.length > 0 && (
        <div className="panel">
          <h2>IPC: serie completa</h2>
          <SerieAnual valores={ipc.valores} fuentes={ipc.fuentes} />
        </div>
      )}

      <Calculadora key={mesesIpc.at(-1) ?? 'vacia'} valores={ipc.valores} />
    </section>
  );
}
