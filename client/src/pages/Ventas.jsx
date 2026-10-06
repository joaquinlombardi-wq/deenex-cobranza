import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIAS } from '../../../server/src/engine/facturacion.js';
import { leerDetallePegado, facturasDe, sugerirCliente, asignarClientes } from '../../../server/src/facturacion/importarDetalle.js';
import { nombrePeriodo, periodoMas, periodoActual, numero, pesos, leerMonto } from '../formato.js';

// Ventas de Deenex: lo facturado a los clientes mes a mes, separando el MRR (lo que se cobra todos
// los meses) de los extra jobs (trabajos puntuales). Sale de los cierres y de los meses anteriores
// importados del Excel del contador.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (p) => `${MESES_CORTOS[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

const ORIGENES = {
  cuentas: 'En cuentas corrientes',
  excel: 'Importado del Excel',
  cierre: 'Cierre sin pasar a cuentas',
};

const enteros = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const signo = (moneda) => (moneda === 'USD' ? 'US$' : '$');
const monto = (v, moneda) => (v == null ? '-' : `${v < -0.5 ? '-' : ''}${signo(moneda)} ${enteros.format(Math.abs(v))}`);
// 11256924 -> '$ 11,3 M', 500000 -> '$ 500 mil'
function montoCorto(v, moneda) {
  const a = Math.abs(v);
  const texto = a >= 1e6 ? `${unDecimal.format(v / 1e6)} M` : a >= 1e3 ? `${unDecimal.format(v / 1e3)} mil` : enteros.format(v);
  return `${signo(moneda)} ${texto}`;
}
const porcentajeTexto = (v) => `${unDecimal.format(v * 100)}%`;

