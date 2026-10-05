import { useState } from 'react';
import { api } from '../api.js';
import { usaLocales } from '../../../server/src/engine/clientes.js';
import { pesos, slug, periodoMas, periodoActual, nombrePeriodo, leerMonto } from '../formato.js';
import Liquidacion from './Liquidacion.jsx';

const CANALES = ['delivery', 'takeaway'];

const acuerdoNuevo = () => ({ vigenciaDesde: periodoActual(), moneda: 'USD', feePorLocal: {} });

const clienteVacio = () => ({
  id: '',
  nombre: '',
  razonSocial: '',
  cuit: '',
  condicionIva: 'Responsable Inscripto',
  domicilioFiscal: '',
  contacto: { nombre: '', email: '', telefono: '' },
  diaVencimiento: 10,
  tieneFranquiciados: false,
  quienPaga: 'marca',
  locales: {},
  franquiciados: [],
  acuerdos: [acuerdoNuevo()],
  extras: [],
});

const MODELOS = [
  { id: 'fijo', nombre: 'Fee mensual fijo', ayuda: 'Un monto por mes, sin importar cuántos locales tenga.' },
  { id: 'porLocal', nombre: 'Fee por local', ayuda: 'Un precio por cada local.' },
  { id: 'comision', nombre: 'Comisión', ayuda: 'Un % de lo vendido el mes anterior.' },
  { id: 'hibrido', nombre: 'Híbrido', ayuda: 'Fee por local más comisión.' },
  { id: 'extras', nombre: 'Solo extras', ayuda: 'No paga fee, solo los extras que cargues.' },
];

function modeloDe(a) {
  if (a.feePorLocal && a.comision) return 'hibrido';
  if (a.feePorLocal) return 'porLocal';
  if (a.comision) return 'comision';
  if (a.feeFijo) return 'fijo';
  return 'extras';
}

const num = (v) => (v === '' || v == null ? undefined : Number(v));
const entero = (v) => Math.max(0, Math.floor(Number(v) || 0));
const aPct = (v) => (v == null ? '' : +(v * 100).toFixed(4));
// '1.1' -> 0.011, sin el ruido de los decimales binarios
const dePct = (v) => (v === '' ? undefined : Number((Number(v) / 100).toFixed(10)));
// Id de franquiciado que no se repite aunque se agreguen dos en el mismo milisegundo.
const idFranquiciado = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ultimoAcuerdo = (acuerdos) => [...acuerdos].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];

// Tasas sin canales vacíos ni en cero (cero es "no cobra").
const tasasLimpias = (t) => Object.fromEntries(CANALES.filter((k) => t?.[k] != null && t[k] !== 0).map((k) => [k, t[k]]));
const mismasTasas = (a, b) => CANALES.every((k) => (a[k] ?? null) === (b[k] ?? null));

// Los franquiciados pagan distinto si el acuerdo guardado tiene un precio o una comisión propia para ellos.
function pagaDistinto(a) {
  const fee = a?.feePorLocal;
  return Boolean((fee?.precioFranquiciado != null && fee.precioFranquiciado !== fee.precio) || a?.comisionFranquiciado);
}

// En el formulario, una casilla vacía de los franquiciados es "igual que los propios" y un 0 es
// "no cobra". Guardado, el acuerdo tiene solo lo que los franquiciados pagan distinto.
function acuerdoParaFormulario(a) {
  if (!a?.comision || !a.comisionFranquiciado) return a;
  const franquiciados = {};
  for (const k of CANALES) {
    if (a.comisionFranquiciado[k] != null) franquiciados[k] = a.comisionFranquiciado[k];
    else if (a.comision[k] != null) franquiciados[k] = 0;
  }
  return { ...a, comisionFranquiciado: franquiciados };
}

function acuerdoParaGuardar(a, distinto) {
  const x = { ...a };
  if (x.moneda !== 'ARS') x.ajusteIpc = undefined;
  if (x.feePorLocal) {
    const pf = distinto ? x.feePorLocal.precioFranquiciado : undefined;
    x.feePorLocal = { ...x.feePorLocal, precioFranquiciado: pf != null && pf !== x.feePorLocal.precio ? pf : undefined };
  }
  if (x.comision) {
    const propios = tasasLimpias(x.comision);
    const franquiciados = distinto
      ? tasasLimpias(Object.fromEntries(CANALES.map((k) => [k, x.comisionFranquiciado?.[k] ?? x.comision[k]])))
      : propios;
    x.comision = propios;
    x.comisionFranquiciado = mismasTasas(propios, franquiciados) ? undefined : franquiciados;
  } else {
    x.comisionFranquiciado = undefined;
  }
  if (modeloDe(x) !== 'hibrido') x.combinacion = undefined;
  return x;
}

