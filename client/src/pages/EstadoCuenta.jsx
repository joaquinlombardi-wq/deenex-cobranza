import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { estadoDeCuenta } from '../../../server/src/engine/cuentaCorriente.js';
import { usaLocales } from '../../../server/src/engine/clientes.js';
import { pesos, numero, nombrePeriodo, hoyLocal, fechaCorta, fechaHora, leerMonto, ESTADOS_CUENTA } from '../formato.js';
import { ChipEstado, saldoTexto } from './Clientes.jsx';
import MesAMes from './MesAMes.jsx';

const MEDIOS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Cheque', 'Otro'];

const esSaldoAnterior = (c) => c.tipo === 'saldoAnterior';
const claveCargo = (c) => c.id ?? c.periodo;
// Nombre del cargo: el mes que se cobró o, si es un saldo de antes, su concepto.
const nombreCargo = (c) => (esSaldoAnterior(c) ? c.concepto : nombrePeriodo(c.periodo));

// Texto para mandarle al cliente (o al franquiciado) por mail o WhatsApp.
function resumenTexto(cliente, pagador, hoy) {
  const lineas = [
    `Estado de cuenta · ${pagador.pagadorNombre}${pagador.cuit ? ` (CUIT ${pagador.cuit})` : ''}`,
    `Al ${fechaCorta(hoy)}`,
    '',
  ];
  for (const c of [...pagador.cargos].reverse()) {
    const estado = ESTADOS_CUENTA[c.estado].texto;
    const detalle = c.estado === 'pagado'
      ? `pagado${c.pagadoEl ? ` el ${fechaCorta(c.pagadoEl)}` : ''}`
      : `${estado.toLowerCase()} · vence ${fechaCorta(c.vencimiento)}${c.pagadoArs > 0 ? ` · pagado ${pesos(c.pagadoArs)}, resta ${pesos(c.saldoArs)}` : ''}`;
    lineas.push(`${nombreCargo(c)}: ${pesos(c.montoArs)} · ${detalle}`);
  }
  lineas.push('');
  const saldo = pagador.totales.saldoArs;
  lineas.push(saldo > 0 ? `Saldo a pagar: ${pesos(saldo)}` : saldo < 0 ? `Saldo a favor: ${pesos(-saldo)}` : 'Sin saldo pendiente.');
  if (cliente.nombre !== pagador.pagadorNombre) lineas.push(`Marca: ${cliente.nombre}`);
  return lineas.join('\n');
}

function FormPago({ saldo, onGuardar, onCancelar }) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [monto, setMonto] = useState(saldo > 0 ? numero(saldo) : '');
  const [medio, setMedio] = useState(MEDIOS[0]);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    const valor = leerMonto(monto);
    if (!(valor > 0)) return setError('El monto tiene que ser mayor a cero, por ejemplo 1.057.796,52.');
    if (!fecha) return setError('Elegí la fecha del pago.');
    await onGuardar({ fecha, montoArs: Math.round(valor * 100) / 100, medio, nota: nota.trim() });
  }

  return (
    <form className="form-pago" onSubmit={guardar}>
      <label>Fecha<input id="pago-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      <label>Monto ($)<input id="pago-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
      <label>
        Medio
        <select id="pago-medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
          {MEDIOS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="ancho">Nota<input id="pago-nota" placeholder="Nro. de transferencia, factura, etc." value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      <div className="botones">
        <button type="submit" className="primario">Guardar pago</button>
        <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <div className="alerta error ancho">{error}</div>}
    </form>
  );
}

