import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { acuerdoVigente } from '../../../server/src/engine/liquidar.js';
import { localesEn, conLocalesEnMes, usaLocales } from '../../../server/src/engine/clientes.js';
import { casillerosDeVentas } from '../../../server/src/engine/ventas.js';
import { compararPeriodos } from '../../../server/src/engine/periodos.js';
import { D, redondear } from '../../../server/src/engine/dinero.js';
import {
  nombrePeriodo, periodoMas, periodoActual, hoyLocal, pesos, porcentaje, leerMonto, localesFranquiciados, resumenLocales,
} from '../formato.js';

const CANALES = [
  { id: 'delivery', nombre: 'Delivery' },
  { id: 'takeaway', nombre: 'Take away' },
];
const nombreCanal = (id) => CANALES.find((c) => c.id === id).nombre;
const formato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const entero = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const nombreGrupo = (c) => ({ propios: 'Locales propios', franquiciados: 'Locales franquiciados', todos: 'Todos los locales' })[c.grupo] ?? c.nombre;
const clave = (c) => `${c.grupo}|${c.canal}`;
const A_LA_VISTA = 6;

// Meses en los que importan sus locales o sus ventas: desde el primer acuerdo hasta el mes que
// viene (o el último cambio de locales cargado), del más nuevo al más viejo.
function mesesDelCliente(cliente, actual) {
  const inicio = cliente.acuerdos.map((a) => a.vigenciaDesde).filter(Boolean).sort(compararPeriodos)[0];
  if (!inicio) return [];
  let fin = periodoMas(actual, 1);
  const ultimoCambio = cliente.cambiosLocales.at(-1)?.desde;
  if (ultimoCambio && compararPeriodos(ultimoCambio, fin) > 0) fin = ultimoCambio;
  const meses = [];
  for (let p = fin; compararPeriodos(p, inicio) >= 0; p = periodoMas(p, -1)) {
    if (usaLocales(acuerdoVigente(cliente, p))) meses.push(p);
  }
  return meses;
}

// Lo cargado de un canal en un mes: null si ese mes no cobra comisión por ese canal.
function ventasDelCanal(casilleros, canal) {
  const deCanal = casilleros.filter((c) => c.canal === canal);
  if (!deCanal.length) return null;
  return {
    total: deCanal.reduce((s, c) => s.plus(c.monto ?? 0), D(0)).toNumber(),
    faltan: deCanal.filter((c) => c.monto == null).length,
    casilleros: deCanal.length,
  };
}

function CeldaVentas({ ventas, etiqueta, periodo, actual, pendiente }) {
  if (!ventas) return <td className="num suave" data-etiqueta={etiqueta} title="Este mes no cobra comisión por este canal">-</td>;
  if (ventas.faltan === ventas.casilleros) {
    if (periodo === pendiente) return <td className="num" data-etiqueta={etiqueta}><span className="estado aviso">Falta cargar</span></td>;
    return <td className="num suave" data-etiqueta={etiqueta}>{compararPeriodos(periodo, actual) > 0 ? '-' : 'Sin cargar'}</td>;
  }
  return (
    <td className="num" data-etiqueta={etiqueta}>
      {pesos(ventas.total)}
      {ventas.faltan > 0 && <span className="cuit bloque">faltan {ventas.faltan}</span>}
    </td>
  );
}