function Campo({ label, children, ancho }) {
  return (
    <label className={ancho ? 'campo ancho' : 'campo'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AltaCliente({ inicial, onListo }) {
  const editando = Boolean(inicial);
  const [c, setC] = useState(() => {
    if (!inicial) return clienteVacio();
    const copia = structuredClone(inicial);
    if (!copia.acuerdos?.length) copia.acuerdos = [acuerdoNuevo()];
    const ultimo = ultimoAcuerdo(copia.acuerdos);
    copia.acuerdos = copia.acuerdos.map((a) => (a === ultimo ? acuerdoParaFormulario(a) : a));
    return copia;
  });
  const [distinto, setDistinto] = useState(() => pagaDistinto(inicial?.acuerdos?.length ? ultimoAcuerdo(inicial.acuerdos) : null));
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState('');

  const cambiar = (campo, valor) => setC((x) => ({ ...x, [campo]: valor }));
  const cambiarLocales = (campo, valor) => setC((x) => ({ ...x, locales: { ...x.locales, [campo]: valor } }));
  const acuerdo = ultimoAcuerdo(c.acuerdos);
  const cambiarAcuerdo = (cambios) => setC((x) => ({ ...x, acuerdos: x.acuerdos.map((a) => (a === acuerdo ? { ...a, ...cambios } : a)) }));
  const cambiarFila = (lista, i, cambios) => setC((x) => ({ ...x, [lista]: x[lista].map((f, j) => (j === i ? { ...f, ...cambios } : f)) }));
  const agregarFila = (lista, fila) => setC((x) => ({ ...x, [lista]: [...x[lista], fila] }));
  const quitarFila = (lista, i) => setC((x) => ({ ...x, [lista]: x[lista].filter((_, j) => j !== i) }));

  const modelo = modeloDe(acuerdo);
  const conLocales = usaLocales(acuerdo);
  const eligioFranquiciados = c.tieneFranquiciados && c.quienPaga === 'franquiciados';
  // Con todos los locales propios, con la marca pagando todo o con un acuerdo que no depende de
  // los locales (fee fijo, solo extras), no hace falta cargar a cada franquiciado.
  const paganFranquiciados = eligioFranquiciados && conLocales;
  const pasos = ['Marca', 'Acuerdo', ...(paganFranquiciados ? ['Franquiciados'] : []), 'Extras', 'Simulación'];
  const actual = pasos[Math.min(paso, pasos.length - 1)];

  function cambiarModelo(id) {
    const porLocal = id === 'porLocal' || id === 'hibrido';
    const comision = id === 'comision' || id === 'hibrido';
    cambiarAcuerdo({
      feeFijo: id === 'fijo' ? acuerdo.feeFijo ?? {} : undefined,
      feePorLocal: porLocal ? acuerdo.feePorLocal ?? {} : undefined,
      comision: comision ? acuerdo.comision ?? {} : undefined,
      comisionFranquiciado: comision ? acuerdo.comisionFranquiciado : undefined,
      combinacion: id === 'hibrido' ? acuerdo.combinacion ?? { modo: 'suma' } : undefined,
    });
  }

  // El cliente tal como se guarda: solo lo que hace falta para cobrarle.
  function armar() {
    const franquiciados = paganFranquiciados
      ? c.franquiciados.map((f) => ({ ...f, razonSocial: f.razonSocial?.trim() ?? '', locales: entero(f.locales) }))
      : [];
    const ids = new Set(franquiciados.map((f) => f.id));
    return {
      ...c,
      id: c.id || slug(c.nombre),
      nombre: c.nombre.trim(),
      quienPaga: paganFranquiciados ? 'franquiciados' : 'marca',
      locales: {
        propios: conLocales ? entero(c.locales?.propios) : 0,
        franquiciados: conLocales && c.tieneFranquiciados && !paganFranquiciados ? entero(c.locales?.franquiciados) : 0,
      },
      franquiciados,
      acuerdos: c.acuerdos.map((a) => (a === acuerdo ? acuerdoParaGuardar(a, c.tieneFranquiciados && distinto) : a)),
      // Un extra de un franquiciado que ya no está pasa a la marca.
      extras: c.extras.map((x) => (x.pagador && x.pagador !== 'marca' && !ids.has(x.pagador) ? { ...x, pagador: undefined } : x)),
    };
  }

  function problema(d) {
    const a = ultimoAcuerdo(d.acuerdos);
    if (!d.nombre) return 'Poné el nombre comercial del cliente (paso Marca).';
    if (!d.id) return 'El nombre comercial tiene que tener alguna letra o número (paso Marca).';
    if (a.feeFijo && !(a.feeFijo.monto > 0)) return 'Poné el monto del fee mensual (paso Acuerdo).';
    if (a.feePorLocal && !(a.feePorLocal.precio > 0)) return 'Poné el precio por local (paso Acuerdo).';
    if (a.comision && !Object.keys(a.comision).length) return 'Poné el % de comisión de delivery o de takeaway (paso Acuerdo).';
    if (a.ajusteIpc?.activo && !a.ajusteIpc.mesBase) return 'Poné en qué mes se pactó el monto, para ajustarlo por IPC (paso Acuerdo).';
    if (!usaLocales(a)) return '';
    if (d.quienPaga === 'franquiciados') {
      if (!d.franquiciados.length) return 'Cargá los franquiciados que pagan (paso Franquiciados).';
      if (d.franquiciados.some((f) => !f.razonSocial)) return 'Falta la razón social de algún franquiciado (paso Franquiciados).';
    }
    const total = d.locales.propios + d.locales.franquiciados + d.franquiciados.reduce((s, f) => s + f.locales, 0);
    if (!total) return 'Poné cuántos locales tiene (paso Acuerdo).';
    return '';
  }

  function irA(i) {
    if (i > paso && actual === 'Marca' && !c.nombre.trim()) return setError('Poné el nombre comercial del cliente.');
    setError('');
    setPaso(Math.max(0, Math.min(i, pasos.length - 1)));
  }

  async function guardar() {
    const datos = armar();
    const falta = problema(datos);
    if (falta) return setError(falta);
    setError('');
    try {
      await (editando ? api.actualizarCliente(datos) : api.crearCliente(datos));
      onListo();
    } catch (e) {
      setError(e.message);
    }
  }

  const totalFranquiciados = c.franquiciados.reduce((s, f) => s + entero(f.locales), 0);
  const moneda = acuerdo.moneda;

  return (
    <section>
      <h1>{editando ? `Editar ${inicial.nombre}` : 'Nuevo cliente'}</h1>
      <ol className="pasos">
        {pasos.map((p, i) => (
          <li key={p} className={p === actual ? 'actual' : i < paso ? 'hecho' : ''} onClick={() => irA(i)}>
            <span>{i + 1}</span> {p}
          </li>
        ))}
      </ol>

      <div className="panel formulario">
        {actual === 'Marca' && (
          <>
            <div className="grilla">
              <Campo label="Nombre comercial"><input id="cliente-nombre" value={c.nombre} onChange={(e) => cambiar('nombre', e.target.value)} /></Campo>
              <Campo label="Razón social"><input id="cliente-razon-social" value={c.razonSocial ?? ''} onChange={(e) => cambiar('razonSocial', e.target.value)} /></Campo>
              <Campo label="CUIT"><input id="cliente-cuit" placeholder="30-12345678-9" value={c.cuit ?? ''} onChange={(e) => cambiar('cuit', e.target.value)} /></Campo>
              <Campo label="Condición frente al IVA">
                <select value={c.condicionIva ?? 'Responsable Inscripto'} onChange={(e) => cambiar('condicionIva', e.target.value)}>
                  <option>Responsable Inscripto</option><option>Monotributo</option><option>Exento</option>
                </select>
              </Campo>
              <Campo label="Vence el día (de cada mes)">
                <input id="cliente-vencimiento" type="number" min="1" max="31" value={c.diaVencimiento ?? 10} onChange={(e) => cambiar('diaVencimiento', e.target.value === '' ? undefined : Number(e.target.value))} />
              </Campo>
              <Campo label="Domicilio fiscal" ancho><input id="cliente-domicilio" value={c.domicilioFiscal ?? ''} onChange={(e) => cambiar('domicilioFiscal', e.target.value)} /></Campo>
            </div>
            <h3>Contacto de cobranza</h3>
            <div className="grilla">
              {['nombre', 'email', 'telefono'].map((k) => (
                <Campo key={k} label={{ nombre: 'Nombre', email: 'Mail', telefono: 'Teléfono' }[k]}>
                  <input value={c.contacto?.[k] ?? ''} onChange={(e) => cambiar('contacto', { ...c.contacto, [k]: e.target.value })} />
                </Campo>
              ))}
            </div>
            <h3>Locales</h3>
            <div className="opciones">
              <label><input type="radio" name="franquicias" id="todos-propios" checked={!c.tieneFranquiciados} onChange={() => cambiar('tieneFranquiciados', false)} /> Todos los locales son propios</label>
              <label><input type="radio" name="franquicias" id="tiene-franquiciados" checked={c.tieneFranquiciados} onChange={() => cambiar('tieneFranquiciados', true)} /> Tiene locales franquiciados</label>
            </div>
            {c.tieneFranquiciados && (
              <>
                <div className="opciones">
                  <span className="etiqueta">¿Quién paga?</span>
                  <label><input type="radio" name="paga" id="paga-marca" checked={c.quienPaga !== 'franquiciados'} onChange={() => cambiar('quienPaga', 'marca')} /> La marca paga todo</label>
                  <label><input type="radio" name="paga" id="paga-franquiciados" checked={c.quienPaga === 'franquiciados'} onChange={() => cambiar('quienPaga', 'franquiciados')} /> Cada franquiciado paga sus locales</label>
                </div>
                <p className="ayuda">
                  {eligioFranquiciados
                    ? 'Después cargás a cada franquiciado con su CUIT y cuántos locales tiene, para cobrarle a cada uno.'
                    : 'Se le cobra todo a la marca, así que no hace falta cargar a cada franquiciado.'}
                </p>
              </>
            )}
          </>
        )}

        {actual === 'Acuerdo' && (
          <>
            <div className="grilla">
              <Campo label="Vigente desde"><input type="month" value={acuerdo.vigenciaDesde} onChange={(e) => e.target.value && cambiarAcuerdo({ vigenciaDesde: e.target.value })} /></Campo>
              <Campo label="Moneda">
                <select id="acuerdo-moneda" value={moneda} onChange={(e) => cambiarAcuerdo({ moneda: e.target.value })}>
                  <option value="USD">USD (se convierte a MEP venta)</option><option value="ARS">Pesos</option>
                </select>
              </Campo>
              {moneda === 'ARS' && (
                <>
                  <Campo label="Ajuste">
                    <select id="acuerdo-ajuste" value={acuerdo.ajusteIpc?.activo ? 'ipc' : 'no'} onChange={(e) => cambiarAcuerdo({ ajusteIpc: e.target.value === 'ipc' ? { ...acuerdo.ajusteIpc, activo: true } : undefined })}>
                      <option value="no">Sin ajuste</option><option value="ipc">Por IPC mensual</option>
                    </select>
                  </Campo>
                  {acuerdo.ajusteIpc?.activo && (
                    <Campo label="El monto es el pactado en"><input id="acuerdo-mes-base" type="month" value={acuerdo.ajusteIpc.mesBase ?? ''} onChange={(e) => cambiarAcuerdo({ ajusteIpc: { ...acuerdo.ajusteIpc, mesBase: e.target.value || undefined } })} /></Campo>
                  )}
                </>
              )}
            </div>

            <h3>Cómo paga</h3>
            <div className="modelos">
              {MODELOS.map((m) => (
                <label key={m.id} className={`modelo${modelo === m.id ? ' elegido' : ''}`}>
                  <input type="radio" name="modelo" id={`modelo-${m.id}`} checked={modelo === m.id} onChange={() => cambiarModelo(m.id)} />
                  <span><strong>{m.nombre}</strong><small>{m.ayuda}</small></span>
                </label>
              ))}
            </div>

            {modelo === 'fijo' && (
              <>
                <div className="grilla">
                  <Campo label={`Monto mensual (${moneda})`}><input id="fee-fijo" type="number" step="any" value={acuerdo.feeFijo.monto ?? ''} onChange={(e) => cambiarAcuerdo({ feeFijo: { ...acuerdo.feeFijo, monto: num(e.target.value) } })} /></Campo>
                  <Campo label="Detalle en la liquidación"><input placeholder="Fee mensual SaaS" value={acuerdo.feeFijo.detalle ?? ''} onChange={(e) => cambiarAcuerdo({ feeFijo: { ...acuerdo.feeFijo, detalle: e.target.value || undefined } })} /></Campo>
                </div>
                {c.tieneFranquiciados && <p className="ayuda nota">Con fee fijo se le cobra todo a la marca, sin importar cuántos locales o franquiciados tenga.</p>}
              </>
            )}
            {modelo === 'extras' && <p className="ayuda nota">Los extras se cargan en el paso Extras.</p>}

            {conLocales && (
              <>
                <h3>{c.tieneFranquiciados ? 'Locales propios' : 'Locales'}</h3>
                <div className="grilla">
                  <Campo label="Cantidad de locales"><input id="locales-propios" type="number" min="0" step="1" placeholder="0" value={c.locales?.propios ?? ''} onChange={(e) => cambiarLocales('propios', num(e.target.value))} /></Campo>
                  {acuerdo.feePorLocal && (
                    <Campo label={`Precio por local (${moneda})`}><input id="precio-local" type="number" step="any" value={acuerdo.feePorLocal.precio ?? ''} onChange={(e) => cambiarAcuerdo({ feePorLocal: { ...acuerdo.feePorLocal, precio: num(e.target.value) } })} /></Campo>
                  )}
                  {acuerdo.comision && CANALES.map((k) => (
                    <Campo key={k} label={`% sobre ${k}`}>
                      <input id={`comision-${k}`} type="number" step="any" min="0" placeholder="No cobra" value={aPct(acuerdo.comision[k])} onChange={(e) => cambiarAcuerdo({ comision: { ...acuerdo.comision, [k]: dePct(e.target.value) } })} />
                    </Campo>
                  ))}
                </div>

                {c.tieneFranquiciados && (
                  <>
                    <h3>Locales franquiciados</h3>
                    {paganFranquiciados ? (
                      <p className="ayuda nota">Cada franquiciado y cuántos locales tiene se cargan en el paso siguiente.</p>
                    ) : (
                      <div className="grilla">
                        <Campo label="Cantidad de locales"><input id="locales-franquiciados" type="number" min="0" step="1" placeholder="0" value={c.locales?.franquiciados ?? ''} onChange={(e) => cambiarLocales('franquiciados', num(e.target.value))} /></Campo>
                      </div>
                    )}
                    <label className="check">
                      <input id="franquiciados-igual" type="checkbox" checked={!distinto} onChange={(e) => setDistinto(!e.target.checked)} />
                      Pagan lo mismo que los propios
                    </label>
                    {distinto && (
                      <>
                        <div className="grilla">
                          {acuerdo.feePorLocal && (
                            <Campo label={`Precio por local (${moneda})`}><input id="precio-franquiciado" type="number" step="any" placeholder="Igual que los propios" value={acuerdo.feePorLocal.precioFranquiciado ?? ''} onChange={(e) => cambiarAcuerdo({ feePorLocal: { ...acuerdo.feePorLocal, precioFranquiciado: num(e.target.value) } })} /></Campo>
                          )}
                          {acuerdo.comision && CANALES.map((k) => (
                            <Campo key={k} label={`% sobre ${k}`}>
                              <input
                                id={`comision-franquiciado-${k}`}
                                type="number"
                                step="any"
                                min="0"
                                placeholder={acuerdo.comision[k] != null ? 'Igual que los propios' : 'No cobra'}
                                value={aPct(acuerdo.comisionFranquiciado?.[k])}
                                onChange={(e) => cambiarAcuerdo({ comisionFranquiciado: { ...acuerdo.comisionFranquiciado, [k]: dePct(e.target.value) } })}
                              />
                            </Campo>
                          ))}
                        </div>
                        <p className="ayuda nota">Lo que dejes vacío queda igual que en los propios.{acuerdo.comision ? ' Un 0 en la comisión es que no la pagan.' : ''}</p>
                      </>
                    )}
                  </>
                )}

                {acuerdo.comision && <p className="ayuda nota">La comisión es sobre lo vendido el mes anterior, con IVA y sin costo de envío.</p>}

                {modelo === 'hibrido' && (
                  <>
                    <h3>Cómo se combinan fee y comisión</h3>
                    <div className="grilla">
                      <Campo label="Regla">
                        <select value={acuerdo.combinacion?.modo ?? 'suma'} onChange={(e) => cambiarAcuerdo({ combinacion: { ...acuerdo.combinacion, modo: e.target.value } })}>
                          <option value="suma">Se suman</option>
                          <option value="mayor">Lo que sea mayor (el fee funciona como mínimo)</option>
                          <option value="tope">Se suman, con tope de comisión</option>
                        </select>
                      </Campo>
                      {acuerdo.combinacion?.modo === 'tope' && (
                        <Campo label={`Tope de comisión (${moneda})`}><input type="number" step="any" value={acuerdo.combinacion.tope ?? ''} onChange={(e) => cambiarAcuerdo({ combinacion: { ...acuerdo.combinacion, tope: num(e.target.value) } })} /></Campo>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {actual === 'Franquiciados' && (
          <>
            <p className="ayuda">Con estos datos se le cobra a cada franquiciado y se le puede pasar su detalle.</p>
            {c.franquiciados.map((f, i) => (
              <div className="tarjeta-fila" key={f.id}>
                <div className="grilla">
                  <Campo label="Razón social"><input className="franquiciado-razon-social" value={f.razonSocial ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { razonSocial: e.target.value })} /></Campo>
                  <Campo label="CUIT"><input className="franquiciado-cuit" value={f.cuit ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { cuit: e.target.value })} /></Campo>
                  <Campo label="Cantidad de locales"><input className="franquiciado-locales" type="number" min="0" step="1" value={f.locales ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { locales: num(e.target.value) })} /></Campo>
                  <Campo label="Condición IVA">
                    <select value={f.condicionIva ?? 'Responsable Inscripto'} onChange={(e) => cambiarFila('franquiciados', i, { condicionIva: e.target.value })}>
                      <option>Responsable Inscripto</option><option>Monotributo</option><option>Exento</option>
                    </select>
                  </Campo>
                  <Campo label="Domicilio fiscal"><input value={f.domicilioFiscal ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { domicilioFiscal: e.target.value })} /></Campo>
                  <Campo label="Contacto"><input value={f.contacto?.nombre ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { contacto: { ...f.contacto, nombre: e.target.value } })} /></Campo>
                  <Campo label="Mail de cobranza"><input value={f.contacto?.email ?? ''} onChange={(e) => cambiarFila('franquiciados', i, { contacto: { ...f.contacto, email: e.target.value } })} /></Campo>
                </div>
                <button className="link peligro" onClick={() => quitarFila('franquiciados', i)}>Quitar</button>
              </div>
            ))}
            <button
              id="agregar-franquiciado"
              className="secundario"
              onClick={() => agregarFila('franquiciados', { id: idFranquiciado(), razonSocial: '', cuit: '', condicionIva: 'Responsable Inscripto', contacto: {}, locales: 1 })}
            >
              + Agregar franquiciado
            </button>
            {c.franquiciados.length > 0 && (
              <p className="ayuda nota">{totalFranquiciados} {totalFranquiciados === 1 ? 'local franquiciado' : 'locales franquiciados'} en total.</p>
            )}
          </>
        )}

        {actual === 'Extras' && (
          <>
            <p className="ayuda">Cargos que no dependen de los locales: hosting, servidores, desarrollos, reintegros. {paganFranquiciados ? 'Por defecto los paga la marca.' : 'Los paga la marca.'}</p>
            {c.extras.length > 0 && (
              <div className="scroll-x">
                <table className="tabla editable">
                  <thead>
                    <tr><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Moneda</th><th>IVA</th><th>Cuotas</th><th>Desde</th><th>Hasta</th>{paganFranquiciados && <th>Lo paga</th>}<th /></tr>
                  </thead>
                  <tbody>
                    {c.extras.map((x, i) => (
                      <tr key={i}>
                        <td><input value={x.concepto} onChange={(e) => cambiarFila('extras', i, { concepto: e.target.value })} /></td>
                        <td>
                          <select value={x.tipo} onChange={(e) => cambiarFila('extras', i, { tipo: e.target.value })}>
                            <option value="hosting">Hosting / cloud</option><option value="servidores">Servidores</option>
                            <option value="desarrollo">Desarrollo a medida</option><option value="reintegro">Reintegro</option>
                          </select>
                        </td>
                        <td><input type="number" step="any" value={x.monto ?? ''} onChange={(e) => cambiarFila('extras', i, { monto: num(e.target.value) })} /></td>
                        <td>
                          <select value={x.moneda} onChange={(e) => cambiarFila('extras', i, { moneda: e.target.value })}>
                            <option>USD</option><option>ARS</option>
                          </select>
                        </td>
                        <td>
                          <select value={x.conIva === false ? 'no' : 'si'} onChange={(e) => cambiarFila('extras', i, { conIva: e.target.value === 'si' })}>
                            <option value="si">21%</option><option value="no">Sin IVA</option>
                          </select>
                        </td>
                        <td className="cuotas">
                          <input type="number" min="1" placeholder="-" value={x.cuotas?.total ?? ''} onChange={(e) => cambiarFila('extras', i, { cuotas: e.target.value ? { total: Number(e.target.value), primera: x.cuotas?.primera ?? periodoActual() } : undefined })} />
                          {x.cuotas && <input type="month" title="Primera cuota" value={x.cuotas.primera} onChange={(e) => cambiarFila('extras', i, { cuotas: { ...x.cuotas, primera: e.target.value } })} />}
                        </td>
                        <td><input type="month" value={x.desde ?? ''} onChange={(e) => cambiarFila('extras', i, { desde: e.target.value || undefined })} /></td>
                        <td><input type="month" value={x.hasta ?? ''} onChange={(e) => cambiarFila('extras', i, { hasta: e.target.value || undefined })} /></td>
                        {paganFranquiciados && (
                          <td>
                            <select value={x.pagador ?? 'marca'} onChange={(e) => cambiarFila('extras', i, { pagador: e.target.value === 'marca' ? undefined : e.target.value })}>
                              <option value="marca">La marca</option>
                              {c.franquiciados.map((f) => <option key={f.id} value={f.id}>{f.razonSocial || 'Sin nombre'}</option>)}
                            </select>
                          </td>
                        )}
                        <td><button className="link peligro" aria-label="Quitar extra" onClick={() => quitarFila('extras', i)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="secundario" onClick={() => agregarFila('extras', { concepto: '', tipo: 'hosting', moneda: 'USD', conIva: true })}>+ Agregar extra</button>
            <p className="ayuda nota">Un local que abrió a mitad de mes se puede cobrar como un extra de ese mes solo (Desde y Hasta en el mismo mes).</p>
          </>
        )}

        {actual === 'Simulación' && <Simulacion cliente={armar()} />}
      </div>

      {error && <div className="alerta error">{error}</div>}
      <div className="acciones">
        <button className="secundario" onClick={paso === 0 ? onListo : () => irA(paso - 1)}>{paso === 0 ? 'Cancelar' : 'Atrás'}</button>
        {actual !== 'Simulación' ? (
          <button className="primario" onClick={() => irA(paso + 1)}>Siguiente</button>
        ) : (
          <button className="primario" onClick={guardar}>{editando ? 'Guardar cambios' : 'Crear cliente'}</button>
        )}
      </div>
    </section>
  );
}

function Simulacion({ cliente }) {
  const [periodo, setPeriodo] = useState(periodoMas(periodoActual(), 1));
  const [mep, setMep] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  async function simular() {
    setError('');
    try {
      setResultado(await api.simular({ cliente, periodo, mep: leerMonto(mep) || null }));
    } catch (e) {
      setResultado(null);
      setError(e.message);
    }
  }

  return (
    <>
      <p className="ayuda">Revisá lo que pagaría cada uno antes de guardar. La simulación no usa ventas, así que la comisión no aparece.</p>
      <div className="parametros">
        <label>Mes<input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} /></label>
        <label>Dólar MEP venta<input id="simulacion-mep" inputMode="decimal" placeholder="1.549,80" value={mep} onChange={(e) => setMep(e.target.value)} /></label>
        <button className="primario" onClick={simular}>Simular {nombrePeriodo(periodo)}</button>
      </div>
      {error && <div className="alerta error">{error}</div>}
      {resultado && (
        <>
          <div className="cabecera-cliente">
            <h2>Total {nombrePeriodo(periodo)}</h2>
            <span className="monto">{pesos(resultado.liquidaciones.reduce((s, l) => s + l.totales.netoArs, 0))}</span>
          </div>
          {resultado.liquidaciones.map((l) => <Liquidacion key={l.pagador.id} liquidacion={l} />)}
        </>
      )}
    </>
  );
}
