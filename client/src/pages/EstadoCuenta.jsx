import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { estadoDeCuenta } from '../../../server/src/engine/cuentaCorriente.js';
import { pesos, numero, nombrePeriodo, hoyLocal, fechaCorta, leerMonto, ESTADOS_CUENTA } from '../formato.js';
import { ChipEstado } from './Clientes.jsx';

const MEDIOS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Cheque', 'Otro'];

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
    lineas.push(`${nombrePeriodo(c.periodo)}: ${pesos(c.montoArs)} · ${detalle}`);
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
        <span className="monto">
          {totales.saldoArs < 0 ? `A favor ${pesos(-totales.saldoArs)}` : `Saldo ${pesos(totales.saldoArs)}`}
        </span>
      </div>

      {pagador.cargos.length > 0 && (
        <div className="scroll-x">
          <table className="tabla movimientos">
            <thead>
              <tr><th>Mes</th><th>Vence</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {[...pagador.cargos].reverse().map((c) => (
                <FilaCargo key={c.periodo} cargo={c} abierto={abierto === c.periodo} onClick={() => setAbierto(abierto === c.periodo ? null : c.periodo)} />
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

function FilaCargo({ cargo: c, abierto, onClick }) {
  return (
    <>
      <tr className="fila-click" onClick={onClick}>
        <td><span className="flecha">{abierto ? '▾' : '▸'}</span> {nombrePeriodo(c.periodo)}</td>
        <td>{fechaCorta(c.vencimiento)}</td>
        <td className="num">{pesos(c.montoArs)}</td>
        <td className="num">{c.pagadoArs ? pesos(c.pagadoArs) : '-'}</td>
        <td className="num">{c.saldoArs ? pesos(c.saldoArs) : '-'}</td>
        <td>
          <ChipEstado estado={c.estado} />
          {c.estado === 'pagado' && c.pagadoEl && <span className="cuit"> el {fechaCorta(c.pagadoEl)}</span>}
        </td>
      </tr>
      {abierto && (
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

export default function EstadoCuenta({ cliente, onVolver, onEditar }) {
  const [cuenta, setCuenta] = useState(null);
  const hoy = hoyLocal();
  const cargar = () => api.cuenta(cliente.id).then(setCuenta);
  useEffect(() => { cargar(); }, [cliente.id]);

  const estado = cuenta ? estadoDeCuenta({ ...cuenta, hoy }) : null;
  const pagadores = estado?.pagadores ?? [];

  return (
    <section>
      <button className="link volver" onClick={onVolver}>← Clientes</button>
      <div className="titulo-accion">
        <div>
          <h1>{cliente.nombre}</h1>
          <p className="ayuda sin-margen">
            {[cliente.razonSocial, cliente.cuit && `CUIT ${cliente.cuit}`, cliente.contacto?.email].filter(Boolean).join(' · ') || 'Faltan los datos fiscales'}
            {' · '}vence el día {cliente.diaVencimiento ?? 10} de cada mes
          </p>
        </div>
        <button className="secundario" onClick={onEditar}>Editar cliente</button>
      </div>

      {estado && (
        <div className="resumen">
          <div>
            <span className="etiqueta">Saldo</span>
            <strong>{estado.totales.saldoArs < 0 ? `A favor ${pesos(-estado.totales.saldoArs)}` : pesos(estado.totales.saldoArs)}</strong>
          </div>
          <div><span className="etiqueta">Vencido</span><strong className={estado.totales.vencidoArs > 0 ? 'rojo' : ''}>{pesos(estado.totales.vencidoArs)}</strong></div>
          <div>
            <span className="etiqueta">Último pago</span>
            <strong className="chico">{estado.ultimoPago ? `${pesos(estado.ultimoPago.montoArs)} el ${fechaCorta(estado.ultimoPago.fecha)}` : 'Sin pagos'}</strong>
          </div>
        </div>
      )}

      {estado && pagadores.length === 0 && (
        <div className="panel vacio">
          <strong>Todavía no hay liquidaciones en la cuenta.</strong>
          <p>Generá el cierre del mes y tocá "Pasar a cuentas corrientes". Ahí aparece lo que debe cada mes y podés ir marcando los pagos.</p>
        </div>
      )}

      {pagadores.map((p) => (
        <CuentaPagador key={p.pagadorId} cliente={cliente} pagador={p} hoy={hoy} mostrarTitulo={pagadores.length > 1 || p.pagadorTipo !== 'marca'} onCambio={cargar} />
      ))}
    </section>
  );
}