// Formulario de un mes: cuántos locales tuvo y cuánto vendió en cada canal que cobra comisión.
function FormMes({ cliente, periodo, ventas, actual, onGuardado, onCancelar }) {
  const en = localesEn(cliente, periodo);
  const paganEllos = cliente.quienPaga === 'franquiciados';
  const conFranquiciados = cliente.tieneFranquiciados;
  const futuro = compararPeriodos(periodo, actual) > 0;
  const [locales, setLocales] = useState({
    propios: String(en.locales.propios),
    franquiciados: String(en.locales.franquiciados),
    porFranquiciado: Object.fromEntries(en.franquiciados.map((f) => [f.id, String(f.locales)])),
  });
  const [valores, setValores] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cantidades = {
    propios: entero(locales.propios),
    franquiciados: conFranquiciados && !paganEllos ? entero(locales.franquiciados) : 0,
    porFranquiciado: paganEllos ? Object.fromEntries(Object.entries(locales.porFranquiciado).map(([id, v]) => [id, entero(v)])) : {},
  };
  const localesValidos = [cantidades.propios, cantidades.franquiciados, ...Object.values(cantidades.porFranquiciado)].every((n) => !Number.isNaN(n));
  // Los casilleros de ventas salen de los locales que se están cargando: si cambian, cambian los grupos.
  const conEstosLocales = localesValidos ? { ...cliente, cambiosLocales: conLocalesEnMes(cliente, periodo, cantidades) } : cliente;
  const casilleros = futuro ? [] : casillerosDeVentas(conEstosLocales, periodo, ventas);
  const texto = (c) => valores[clave(c)] ?? (c.monto == null ? '' : formato.format(c.monto));

  async function guardar(e) {
    e.preventDefault();
    if (!localesValidos) return setError('Las cantidades de locales tienen que ser números enteros, 0 o más.');
    const montos = {};
    for (const c of casilleros) {
      const t = texto(c).trim();
      if (t === '') continue;
      const v = leerMonto(t);
      if (Number.isNaN(v) || v < 0) {
        return setError(`Las ventas de ${nombreCanal(c.canal).toLowerCase()} ("${t}") no son un monto. Escribilas así: 1.244.000,50.`);
      }
      montos[clave(c)] = v;
    }
    setError('');
    setGuardando(true);
    try {
      const nuevo = await api.guardarMesCliente(cliente.id, periodo, { locales: cantidades, valores: futuro ? undefined : montos });
      await onGuardado(nuevo, periodo);
    } catch (err) {
      setError(`No pude guardar: ${err.message}`);
      setGuardando(false);
    }
  }

  const campoLocales = (valor, cambiar, id, etiqueta) => (
    <label key={id}>
      {etiqueta}
      <input id={id} className="num" inputMode="numeric" value={valor} onChange={(ev) => cambiar(ev.target.value)} />
    </label>
  );

  return (
    <form className="form-mes" onSubmit={guardar}>
      <fieldset>
        <legend>Locales en {nombrePeriodo(periodo)}</legend>
        <div className="campos">
          {campoLocales(locales.propios, (v) => setLocales({ ...locales, propios: v }), 'mes-propios', 'Propios')}
          {conFranquiciados && !paganEllos &&
            campoLocales(locales.franquiciados, (v) => setLocales({ ...locales, franquiciados: v }), 'mes-franquiciados', 'Franquiciados')}
          {paganEllos && cliente.franquiciados.map((f) =>
            campoLocales(
              locales.porFranquiciado[f.id] ?? '0',
              (v) => setLocales({ ...locales, porFranquiciado: { ...locales.porFranquiciado, [f.id]: v } }),
              `mes-${f.id}`,
              f.razonSocial || 'Franquiciado sin nombre',
            ))}
        </div>
        <p className="ayuda nota">Rige desde {nombrePeriodo(periodo)} hasta el próximo mes con otra cantidad.</p>
      </fieldset>

      {futuro && acuerdoVigente(cliente, periodo)?.comision && (
        <p className="ayuda nota ancho">Las ventas de {nombrePeriodo(periodo)} se cargan cuando termine el mes.</p>
      )}
      {casilleros.length > 0 && (
        <fieldset>
          <legend>Ventas de {nombrePeriodo(periodo)}</legend>
          <div className="campos">
            {casilleros.map((c) => {
              const v = leerMonto(texto(c));
              return (
                <label key={clave(c)} className="venta">
                  <span>
                    {nombreCanal(c.canal)}
                    {casilleros.some((x) => x.grupo !== c.grupo) && ` · ${nombreGrupo(c)} (${c.locales})`}
                  </span>
                  <input
                    id={`mes-venta-${c.grupo}-${c.canal}`}
                    className="num"
                    inputMode="decimal"
                    placeholder="Sin cargar"
                    value={texto(c)}
                    onChange={(ev) => setValores({ ...valores, [clave(c)]: ev.target.value })}
                  />
                  <small>
                    Cobra {porcentaje(c.tasa, 4)}%
                    {v >= 0 && <> · {pesos(redondear(D(v).times(c.tasa)).toNumber())}</>}
                  </small>
                </label>
              );
            })}
          </div>
          <p className="ayuda nota">Con IVA y sin envío. La comisión se cobra en el cierre de {nombrePeriodo(periodoMas(periodo, 1))}.</p>
        </fieldset>
      )}

      <div className="botones">
        <button type="submit" className="primario" disabled={guardando}>{guardando ? 'Guardando…' : `Guardar ${nombrePeriodo(periodo)}`}</button>
        <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <div className="alerta error">{error}</div>}
    </form>
  );
}