function CuentaPagador({ cliente, pagador, hoy, mostrarTitulo, onCambio }) {
  const [abierto, setAbierto] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [borrando, setBorrando] = useState(null);
  const [copia, setCopia] = useState(null);

  async function guardarPago(pago) {
    await api.registrarPago({ ...pago, clienteId: cliente.id, pagadorId: pagador.pagadorId, pagadorNombre: pagador.pagadorNombre });
    setRegistrando(false);
    onCambio();
  }

  async function borrar(id) {
    await api.borrarPago(id);
    setBorrando(null);
    onCambio();
  }

  async function borrarSaldo(id) {
    await api.borrarSaldoAnterior(id);
    setAbierto(null);
    onCambio();
  }

  async function copiar() {
    const texto = resumenTexto(cliente, pagador, hoy);
    try {
      await navigator.clipboard.writeText(texto);
      setCopia({ ok: true, texto });
    } catch {
      setCopia({ ok: false, texto });
    }
  }

  const { totales } = pagador;
  return (
    <div className="panel cuenta">
      <div className="cabecera-cliente">
        <div className="titulo-pagador">
          {mostrarTitulo && <span className={`chip ${pagador.pagadorTipo}`}>{pagador.pagadorTipo === 'marca' ? 'Marca' : 'Franquiciado'}</span>}
          <h2>{pagador.pagadorNombre}</h2>
          <ChipEstado estado={pagador.estado} />
        </div>
        <span className={`monto ${totales.vencidoArs > 0 ? 'rojo' : ''}`}>{saldoTexto(pagador)}</span>
      </div>

      {pagador.cargos.length > 0 && (
        <div className="scroll-x">
          <table className="tabla movimientos">
            <thead>
              <tr><th>Mes</th><th>Vence</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {[...pagador.cargos].reverse().map((c) => (
                <FilaCargo
                  key={claveCargo(c)}
                  cargo={c}
                  abierto={abierto === claveCargo(c)}
                  onClick={() => setAbierto(abierto === claveCargo(c) ? null : claveCargo(c))}
                  onBorrar={() => borrarSaldo(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Pagos</h3>
      {pagador.pagos.length === 0 && <p className="ayuda">Todavía no hay pagos registrados.</p>}
      {pagador.pagos.length > 0 && (
        <div className="scroll-x">
          <table className="tabla movimientos">
            <thead><tr><th>Fecha</th><th className="num">Monto</th><th>Medio</th><th>Nota</th><th /></tr></thead>
            <tbody>
              {[...pagador.pagos].reverse().map((p) => (
                <tr key={p.id}>
                  <td>{fechaCorta(p.fecha)}</td>
                  <td className="num">{pesos(p.montoArs)}</td>
                  <td>{p.medio}</td>
                  <td>{p.nota}</td>
                  <td className="acciones-fila">
                    {borrando === p.id ? (
                      <>
                        <span className="cuit">¿Borrar este pago?</span>
                        <button className="link peligro" onClick={() => borrar(p.id)}>Sí, borrar</button>
                        <button className="link" onClick={() => setBorrando(null)}>No</button>
                      </>
                    ) : (
                      <button className="link peligro" onClick={() => setBorrando(p.id)}>Borrar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {registrando ? (
        <FormPago saldo={totales.saldoArs} onGuardar={guardarPago} onCancelar={() => setRegistrando(false)} />
      ) : (
        <div className="botones">
          <button className="primario" onClick={() => setRegistrando(true)}>+ Registrar pago</button>
          <button className="secundario" onClick={copiar} disabled={!pagador.cargos.length}>Copiar resumen para el cliente</button>
        </div>
      )}
      {copia && (
        <div className={`alerta ${copia.ok ? 'ok' : 'aviso'}`}>
          {copia.ok ? 'Copiado. Pegalo en el mail o WhatsApp.' : 'No pude copiar solo: seleccioná el texto y copialo.'}
          {!copia.ok && <textarea readOnly rows={8} value={copia.texto} onFocus={(e) => e.target.select()} />}
        </div>
      )}
    </div>
  );
}

function FilaCargo({ cargo: c, abierto, onClick, onBorrar }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <tr className="fila-click" onClick={onClick}>
        <td><span className="flecha">{abierto ? '▾' : '▸'}</span> {nombreCargo(c)}</td>
        <td>{fechaCorta(c.vencimiento)}</td>
        <td className="num">{pesos(c.montoArs)}</td>
        <td className="num">{c.pagadoArs ? pesos(c.pagadoArs) : '-'}</td>
        <td className="num">{c.saldoArs ? pesos(c.saldoArs) : '-'}</td>
        <td>
          <ChipEstado estado={c.estado} />
          {c.estado === 'pagado' && c.pagadoEl && <span className="cuit"> el {fechaCorta(c.pagadoEl)}</span>}
        </td>
      </tr>
      {abierto && esSaldoAnterior(c) && (
        <tr className="detalle-cargo">
          <td colSpan={6}>
            <p className="cuit">Saldo de antes de usar el sistema, cargado a mano el {fechaHora(c.emitidoEn)}.</p>
            {confirmando ? (
              <span className="acciones-fila izquierda">
                <span className="cuit">¿Borrar este saldo?</span>
                <button className="link peligro" onClick={onBorrar}>Sí, borrar</button>
                <button className="link" onClick={() => setConfirmando(false)}>No</button>
              </span>
            ) : (
              <button className="link peligro" onClick={() => setConfirmando(true)}>Borrar este saldo</button>
            )}
          </td>
        </tr>
      )}
      {abierto && !esSaldoAnterior(c) && (
        <tr className="detalle-cargo">
          <td colSpan={6}>
            <table className="renglones">
              <tbody>
                {(c.renglones ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.detalle}</td>
                    <td>{r.productoDux}</td>
                    <td className="num">{r.moneda} {numero(r.precioUnitario)} × {r.cantidad}</td>
                    <td className="num">{pesos(r.netoArs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.mep && <p className="cuit">Dólar MEP usado: {numero(c.mep)}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

// Lo que el pagador ya debía antes de empezar a usar el sistema (facturas viejas impagas).
function FormSaldoAnterior({ cliente, onGuardar, onCancelar }) {
  const pagadores = [
    { id: 'marca', nombre: cliente.razonSocial || cliente.nombre },
    ...(cliente.quienPaga === 'franquiciados' ? cliente.franquiciados.map((f) => ({ id: f.id, nombre: f.razonSocial || 'Franquiciado sin nombre' })) : []),
  ];
  const [pagadorId, setPagadorId] = useState('marca');
  const [fecha, setFecha] = useState(hoyLocal());
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    const valor = leerMonto(monto);
    if (!(valor > 0)) return setError('Poné cuánto debe, por ejemplo 1.004.929,20. Si tiene saldo a favor, registralo como un pago.');
    if (!fecha) return setError('Elegí cuándo venció.');
    try {
      await onGuardar({ pagadorId, fecha, montoArs: Math.round(valor * 100) / 100, concepto });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form-pago panel-form" onSubmit={guardar}>
      <p className="ancho sin-margen"><strong>Saldo anterior</strong> · lo que ya debía antes de usar el sistema. Los pagos lo cancelan primero.</p>
      {pagadores.length > 1 && (
        <label>
          Quién lo debe
          <select id="saldo-pagador" value={pagadorId} onChange={(e) => setPagadorId(e.target.value)}>
            {pagadores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      )}
      <label>Monto que debe ($)<input id="saldo-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
      <label>Venció el<input id="saldo-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      <label className="ancho">Concepto<input id="saldo-concepto" placeholder="Saldo anterior" value={concepto} onChange={(e) => setConcepto(e.target.value)} /></label>
      <div className="botones">
        <button type="submit" className="primario">Guardar saldo</button>
        <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <div className="alerta error ancho">{error}</div>}
    </form>
  );
}

const PESTANAS = [
  { id: 'cuenta', nombre: 'Cuenta corriente' },
  { id: 'mes', nombre: 'Locales y ventas' },
];

export default function EstadoCuenta({ cliente: inicial, pestanaInicial = 'cuenta', mesInicial, volverAlCierre, onVolver, onEditar }) {
  const [cliente, setCliente] = useState(inicial);
  const [cargado, setCargado] = useState(false);
  const [pestana, setPestana] = useState(pestanaInicial);
  const [cuenta, setCuenta] = useState(null);
  const [cargandoSaldo, setCargandoSaldo] = useState(false);
  const hoy = hoyLocal();
  const cargar = () => api.cuenta(inicial.id).then(setCuenta);
  useEffect(() => {
    cargar();
    api.cliente(inicial.id).then((c) => { setCliente(c); setCargado(true); }).catch(() => setCargado(true));
  }, [inicial.id]);

  const estado = cuenta ? estadoDeCuenta({ ...cuenta, hoy }) : null;
  const pagadores = estado?.pagadores ?? [];
  // Locales y ventas se cargan si algún acuerdo cobra por local o comisión.
  const conLocales = (cliente.acuerdos ?? []).some(usaLocales);
  const vista = cargado && !conLocales ? 'cuenta' : pestana;

  async function guardarSaldo(saldo) {
    await api.cargarSaldoAnterior({ ...saldo, clienteId: cliente.id });
    setCargandoSaldo(false);
    cargar();
  }

  function abrirSaldo() {
    setPestana('cuenta');
    setCargandoSaldo(true);
  }

  return (
    <section>
      <button className="link volver" onClick={onVolver}>← {volverAlCierre ? `Cierre de ${nombrePeriodo(volverAlCierre)}` : 'Clientes'}</button>
      <div className="titulo-accion">
        <div>
          <h1>{cliente.nombre}</h1>
          <p className="ayuda sin-margen">
            {[cliente.razonSocial, cliente.cuit && `CUIT ${cliente.cuit}`, cliente.contacto?.email].filter(Boolean).join(' · ') || 'Faltan los datos fiscales'}
            {' · '}vence el día {cliente.diaVencimiento ?? 10} de cada mes
          </p>
        </div>
        <div className="botones sin-margen">
          <button className="secundario" onClick={abrirSaldo}>Cargar saldo anterior</button>
          <button className="secundario" onClick={() => onEditar(cliente)} disabled={!cargado}>Editar cliente</button>
        </div>
      </div>

      {conLocales && (
        <div className="pestanas" role="tablist" aria-label="Secciones del cliente">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              id={`pestana-${p.id}`}
              role="tab"
              aria-selected={vista === p.id}
              className={vista === p.id ? 'activa' : ''}
              onClick={() => setPestana(p.id)}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {vista === 'mes' && (cargado ? (
        <MesAMes cliente={cliente} mesInicial={mesInicial} onCambio={setCliente} />
      ) : (
        <p className="ayuda">Cargando el cliente…</p>
      ))}

      {vista === 'cuenta' && estado && (
        <div className="resumen">
          <div>
            <span className="etiqueta">Saldo</span>
            <strong>{saldoTexto(estado)}</strong>
          </div>
          <div><span className="etiqueta">Vencido</span><strong className={estado.totales.vencidoArs > 0 ? 'rojo' : ''}>{pesos(estado.totales.vencidoArs)}</strong></div>
          <div>
            <span className="etiqueta">Último pago</span>
            <strong className="chico">{estado.ultimoPago ? `${pesos(estado.ultimoPago.montoArs)} el ${fechaCorta(estado.ultimoPago.fecha)}` : 'Sin pagos'}</strong>
          </div>
        </div>
      )}

      {vista === 'cuenta' && cargandoSaldo && <FormSaldoAnterior cliente={cliente} onGuardar={guardarSaldo} onCancelar={() => setCargandoSaldo(false)} />}

      {vista === 'cuenta' && estado && pagadores.length === 0 && !cargandoSaldo && (
        <div className="panel vacio">
          <strong>Todavía no hay movimientos en la cuenta.</strong>
          <p>
            Lo de cada mes entra cuando generás el cierre y tocás "Pasar a cuentas corrientes". Si ya debía algo de antes de usar el sistema,
            cargalo como saldo anterior y los pagos lo van a cancelar primero.
          </p>
          <button className="secundario" onClick={() => setCargandoSaldo(true)}>Cargar saldo anterior</button>
        </div>
      )}

      {vista === 'cuenta' && pagadores.map((p) => (
        <CuentaPagador key={p.pagadorId} cliente={cliente} pagador={p} hoy={hoy} mostrarTitulo={pagadores.length > 1 || p.pagadorTipo !== 'marca'} onCambio={cargar} />
      ))}
    </section>
  );
}