// Escala del eje: de 0 a un tope redondo, con hasta 5 tramos.
function escala(max) {
  if (!(max > 0)) return { tope: 1, marcas: [0] };
  const pasoMinimo = max / 5;
  const magnitud = 10 ** Math.floor(Math.log10(pasoMinimo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * magnitud).find((p) => p >= pasoMinimo);
  const tope = Math.ceil(max / paso - 1e-9) * paso;
  const marcas = [];
  for (let i = 0; i * paso <= tope + paso / 1000; i++) marcas.push(i * paso);
  return { tope, marcas };
}

// Columna con las esquinas de arriba redondeadas y la base recta.
function columna(x, arriba, ancho, alto, radio) {
  const r = Math.max(0, Math.min(radio, ancho / 2, alto));
  const abajo = arriba + alto;
  return `M${x},${abajo}V${arriba + r}A${r},${r} 0 0 1 ${x + r},${arriba}H${x + ancho - r}A${r},${r} 0 0 1 ${x + ancho},${arriba + r}V${abajo}Z`;
}

// El detalle va al costado de la columna (a la derecha si entra), arriba del gráfico.
function posicionTooltip(centro, grosor, ancho, arriba) {
  const aLaDerecha = centro + grosor / 2 + 200 < ancho;
  return aLaDerecha
    ? { left: centro + grosor / 2 + 10, top: arriba }
    : { left: centro - grosor / 2 - 10, top: arriba, transform: 'translateX(-100%)' };
}

function Grafico({ meses, valor, moneda, elegido, onElegir }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(720);
  const [encima, setEncima] = useState(null);

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([e]) => setAncho(Math.max(260, Math.floor(e.contentRect.width))));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const alto = 240;
  const m = { arriba: 24, derecha: 8, abajo: 28, izquierda: 70 };
  const columnas = meses.map((mes) => {
    if (!mes.datos) return { ...mes, mrr: null, extra: null };
    const mrr = valor(mes.datos, 'mrrArs');
    const extra = valor(mes.datos, 'extrasArs');
    return { ...mes, mrr, extra, total: mrr == null ? null : Math.max(0, mrr) + Math.max(0, extra) };
  });
  const { tope, marcas } = escala(Math.max(0, ...columnas.map((c) => c.total ?? 0)));
  const ancho1 = ancho - m.izquierda - m.derecha;
  const banda = ancho1 / Math.max(1, columnas.length);
  const grosor = Math.max(6, Math.min(24, banda * 0.6));
  const y = (v) => m.arriba + alto - (Math.max(0, v) / tope) * alto;
  const cada = Math.ceil(44 / banda); // en pantallas chicas, una etiqueta cada tantos meses
  const actual = encima != null ? columnas[encima] : null;

  return (
    <div className="grafico" ref={caja}>
      <svg width={ancho} height={m.arriba + alto + m.abajo} role="img" aria-label={`MRR y extra jobs por mes, en ${moneda === 'USD' ? 'dólares' : 'pesos'}, sin IVA`}>
        {marcas.map((t) => (
          <g key={t}>
            <line className="grilla" x1={m.izquierda} x2={ancho - m.derecha} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
            <text className="eje" x={m.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end">{montoCorto(t, moneda)}</text>
          </g>
        ))}
        {columnas.map((c, i) => {
          const centro = m.izquierda + banda * (i + 0.5);
          const x = centro - grosor / 2;
          const elegida = c.periodo === elegido;
          const base = y(0);
          const arribaMrr = y(c.mrr ?? 0);
          const hayExtra = c.extra > 0;
          const arribaExtra = y(Math.max(0, c.mrr ?? 0) + (c.extra ?? 0));
          // 2px de aire entre MRR y extras; sin MRR, los extras arrancan en la base.
          const pisoExtra = c.mrr > 0 ? arribaMrr - 2 : base;
          return (
            <g key={c.periodo} className={`mes ${c.datos?.origen === 'cierre' ? 'provisorio' : ''} ${elegida ? 'elegida' : ''}`}>
              {(encima === i || elegida) && <rect className="resalte" x={m.izquierda + banda * i + 1} y={m.arriba} width={banda - 2} height={alto} rx="4" />}
              {c.mrr > 0 && (
                <path className="serie mrr" d={hayExtra ? `M${x},${base}V${arribaMrr}H${x + grosor}V${base}Z` : columna(x, arribaMrr, grosor, base - arribaMrr, 4)} />
              )}
              {hayExtra && (
                <path className="serie extra" d={columna(x, Math.min(arribaExtra, pisoExtra - 1.5), grosor, Math.max(1.5, pisoExtra - arribaExtra), 4)} />
              )}
              {i % cada === 0 && (
                <text className={`eje mes-eje ${elegida ? 'elegida' : ''}`} x={centro} y={m.arriba + alto + 18} textAnchor="middle">{mesCorto(c.periodo)}</text>
              )}
              <rect
                className="blanco"
                x={m.izquierda + banda * i}
                y={m.arriba}
                width={banda}
                height={alto + m.abajo}
                tabIndex={c.datos ? 0 : -1}
                role="button"
                aria-label={c.datos ? `${nombrePeriodo(c.periodo)}: MRR ${monto(c.mrr, moneda)}, extra jobs ${monto(c.extra, moneda)}` : `${nombrePeriodo(c.periodo)}: sin datos`}
                onPointerEnter={() => setEncima(i)}
                onPointerLeave={() => setEncima(null)}
                onFocus={() => setEncima(i)}
                onBlur={() => setEncima(null)}
                onClick={() => c.datos && onElegir(c.periodo)}
                onKeyDown={(e) => { if (c.datos && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onElegir(c.periodo); } }}
              />
            </g>
          );
        })}
      </svg>
      {actual && (
        <div className="tooltip-grafico" style={posicionTooltip(m.izquierda + banda * (encima + 0.5), grosor, ancho, m.arriba)}>
          <div className="tt-mes">{nombrePeriodo(actual.periodo)}{actual.datos?.origen === 'cierre' ? ' · sin pasar a cuentas' : ''}</div>
          {actual.datos ? (
            <>
              <div className="tt-fila"><i className="clave mrr" /><strong>{monto(actual.mrr, moneda)}</strong><span>MRR</span></div>
              <div className="tt-fila"><i className="clave extra" /><strong>{monto(actual.extra, moneda)}</strong><span>Extra jobs</span></div>
              {valor(actual.datos, 'reintegrosArs') ? (
                <div className="tt-fila"><i className="clave" /><strong>{monto(valor(actual.datos, 'reintegrosArs'), moneda)}</strong><span>Reintegros y ajustes</span></div>
              ) : null}
              <div className="tt-fila total"><i className="clave" /><strong>{monto(valor(actual.datos, 'totalArs'), moneda)}</strong><span>Total sin IVA</span></div>
            </>
          ) : (
            <div className="tt-fila"><span>Sin datos de este mes</span></div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalle, delta }) {
  return (
    <div className="kpi">
      <span className="etiqueta">{titulo}</span>
      <strong>{valor}</strong>
      {delta && <span className={`delta ${delta.clase}`}>{delta.texto}</span>}
      {detalle && <span className="etiqueta">{detalle}</span>}
    </div>
  );
}

// Cambio contra el mes anterior con datos: '▲ 4,2% vs sep 26'.
function variacion(actual, anterior, periodoAnterior, subirEsBueno = true) {
  if (actual == null || anterior == null || periodoAnterior == null) return null;
  if (anterior === 0) return actual === 0 ? { texto: `Igual que ${mesCorto(periodoAnterior)}`, clase: '' } : null;
  const cambio = (actual - anterior) / Math.abs(anterior);
  if (Math.abs(cambio) < 0.0005) return { texto: `Igual que ${mesCorto(periodoAnterior)}`, clase: '' };
  const sube = cambio > 0;
  return {
    texto: `${sube ? '▲' : '▼'} ${porcentajeTexto(Math.abs(cambio))} vs ${mesCorto(periodoAnterior)}`,
    clase: subirEsBueno ? (sube ? 'sube' : 'baja') : '',
  };
}

function ImportarExcel({ clientes, meses, onListo, onCancelar }) {
  const primero = meses[0]?.periodo;
  const [periodo, setPeriodo] = useState(primero ? periodoMas(primero, -1) : periodoMas(periodoActual(), -1));
  const [texto, setTexto] = useState('');
  const [mep, setMep] = useState('');
  const [leido, setLeido] = useState(null);
  const [elegidos, setElegidos] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const existente = meses.find((x) => x.periodo === periodo);

  function leer() {
    setError('');
    try {
      const r = leerDetallePegado(texto, { mep: leerMonto(mep) });
      const facturas = facturasDe(r.renglones);
      setElegidos(Object.fromEntries(facturas.map((f) => [f.clave, sugerirCliente(f, clientes, periodo) ?? ''])));
      setLeido({ ...r, facturas });
    } catch (e) {
      setLeido(null);
      setError(e.message);
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.importarFacturacion(periodo, { mep: leido.mep, renglones: asignarClientes(leido.renglones, elegidos, clientes) });
      onListo(periodo);
    } catch (e) {
      setError(`No pude guardar: ${e.message}`);
      setGuardando(false);
    }
  }

  const coincide = leido?.totalPlanilla && Math.abs(leido.totalPlanilla.brutoArs - leido.totales.brutoArs) < 0.05;
  return (
    <div className="panel importar">
      <h2>Importar un mes del Excel del contador</h2>
      <ol className="pasos-importar">
        <li>Abrí la planilla de facturación del mes y andá a la hoja <strong>DETALLE</strong>.</li>
        <li>Seleccioná toda la hoja (Ctrl+A), copiala (Ctrl+C) y pegala acá abajo.</li>
        <li>Revisá a qué cliente corresponde cada factura y guardá.</li>
      </ol>
      <div className="parametros compacto arriba">
        <label>
          Mes facturado
          <input id="importar-periodo" type="month" value={periodo} onChange={(e) => { if (e.target.value) { setPeriodo(e.target.value); setLeido(null); } }} />
        </label>
        <label className="con-ayuda">
          Dólar MEP
          <input id="importar-mep" inputMode="decimal" placeholder="Si la hoja no lo trae" value={mep} onChange={(e) => setMep(e.target.value)} />
          <small>Solo hace falta si hay renglones en dólares sin el monto en pesos.</small>
        </label>
      </div>
      {existente && (
        <div className="alerta aviso">
          {existente.origen === 'cuentas'
            ? `${nombrePeriodo(periodo)} ya está en las cuentas corrientes: el análisis va a seguir mostrando lo de las cuentas.`
            : existente.origen === 'excel'
              ? `${nombrePeriodo(periodo)} ya está importado: lo que guardes lo reemplaza.`
              : `${nombrePeriodo(periodo)} tiene un cierre generado sin pasar a cuentas: el análisis va a mostrar lo importado.`}
        </div>
      )}
      <textarea id="importar-texto" rows={6} placeholder="Pegá acá la hoja DETALLE" value={texto} onChange={(e) => { setTexto(e.target.value); setLeido(null); }} />
      <div className="botones sin-margen">
        <button className="primario" onClick={leer} disabled={!texto.trim()}>Leer la hoja</button>
        <button className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <div className="alerta error">{error}</div>}

      {leido && (
        <div className="vista-previa">
          <p>
            <strong>{leido.renglones.length} renglones</strong> de {leido.facturas.length} facturas · {pesos(leido.totales.brutoArs)} sin IVA ·{' '}
            {pesos(leido.totales.netoArs)} con IVA{leido.mep ? ` · dólar MEP ${numero(leido.mep)}` : ''}
          </p>
          {leido.totalPlanilla && (coincide
            ? <div className="alerta ok">Coincide con el TOTAL GENERAL de la planilla.</div>
            : <div className="alerta aviso">La suma da {pesos(leido.totales.brutoArs)} y el TOTAL GENERAL de la planilla dice {pesos(leido.totalPlanilla.brutoArs)}. Revisá que hayas copiado la hoja entera.</div>)}
          {leido.descartadas.length > 0 && (
            <div className="alerta aviso">No pude leer {leido.descartadas.length === 1 ? 'una fila' : `${leido.descartadas.length} filas`}: {leido.descartadas.slice(0, 3).join(' · ')}</div>
          )}
          <div className="scroll-x">
            <table className="tabla facturas">
              <thead>
                <tr><th>Factura</th><th>En el Excel</th><th>Detalle</th><th className="num">Sin IVA</th><th>Cliente en el sistema</th></tr>
              </thead>
              <tbody>
                {leido.facturas.map((f) => (
                  <tr key={f.clave}>
                    <td>{f.factura ?? '-'}</td>
                    <td>{f.cliente}</td>
                    <td className="cuit">{f.detalles.join(' · ')}</td>
                    <td className="num">{pesos(f.brutoArs)}</td>
                    <td>
                      <select aria-label={`Cliente del sistema para ${f.factura ?? ''} ${f.cliente}`} value={elegidos[f.clave] ?? ''} onChange={(e) => setElegidos({ ...elegidos, [f.clave]: e.target.value })}>
                        <option value="">No está en el sistema (queda {f.cliente})</option>
                        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="botones">
            <button className="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : `Guardar ${nombrePeriodo(periodo)}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Ventas({ onIrCierre }) {
  const [meses, setMeses] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [moneda, setMoneda] = useState('ARS');
  const [rango, setRango] = useState('12');
  const [elegido, setElegido] = useState(null);
  const [importando, setImportando] = useState(false);
  const [borrando, setBorrando] = useState(null);
  const [error, setError] = useState('');

  const cargar = () => api.facturacion().then(setMeses).catch((e) => { setMeses([]); setError(`No pude leer la facturación: ${e.message}`); });
  useEffect(() => {
    cargar();
    api.clientes().then(setClientes).catch(() => {});
  }, []);

  // Todos los meses entre el primero y el último con datos, para que se vean los huecos.
  const visibles = useMemo(() => {
    if (!meses?.length) return [];
    const porPeriodo = new Map(meses.map((x) => [x.periodo, x]));
    const ultimo = meses.at(-1).periodo;
    let desde = meses[0].periodo;
    if (rango !== 'todo') {
      const corte = periodoMas(ultimo, -(Number(rango) - 1));
      if (corte > desde) desde = corte;
    }
    const lista = [];
    for (let p = desde; p <= ultimo; p = periodoMas(p, 1)) lista.push({ periodo: p, datos: porPeriodo.get(p) ?? null });
    return lista;
  }, [meses, rango]);

  // Un monto en pesos, en la moneda elegida: en dólares, al MEP con que se facturó ese mes.
  const enMoneda = (ars, mep) => (ars == null ? null : moneda === 'ARS' ? ars : mep ? ars / mep : null);
  const valor = (datos, campo) => (datos ? enMoneda(datos[campo], datos.mep) : null);

  const conDatos = visibles.filter((x) => x.datos);
  const actual = conDatos.find((x) => x.periodo === elegido) ?? conDatos.at(-1);
  const anterior = actual ? conDatos.filter((x) => x.periodo < actual.periodo).at(-1) : null;
  const sel = actual?.datos;
  const sinDolar = moneda === 'USD' && conDatos.some((x) => !x.datos.mep);

  async function borrarImportado(periodo) {
    await api.borrarFacturacion(periodo);
    setBorrando(null);
    cargar();
  }

  if (!meses) return <section><h1>Ventas</h1><p className="ayuda">Cargando la facturación…</p></section>;

  return (
    <section>
      <div className="titulo-accion">
        <div>
          <h1>Ventas</h1>
          <p className="ayuda sin-margen">
            Lo que factura Deenex cada mes, sin IVA. <strong>MRR</strong> es lo que se cobra todos los meses: abonos, comisiones e infraestructura.{' '}
            <strong>Extra jobs</strong> son los trabajos puntuales: desarrollos, implementaciones, lanzamientos.
          </p>
        </div>
        {!importando && <button className="secundario" onClick={() => setImportando(true)}>Importar un mes del Excel</button>}
      </div>
      {error && <div className="alerta error">{error}</div>}

      {importando && (
        <ImportarExcel
          clientes={clientes}
          meses={meses}
          onCancelar={() => setImportando(false)}
          onListo={(p) => { setImportando(false); setElegido(p); cargar(); }}
        />
      )}

      {meses.length === 0 && !importando && (
        <div className="panel vacio">
          <strong>Todavía no hay meses facturados.</strong>
          <p>Cada mes aparece cuando generás su cierre. Los meses de antes de usar el sistema se pueden importar del Excel que le pasás al contador (la hoja DETALLE).</p>
          <button className="primario" onClick={() => setImportando(true)}>Importar un mes del Excel</button>
        </div>
      )}

      {sel && (
        <>
          <div className="filtros" role="group" aria-label="Filtros">
            <div className="segmentado" role="radiogroup" aria-label="Moneda">
              {[['ARS', 'Pesos'], ['USD', 'Dólares']].map(([id, nombre]) => (
                <button key={id} role="radio" aria-checked={moneda === id} className={moneda === id ? 'activo' : ''} onClick={() => setMoneda(id)}>{nombre}</button>
              ))}
            </div>
            <div className="segmentado" role="radiogroup" aria-label="Período">
              {[['12', 'Últimos 12 meses'], ['todo', 'Todo']].map(([id, nombre]) => (
                <button key={id} role="radio" aria-checked={rango === id} className={rango === id ? 'activo' : ''} onClick={() => setRango(id)}>{nombre}</button>
              ))}
            </div>
            {moneda === 'USD' && <span className="etiqueta">En dólares, cada mes al MEP con que se facturó.</span>}
          </div>

          <div className="kpis">
            <Kpi
              titulo={`MRR de ${nombrePeriodo(actual.periodo)}`}
              valor={monto(valor(sel, 'mrrArs'), moneda)}
              delta={variacion(valor(sel, 'mrrArs'), valor(anterior?.datos, 'mrrArs'), anterior?.periodo)}
            />
            <Kpi
              titulo="Extra jobs"
              valor={monto(valor(sel, 'extrasArs'), moneda)}
              delta={variacion(valor(sel, 'extrasArs'), valor(anterior?.datos, 'extrasArs'), anterior?.periodo, false)}
            />
            <Kpi titulo="Total facturado sin IVA" valor={monto(valor(sel, 'totalArs'), moneda)} detalle={<>Con IVA: <span className="sin-corte">{monto(valor(sel, 'netoArs'), moneda)}</span></>} />
            <Kpi titulo="Clientes que facturaron" valor={String(sel.clientes.length)} detalle={ORIGENES[sel.origen]} />
          </div>

          <div className="panel">
            <div className="cabecera-grafico">
              <h2>MRR y extra jobs por mes</h2>
              <div className="leyenda">
                <span><i className="muestra mrr" />MRR</span>
                <span><i className="muestra extra" />Extra jobs</span>
              </div>
            </div>
            {sinDolar && <div className="alerta aviso">Hay meses sin dólar MEP guardado: en dólares no se pueden mostrar.</div>}
            <Grafico meses={visibles} valor={valor} moneda={moneda} elegido={actual.periodo} onElegir={setElegido} />
            <p className="ayuda nota">
              Tocá un mes para ver su detalle.{conDatos.some((x) => x.datos.origen === 'cierre') ? ' Las columnas más claras son cierres generados que todavía no pasaste a cuentas.' : ''}
              {' '}Los reintegros y ajustes no van en el gráfico: están en la tabla.
            </p>
          </div>

          <div className="panel">
            <h2>Mes a mes</h2>
            <div className="scroll-x">
              <table className="tabla mes-a-mes">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">MRR</th>
                    <th className="num">Extra jobs</th>
                    <th className="num">Total sin IVA</th>
                    {CATEGORIAS.filter((c) => c.mrr).map((c) => <th key={c.id} className="num">{c.nombre}</th>)}
                    <th className="num">Reintegros y ajustes</th>
                    <th>De dónde sale</th>
                  </tr>
                </thead>
                <tbody>
                  {[...conDatos].reverse().map(({ periodo, datos }) => (
                    <tr key={periodo} className={`fila-click ${periodo === actual.periodo ? 'elegida' : ''}`} onClick={() => setElegido(periodo)}>
                      <td>{nombrePeriodo(periodo)}</td>
                      <td className="num"><strong>{monto(valor(datos, 'mrrArs'), moneda)}</strong></td>
                      <td className="num">{monto(valor(datos, 'extrasArs'), moneda)}</td>
                      <td className="num"><strong>{monto(valor(datos, 'totalArs'), moneda)}</strong></td>
                      {CATEGORIAS.filter((c) => c.mrr).map((c) => <td key={c.id} className="num">{monto(enMoneda(datos.categorias[c.id], datos.mep), moneda)}</td>)}
                      <td className="num">{monto(valor(datos, 'reintegrosArs'), moneda)}</td>
                      <td className="origen-celda" onClick={(e) => e.stopPropagation()}>
                        <span className="cuit">{ORIGENES[datos.origen]}</span>
                        {datos.origen === 'cierre' && <button className="link" onClick={() => onIrCierre(periodo)}>Ir al cierre</button>}
                        {datos.origen === 'excel' && (borrando === periodo ? (
                          <>
                            <button className="link peligro" onClick={() => borrarImportado(periodo)}>Sí, borrar</button>
                            <button className="link" onClick={() => setBorrando(null)}>No</button>
                          </>
                        ) : (
                          <button className="link peligro" onClick={() => setBorrando(periodo)}>Borrar</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Por cliente en {nombrePeriodo(actual.periodo)}</h2>
            <div className="scroll-x">
              <table className="tabla por-cliente">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">MRR</th>
                    <th className="num">Extra jobs</th>
                    <th className="num">Total sin IVA</th>
                    <th className="num">Parte del total</th>
                    <th className="num">Reintegros y ajustes</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.clientes.map((c) => (
                    <tr key={c.clienteId}>
                      <td>{c.clienteNombre}</td>
                      <td className="num">{monto(enMoneda(c.mrrArs, sel.mep), moneda)}</td>
                      <td className="num">{monto(enMoneda(c.extrasArs, sel.mep), moneda)}</td>
                      <td className="num"><strong>{monto(enMoneda(c.totalArs, sel.mep), moneda)}</strong></td>
                      <td className="num">{sel.totalArs ? porcentajeTexto(c.totalArs / sel.totalArs) : '-'}</td>
                      <td className="num">{monto(enMoneda(c.reintegrosArs, sel.mep), moneda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{monto(valor(sel, 'mrrArs'), moneda)}</td>
                    <td className="num">{monto(valor(sel, 'extrasArs'), moneda)}</td>
                    <td className="num">{monto(valor(sel, 'totalArs'), moneda)}</td>
                    <td className="num">100%</td>
                    <td className="num">{monto(valor(sel, 'reintegrosArs'), moneda)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