// Locales y ventas mes a mes de un cliente: lo que usa el cierre para cobrar por local y la comisión.
export default function MesAMes({ cliente, mesInicial, onCambio }) {
  const actual = periodoActual();
  const [ventas, setVentas] = useState(null);
  const [pendiente, setPendiente] = useState(null);
  const [abierto, setAbierto] = useState(mesInicial ?? null);
  const [verTodos, setVerTodos] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargarVentas = () => api.ventasDeCliente(cliente.id).then(setVentas);
  useEffect(() => {
    cargarVentas().catch(() => setVentas([]));
    // El mes cuyas ventas pide el próximo cierre, si ya terminó.
    api.mesACerrar(hoyLocal()).then((m) => {
      const mes = periodoMas(m, -1);
      setPendiente(compararPeriodos(mes, actual) < 0 ? mes : null);
    }).catch(() => {});
  }, [cliente.id]);

  const meses = mesesDelCliente(cliente, actual);
  const indice = abierto ? meses.indexOf(abierto) : -1;
  const visibles = verTodos || indice >= A_LA_VISTA ? meses : meses.slice(0, A_LA_VISTA);
  const filas = visibles.map((p) => {
    const casilleros = casillerosDeVentas(cliente, p, ventas ?? []);
    const en = localesEn(cliente, p);
    return {
      periodo: p,
      propios: en.locales.propios,
      franquiciados: localesFranquiciados(en),
      cambia: cliente.cambiosLocales.some((x) => x.desde === p),
      canales: Object.fromEntries(CANALES.map((k) => [k.id, ventasDelCanal(casilleros, k.id)])),
    };
  });
  const canales = CANALES.filter((k) => filas.some((f) => f.canales[k.id]));
  const columnas = 3 + (cliente.tieneFranquiciados ? 1 : 0) + canales.length;
  const tasas = (() => {
    const a = acuerdoVigente(cliente, actual);
    return a?.comision ? CANALES.filter((k) => a.comision[k.id] != null).map((k) => `${porcentaje(a.comision[k.id], 4)}% del ${k.nombre.toLowerCase()}`) : [];
  })();

  async function alGuardar(nuevo, periodo) {
    onCambio(nuevo);
    await cargarVentas();
    setAbierto(null);
    setMensaje(`Guardé ${nombrePeriodo(periodo)}.`);
  }

  function alternar(p) {
    setMensaje('');
    setAbierto(abierto === p ? null : p);
  }

  if (!meses.length) {
    return <div className="panel vacio">Este cliente paga un abono fijo: no hace falta cargar locales ni ventas.</div>;
  }

  return (
    <div className="panel mes-a-mes-cliente">
      <div className="cabecera-cliente">
        <h2>Locales y ventas por mes</h2>
        <span className="etiqueta">
          {[`Hoy: ${resumenLocales(localesEn(cliente, actual)) || 'sin locales'}`, tasas.length && `cobra ${tasas.join(' y ')}`].filter(Boolean).join(' · ')}
        </span>
      </div>
      <p className="ayuda">
        Cuántos locales tuvo cada mes y cuánto vendió, con IVA y sin envío, en los canales que cobran comisión.
        Las ventas de un mes se cobran en el cierre del mes siguiente. Tocá un mes para cargarlo.
      </p>
      {mensaje && <div className="alerta ok" role="status">{mensaje}</div>}
      <div className="scroll-x">
        <table className="tabla movimientos meses-cliente">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="num">{cliente.tieneFranquiciados ? 'Propios' : 'Locales'}</th>
              {cliente.tieneFranquiciados && <th className="num">Franquiciados</th>}
              {canales.map((k) => <th key={k.id} className="num">Ventas {k.nombre.toLowerCase()}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaMes
                key={f.periodo}
                fila={f}
                canales={canales}
                columnas={columnas}
                actual={actual}
                pendiente={pendiente}
                abierto={abierto === f.periodo}
                conFranquiciados={cliente.tieneFranquiciados}
                onAlternar={() => alternar(f.periodo)}
              >
                <FormMes
                  cliente={cliente}
                  periodo={f.periodo}
                  ventas={ventas ?? []}
                  actual={actual}
                  onGuardado={alGuardar}
                  onCancelar={() => setAbierto(null)}
                />
              </FilaMes>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length < meses.length && (
        <button className="link ver-mas" onClick={() => setVerTodos(true)}>Ver los {meses.length - visibles.length} meses anteriores</button>
      )}
    </div>
  );
}

function FilaMes({ fila: f, canales, columnas, actual, pendiente, abierto, conFranquiciados, onAlternar, children }) {
  const etiqueta = f.periodo === actual ? 'en curso' : compararPeriodos(f.periodo, actual) > 0 ? 'próximo' : null;
  return (
    <>
      <tr className={`fila-click${abierto ? ' elegida' : ''}`} onClick={onAlternar}>
        <td>
          <span className="flecha">{abierto ? '▾' : '▸'}</span> {nombrePeriodo(f.periodo)}
          {etiqueta && <span className="etiqueta"> · {etiqueta}</span>}
        </td>
        <td className={`num${f.cambia ? ' cambia' : ''}`} data-etiqueta={conFranquiciados ? 'Propios' : 'Locales'}>{f.propios}</td>
        {conFranquiciados && <td className={`num${f.cambia ? ' cambia' : ''}`} data-etiqueta="Franquiciados">{f.franquiciados}</td>}
        {canales.map((k) => (
          <CeldaVentas
            key={k.id}
            ventas={f.canales[k.id]}
            etiqueta={`Ventas ${k.nombre.toLowerCase()}`}
            periodo={f.periodo}
            actual={actual}
            pendiente={pendiente}
          />
        ))}
        <td className="acciones-fila">
          <button className="link" onClick={(ev) => { ev.stopPropagation(); onAlternar(); }}>{abierto ? 'Cerrar' : 'Cargar'}</button>
        </td>
      </tr>
      {abierto && (
        <tr className="detalle-mes">
          <td colSpan={columnas}>{children}</td>
        </tr>
      )}
    </>
  );
}
