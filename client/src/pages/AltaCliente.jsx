import { useState } from 'react';
import { api } from '../api.js';
import { pesos, slug, periodoMas, periodoActual, nombrePeriodo, leerMonto } from '../formato.js';
import Liquidacion from './Liquidacion.jsx';

const PASOS = ['Marca', 'Franquiciados', 'Locales', 'Acuerdo', 'Extras', 'Simulación'];

const hoy = () => new Date().toISOString().slice(0, 10);

const clienteVacio = () => ({
  id: '',
  nombre: '',
  razonSocial: '',
  cuit: '',
  condicionIva: 'Responsable Inscripto',
  domicilioFiscal: '',
  contacto: { nombre: '', email: '', telefono: '' },
  quienPaga: 'marca',
  franquiciados: [],
  locales: [],
  acuerdos: [{ vigenciaDesde: periodoActual(), moneda: 'USD', combinacion: { modo: 'suma' }, prorrateo: { modo: 'completo' } }],
  extras: [],
});

const num = (v) => (v === '' || v == null ? undefined : Number(v));
const aPct = (v) => (v == null ? '' : +(v * 100).toFixed(4));
const dePct = (v) => (v === '' ? undefined : Number(v) / 100);

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
  const [c, setC] = useState(() => (inicial ? structuredClone(inicial) : clienteVacio()));
  const [paso, setPaso] = useState(0);
  const [tieneFranquiciados, setTieneFranquiciados] = useState(Boolean(inicial?.franquiciados?.length));
  const [error, setError] = useState('');

  const cambiar = (campo, valor) => setC((x) => ({ ...x, [campo]: valor }));
  const acuerdo = [...c.acuerdos].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  const cambiarAcuerdo = (cambios) => setC((x) => ({ ...x, acuerdos: x.acuerdos.map((a) => (a === acuerdo ? { ...a, ...cambios } : a)) }));
  const cambiarFila = (lista, i, cambios) => setC((x) => ({ ...x, [lista]: x[lista].map((f, j) => (j === i ? { ...f, ...cambios } : f)) }));
  const agregarFila = (lista, fila) => setC((x) => ({ ...x, [lista]: [...x[lista], fila] }));
  const quitarFila = (lista, i) => setC((x) => ({ ...x, [lista]: x[lista].filter((_, j) => j !== i) }));

  const pasos = PASOS.filter((p) => p !== 'Franquiciados' || tieneFranquiciados);
  const actual = pasos[paso];

  async function guardar() {
    setError('');
    try {
      const datos = { ...c, id: c.id || slug(c.nombre), franquiciados: tieneFranquiciados ? c.franquiciados : [] };
      if (!tieneFranquiciados) datos.quienPaga = 'marca';
      await (editando ? api.actualizarCliente(datos) : api.crearCliente(datos));
      onListo();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section>
      <h1>{editando ? `Editar ${inicial.nombre}` : 'Nuevo cliente'}</h1>
      <ol className="pasos">
        {pasos.map((p, i) => (
          <li key={p} className={i === paso ? 'actual' : i < paso ? 'hecho' : ''} onClick={() => setPaso(i)}>
            <span>{i + 1}</span> {p}
          </li>
        ))}
      </ol>

      <div className="panel formulario">
        {actual === 'Marca' && (
          <>
            <div className="grilla">
              <Campo label="Nombre comercial"><input value={c.nombre} onChange={(e) => cambiar('nombre', e.target.value)} /></Campo>
              <Campo label="Razón social"><input value={c.razonSocial} onChange={(e) => cambiar('razonSocial', e.target.value)} /></Campo>
              <Campo label="CUIT"><input placeholder="30-12345678-9" value={c.cuit} onChange={(e) => cambiar('cuit', e.target.value)} /></Campo>
              <Campo label="Condición frente al IVA">
                <select value={c.condicionIva} onChange={(e) => cambiar('condicionIva', e.target.value)}>
                  <option>Responsable Inscripto</option><option>Monotributo</option><option>Exento</option>
                </select>
              </Campo>
              <Campo label="Domicilio fiscal" ancho><input value={c.domicilioFiscal} onChange={(e) => cambiar('domicilioFiscal', e.target.value)} /></Campo>
            </div>
            <h3>Contacto de cobranza</h3>
            <div className="grilla">
              {['nombre', 'email', 'telefono'].map((k) => (
                <Campo key={k} label={{ nombre: 'Nombre', email: 'Mail', telefono: 'Teléfono' }[k]}>
                  <input value={c.contacto?.[k] ?? ''} onChange={(e) => cambiar('contacto', { ...c.contacto, [k]: e.target.value })} />
                </Campo>
              ))}
            </div>
            <h3>Franquicias</h3>
            <div className="opciones">
              <label><input type="radio" checked={!tieneFranquiciados} onChange={() => setTieneFranquiciados(false)} /> Solo locales propios</label>
              <label><input type="radio" checked={tieneFranquiciados} onChange={() => setTieneFranquiciados(true)} /> Tiene franquiciados</label>
            </div>
            {tieneFranquiciados && (
              <div className="opciones">
                <span className="etiqueta">¿Quién paga?</span>
                <label><input type="radio" checked={c.quienPaga === 'marca'} onChange={() => cambiar('quienPaga', 'marca')} /> La marca paga todo</label>
                <label><input type="radio" checked={c.quienPaga === 'franquiciados'} onChange={() => cambiar('quienPaga', 'franquiciados')} /> Cada franquiciado paga sus locales</label>
              </div>
            )}
          </>
        )}

        {actual === 'Franquiciados' && (
          <>
            <p className="ayuda">Con estos datos se le cobra y se le manda el detalle directo a cada franquiciado.</p>
            {c.franquiciados.map((f, i) => (
              <div className="tarjeta-fila" key={i}>
                <div className="grilla">
                  <Campo label="Razón social"><input value={f.razonSocial} onChange={(e) => cambiarFila('franquiciados', i, { razonSocial: e.target.value })} /></Campo>
                  <Campo label="CUIT"><input value={f.cuit} onChange={(e) => cambiarFila('franquiciados', i, { cuit: e.target.value })} /></Campo>
                  <Campo label="Condición IVA">
                    <select value={f.condicionIva} onChange={(e) => cambiarFila('franquiciados', i, { condicionIva: e.target.value })}>
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
              className="secundario"
              onClick={() => agregarFila('franquiciados', { id: `f-${Date.now()}`, razonSocial: '', cuit: '', condicionIva: 'Responsable Inscripto', contacto: {} })}
            >
              + Agregar franquiciado
            </button>
          </>
        )}

        {actual === 'Locales' && (
          <>
            <table className="tabla editable">
              <thead>
                <tr><th>Nombre</th><th>Id en la plataforma</th><th>Tipo</th>{tieneFranquiciados && <th>Franquiciado</th>}<th>Alta</th><th>Baja</th><th>Precio propio</th><th /></tr>
              </thead>
              <tbody>
                {c.locales.map((l, i) => (
                  <tr key={i}>
                    <td><input value={l.nombre} onChange={(e) => cambiarFila('locales', i, { nombre: e.target.value })} /></td>
                    <td><input value={l.plataformaId ?? ''} placeholder={l.id} onChange={(e) => cambiarFila('locales', i, { plataformaId: e.target.value || undefined })} /></td>
                    <td>
                      <select value={l.tipo} onChange={(e) => cambiarFila('locales', i, { tipo: e.target.value })}>
                        <option value="propio">Propio</option>
                        {tieneFranquiciados && <option value="franquiciado">Franquiciado</option>}
                      </select>
                    </td>
                    {tieneFranquiciados && (
                      <td>
                        {l.tipo === 'franquiciado' && (
                          <select value={l.franquiciadoId ?? ''} onChange={(e) => cambiarFila('locales', i, { franquiciadoId: e.target.value })}>
                            <option value="">Elegir</option>
                            {c.franquiciados.map((f) => <option key={f.id} value={f.id}>{f.razonSocial || 'Sin nombre'}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    <td><input type="date" value={l.alta} onChange={(e) => cambiarFila('locales', i, { alta: e.target.value })} /></td>
                    <td><input type="date" value={l.baja ?? ''} onChange={(e) => cambiarFila('locales', i, { baja: e.target.value || undefined })} /></td>
                    <td><input type="number" step="any" placeholder="Del acuerdo" value={l.precio ?? ''} onChange={(e) => cambiarFila('locales', i, { precio: num(e.target.value) })} /></td>
                    <td><button className="link peligro" onClick={() => quitarFila('locales', i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="secundario"
              onClick={() => agregarFila('locales', { id: `${slug(c.nombre) || 'local'}-${c.locales.length + 1}-${Date.now() % 10000}`, nombre: '', tipo: 'propio', alta: hoy() })}
            >
              + Agregar local
            </button>
          </>
        )}

        {actual === 'Acuerdo' && (
          <>
            <div className="grilla">
              <Campo label="Vigente desde"><input type="month" value={acuerdo.vigenciaDesde} onChange={(e) => cambiarAcuerdo({ vigenciaDesde: e.target.value })} /></Campo>
              <Campo label="Moneda">
                <select value={acuerdo.moneda} onChange={(e) => cambiarAcuerdo({ moneda: e.target.value })}>
                  <option value="USD">USD (se convierte a MEP venta)</option><option value="ARS">Pesos</option>
                </select>
              </Campo>
              {acuerdo.moneda === 'ARS' && (
                <>
                  <Campo label="Ajuste">
                    <select value={acuerdo.ajusteIpc?.activo ? 'ipc' : 'no'} onChange={(e) => cambiarAcuerdo({ ajusteIpc: { ...acuerdo.ajusteIpc, activo: e.target.value === 'ipc' } })}>
                      <option value="no">Sin ajuste</option><option value="ipc">Por IPC mensual</option>
                    </select>
                  </Campo>
                  {acuerdo.ajusteIpc?.activo && (
                    <Campo label="Monto base vale para el mes"><input type="month" value={acuerdo.ajusteIpc.mesBase ?? ''} onChange={(e) => cambiarAcuerdo({ ajusteIpc: { ...acuerdo.ajusteIpc, mesBase: e.target.value } })} /></Campo>
                  )}
                </>
              )}
            </div>

            <h3><label><input type="checkbox" checked={Boolean(acuerdo.feePorLocal)} onChange={(e) => cambiarAcuerdo({ feePorLocal: e.target.checked ? {} : undefined })} /> Fee por local</label></h3>
            {acuerdo.feePorLocal && (
              <div className="grilla">
                <Campo label={`Precio por local (${acuerdo.moneda})`}><input type="number" step="any" value={acuerdo.feePorLocal.precio ?? ''} onChange={(e) => cambiarAcuerdo({ feePorLocal: { ...acuerdo.feePorLocal, precio: num(e.target.value) } })} /></Campo>
                <Campo label="Precio locales propios (opcional)"><input type="number" step="any" value={acuerdo.feePorLocal.precioPropio ?? ''} onChange={(e) => cambiarAcuerdo({ feePorLocal: { ...acuerdo.feePorLocal, precioPropio: num(e.target.value) } })} /></Campo>
                {tieneFranquiciados && (
                  <Campo label="Precio franquiciados (opcional)"><input type="number" step="any" value={acuerdo.feePorLocal.precioFranquiciado ?? ''} onChange={(e) => cambiarAcuerdo({ feePorLocal: { ...acuerdo.feePorLocal, precioFranquiciado: num(e.target.value) } })} /></Campo>
                )}
                <Campo label="Local que abre o cierra en el mes">
                  <select value={acuerdo.prorrateo?.modo ?? 'completo'} onChange={(e) => cambiarAcuerdo({ prorrateo: { ...acuerdo.prorrateo, modo: e.target.value } })}>
                    <option value="completo">Paga el mes completo</option>
                    <option value="proporcional">Proporcional a los días</option>
                    <option value="corte">No paga si abrió después del día…</option>
                  </select>
                </Campo>
                {acuerdo.prorrateo?.modo === 'corte' && (
                  <Campo label="Día de corte"><input type="number" min="1" max="31" value={acuerdo.prorrateo.dia ?? ''} onChange={(e) => cambiarAcuerdo({ prorrateo: { ...acuerdo.prorrateo, dia: num(e.target.value) } })} /></Campo>
                )}
              </div>
            )}

            <h3><label><input type="checkbox" checked={Boolean(acuerdo.comision)} onChange={(e) => cambiarAcuerdo({ comision: e.target.checked ? {} : undefined })} /> Comisión por local (mes vencido)</label></h3>
            {acuerdo.comision && (
              <div className="grilla">
                <Campo label="% sobre delivery"><input type="number" step="any" placeholder="No cobra" value={aPct(acuerdo.comision.delivery)} onChange={(e) => cambiarAcuerdo({ comision: { ...acuerdo.comision, delivery: dePct(e.target.value) } })} /></Campo>
                <Campo label="% sobre takeaway"><input type="number" step="any" placeholder="No cobra" value={aPct(acuerdo.comision.takeaway)} onChange={(e) => cambiarAcuerdo({ comision: { ...acuerdo.comision, takeaway: dePct(e.target.value) } })} /></Campo>
                <p className="ayuda ancho">Sobre las ventas del mes anterior con IVA y sin costo de envío.</p>
              </div>
            )}

            <h3><label><input type="checkbox" checked={Boolean(acuerdo.feeFijo)} onChange={(e) => cambiarAcuerdo({ feeFijo: e.target.checked ? {} : undefined })} /> Fee mensual fijo</label></h3>
            {acuerdo.feeFijo && (
              <div className="grilla">
                <Campo label={`Monto mensual (${acuerdo.moneda})`}><input type="number" step="any" value={acuerdo.feeFijo.monto ?? ''} onChange={(e) => cambiarAcuerdo({ feeFijo: { ...acuerdo.feeFijo, monto: num(e.target.value) } })} /></Campo>
                <Campo label="Detalle en la liquidación"><input placeholder="Fee mensual SaaS" value={acuerdo.feeFijo.detalle ?? ''} onChange={(e) => cambiarAcuerdo({ feeFijo: { ...acuerdo.feeFijo, detalle: e.target.value || undefined } })} /></Campo>
              </div>
            )}

            {acuerdo.comision && (acuerdo.feePorLocal || acuerdo.feeFijo) && (
              <>
                <h3>Híbrido: cómo se combinan fee y comisión</h3>
                <div className="grilla">
                  <Campo label="Regla">
                    <select value={acuerdo.combinacion?.modo ?? 'suma'} onChange={(e) => cambiarAcuerdo({ combinacion: { ...acuerdo.combinacion, modo: e.target.value } })}>
                      <option value="suma">Se suman</option>
                      <option value="mayor">Lo que sea mayor (el fee funciona como mínimo)</option>
                      <option value="tope">Se suman, con tope de comisión</option>
                    </select>
                  </Campo>
                  {acuerdo.combinacion?.modo === 'tope' && (
                    <Campo label={`Tope de comisión (${acuerdo.moneda})`}><input type="number" step="any" value={acuerdo.combinacion.tope ?? ''} onChange={(e) => cambiarAcuerdo({ combinacion: { ...acuerdo.combinacion, tope: num(e.target.value) } })} /></Campo>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {actual === 'Extras' && (
          <>
            <p className="ayuda">Cargos que no dependen de los locales. Por defecto los paga la marca.</p>
            <table className="tabla editable">
              <thead>
                <tr><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Moneda</th><th>IVA</th><th>Cuotas</th><th>Desde</th><th>Hasta</th>{tieneFranquiciados && <th>Lo paga</th>}<th /></tr>
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
                    {tieneFranquiciados && (
                      <td>
                        <select value={x.pagador ?? 'marca'} onChange={(e) => cambiarFila('extras', i, { pagador: e.target.value })}>
                          <option value="marca">La marca</option>
                          {c.franquiciados.map((f) => <option key={f.id} value={f.id}>{f.razonSocial}</option>)}
                        </select>
                      </td>
                    )}
                    <td><button className="link peligro" onClick={() => quitarFila('extras', i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="secundario" onClick={() => agregarFila('extras', { concepto: '', tipo: 'hosting', moneda: 'USD', conIva: true })}>+ Agregar extra</button>
          </>
        )}

        {actual === 'Simulación' && <Simulacion cliente={{ ...c, id: c.id || slug(c.nombre), quienPaga: tieneFranquiciados ? c.quienPaga : 'marca' }} />}
      </div>

      {error && <div className="alerta error">{error}</div>}
      <div className="acciones">
        <button className="secundario" onClick={paso === 0 ? onListo : () => setPaso(paso - 1)}>{paso === 0 ? 'Cancelar' : 'Atrás'}</button>
        {paso < pasos.length - 1 ? (
          <button className="primario" onClick={() => setPaso(paso + 1)}>Siguiente</button>
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
      const ipc = await api.ipc().catch(() => ({}));
      setResultado(await api.simular({ cliente, periodo, mep: leerMonto(mep) || null, ipc }));
    } catch (e) {
      setResultado(null);
      setError(e.message);
    }
  }

  return (
    <>
      <p className="ayuda">Revisá lo que pagaría cada pagador antes de guardar. La simulación no usa ventas, así que la comisión no aparece.</p>
      <div className="parametros">
        <label>Mes<input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></label>
        <label>Dólar MEP venta<input inputMode="decimal" placeholder="1.549,80" value={mep} onChange={(e) => setMep(e.target.value)} /></label>
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
