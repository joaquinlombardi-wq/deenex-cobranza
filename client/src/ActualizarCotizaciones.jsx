import { useEffect, useRef, useState } from 'react';
import Icono from './Iconos.jsx';
import { api } from './api.js';
import { puedeActualizar, pedirActualizacion, ultimaCorrida, resultadoIncierto, textoDelError } from './actualizarCotizaciones.js';
import { numero, nombrePeriodo, fechaCorta, fechaHora, porcentaje } from './formato.js';

// Mientras la tarea corre, la app pregunta cada tanto si ya dejó el resultado.
const CADA = 8000;
const PREGUNTAR_A_CLAUDE_CADA = 4; // vueltas: get_trigger cada ~30 segundos
const ESPERA_MAXIMA = 15 * 60000;
// El pedido en curso se recuerda en este navegador, para seguir esperando si se cambia de pantalla.
const CLAVE = 'deenex-cobranza.pedidoCotizaciones';

function recordarPedido(desde) {
  try {
    if (desde) localStorage.setItem(CLAVE, desde);
    else localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: solo se pierde la espera al cambiar de pantalla
  }
}

function pedidoGuardado() {
  try {
    const desde = localStorage.getItem(CLAVE);
    return desde && Date.now() - Date.parse(desde) < ESPERA_MAXIMA ? desde : null;
  } catch {
    return null;
  }
}

const hora = (publicado) => (publicado ? publicado.slice(11, 16) : null);
// Claude Code da las horas con nanosegundos; algunos navegadores solo leen hasta milisegundos.
const instante = (x) => (typeof x === 'number' ? x : Date.parse(String(x).replace(/(\.\d{3})\d+/, '$1')));

// "MEP venta 1.549,80 del 07/10/2026 (dolarhoy 10:44) · IPC de Agosto 2026: 1,9 %"
function Resultado({ ultima }) {
  const { mep, ipc, errores = [] } = ultima;
  return (
    <>
      <p className="dato-actualizado">
        {mep && (
          <span>
            MEP venta <strong>{numero(mep.venta)}</strong> del {fechaCorta(mep.fecha)}
            {hora(mep.publicado) && ` (dolarhoy ${hora(mep.publicado)})`}
          </span>
        )}
        {ipc && (
          <span>
            IPC de {nombrePeriodo(ipc.mes)}: <strong>{porcentaje(ipc.valor, 1)}%</strong>
          </span>
        )}
      </p>
      {errores.map((e, i) => (
        <p className="nota-descarga error" key={i}>No pude leer {e.fuente}: {e.mensaje}</p>
      ))}
    </>
  );
}

// Botón que trae el MEP venta de dolarhoy y el último IPC del INDEC, con lo último que se trajo.
export default function ActualizarCotizaciones({ onActualizado, compacto = false }) {
  const [disponible, setDisponible] = useState(null);
  const [ultima, setUltima] = useState(null);
  const [pedido, setPedido] = useState(() => {
    const desde = pedidoGuardado();
    return desde ? { desde } : null;
  });
  const [error, setError] = useState(null);
  const avisar = useRef(onActualizado);
  avisar.current = onActualizado;

  useEffect(() => {
    let vigente = true;
    puedeActualizar().then((si) => vigente && setDisponible(si));
    api.estadoCotizaciones().then((u) => vigente && setUltima(u)).catch(() => {});
    return () => { vigente = false; };
  }, []);

  function terminar(u) {
    recordarPedido(null);
    setPedido(null);
    setUltima(u);
    avisar.current?.(u);
  }

  // Espera el resultado: lo deja la tarea en cotizaciones/estado. Cada tanto le pregunta a Claude Code
  // si la corrida falló. La rutina despierta la conversación del hilo que la corre, y Claude Code da
  // la corrida por buena apenas la entrega, así que un "terminó" no quiere decir que ya haya valores.
  useEffect(() => {
    if (!pedido) return undefined;
    let vigente = true;
    let vuelta = 0;
    const id = setInterval(async () => {
      vuelta++;
      const u = await api.estadoCotizaciones().catch(() => null);
      if (!vigente) return;
      if (u?.inicio && u.inicio >= pedido.desde) return terminar(u);
      if (Date.now() - Date.parse(pedido.desde) > ESPERA_MAXIMA) {
        recordarPedido(null);
        setPedido(null);
        setError('La tarea está tardando mucho más de lo normal. Fijate en un rato si se actualizó; si no, tocá de nuevo.');
        return;
      }
      if (vuelta % PREGUNTAR_A_CLAUDE_CADA) return;
      const corrida = await ultimaCorrida();
      // Un minuto de margen por si los relojes no coinciden.
      if (!vigente || !corrida || !(instante(corrida.fired_at) >= Date.parse(pedido.desde) - 60000)) return;
      if (/fail|error|cancel/i.test(corrida.status ?? '')) {
        recordarPedido(null);
        setPedido(null);
        setError('La tarea falló antes de traer los valores. Probá de nuevo en un rato.');
      }
    }, CADA);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [pedido?.desde]);

  async function actualizar() {
    setError(null);
    const desde = new Date().toISOString();
    setPedido({ desde });
    recordarPedido(desde);
    try {
      const r = await pedirActualizacion();
      if (r.ultima) terminar(r.ultima);
    } catch (e) {
      if (resultadoIncierto(e)) {
        setPedido({ desde, aviso: textoDelError(e) });
        return;
      }
      recordarPedido(null);
      setPedido(null);
      setError(e.code ? textoDelError(e) : `No se pudo actualizar: ${e.message}`);
    }
  }

  if (disponible === false && !ultima) {
    return compacto ? null : (
      <div className="actualizar-cotizaciones">
        <p className="cuit">
          La actualización automática todavía no está activa. Mientras tanto podés traer el historial completo con "Importar historial" y cargar a mano lo que falte.
        </p>
      </div>
    );
  }
  return (
    <div className={`actualizar-cotizaciones${compacto ? ' compacto' : ''}`}>
      {!compacto && <h2>Dólar de dolarhoy e IPC del INDEC</h2>}
      {ultima ? (
        <>
          {!compacto && (
            <p className="cuit">
              Última actualización: {fechaHora(ultima.fin)}{ultima.pedido === 'automatico' ? ', la automática' : ''}.
            </p>
          )}
          <Resultado ultima={ultima} />
        </>
      ) : (
        !compacto && <p className="cuit">Todavía no se trajo nunca.</p>
      )}
      {disponible && (
        <div className="boton-excel">
          <button className={`${compacto ? 'secundario' : 'primario'} con-icono`} onClick={actualizar} disabled={Boolean(pedido)}>
            <Icono nombre="actualizar" tamano={18} />
            {pedido ? 'Buscando…' : 'Actualizar dólar e IPC'}
          </button>
          {pedido && (
            <span className="nota-descarga" role="status">
              {pedido.aviso ?? 'Buscando en dolarhoy y en el INDEC. Tarda un rato porque arranca una tarea aparte; podés seguir usando la app.'}
            </span>
          )}
        </div>
      )}
      {error && <p className="nota-descarga error" role="alert">{error}</p>}
    </div>
  );
}
