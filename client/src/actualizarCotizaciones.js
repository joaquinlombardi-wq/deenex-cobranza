// Botón "Actualizar dólar e IPC". En claude.ai la app no puede entrar a otras páginas, así que arranca
// la rutina que lo hace (por el conector Claude Code Remote) y espera a que deje el resultado en
// cotizaciones/estado. Con el servidor propio lo hace el servidor en el momento.
import { RUTINA_COTIZACIONES } from './rutina.js';

const enArtifact = import.meta.env.MODE === 'artifact';
const CONECTOR = 'Claude Code Remote';
// Lo que recibe la rutina cuando la arranca el botón: pisa el MEP del día con el de este momento.
const PEDIDO_BOTON = 'Pedido desde el botón Actualizar de la app (pedido: boton).';

const usarMcp = async () => {
  try {
    return (await window.claude?.use?.('mcp')) ?? null;
  } catch {
    return null;
  }
};

// Si el botón puede funcionar en esta vista.
export async function puedeActualizar() {
  if (!enArtifact) return true;
  return Boolean(RUTINA_COTIZACIONES && (await usarMcp()));
}

// Arranca la actualización. En claude.ai vuelve enseguida con { enCurso: true }; con el servidor
// vuelve con el resultado, { ultima }.
export async function pedirActualizacion() {
  if (!enArtifact) {
    const res = await fetch('/api/cotizaciones/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido: 'boton' }),
    });
    const datos = await res.json().catch(() => null);
    if (!res.ok) throw new Error(datos?.error ?? `Error ${res.status}`);
    return { ultima: datos.ultima };
  }
  const mcp = await usarMcp();
  if (!mcp) throw Object.assign(new Error('Sin conectores en esta vista'), { code: 'not_granted' });
  await mcp.callTool(CONECTOR, 'fire_trigger', { trigger_id: RUTINA_COTIZACIONES, text: PEDIDO_BOTON });
  return { enCurso: true };
}

// Busca la última corrida ({ status, fired_at, finished_at }) en lo que devuelve get_trigger.
function buscarCorrida(x, profundidad = 0) {
  if (!x || typeof x !== 'object' || profundidad > 3) return null;
  if (x.last_run && typeof x.last_run === 'object') return x.last_run;
  for (const v of Object.values(x)) {
    const r = buscarCorrida(v, profundidad + 1);
    if (r) return r;
  }
  return null;
}

// La última corrida de la rutina según Claude Code, o null si no se sabe.
export async function ultimaCorrida() {
  if (!enArtifact || !RUTINA_COTIZACIONES) return null;
  const mcp = await usarMcp();
  if (!mcp) return null;
  try {
    const r = await mcp.callTool(CONECTOR, 'get_trigger', { trigger_id: RUTINA_COTIZACIONES }, { cache: false });
    const payload = typeof r?.payload === 'string' ? JSON.parse(r.payload) : r?.payload;
    return buscarCorrida(payload);
  } catch {
    return null;
  }
}

// Cuando el conector no responde, la tarea puede haber arrancado igual.
export const resultadoIncierto = (e) => ['server_unavailable', 'upstream_error'].includes(e?.code);

// Qué decirle a Joaco según por qué no se pudo arrancar la tarea.
export function textoDelError(e) {
  switch (e?.code) {
    case 'server_not_connected':
      return 'Para usar el botón tiene que estar conectado Claude Code Remote en claude.ai (Configuración → Conectores).';
    case 'needs_reauth':
      return 'Hay que volver a conectar Claude Code Remote en claude.ai (Configuración → Conectores).';
    case 'selection_required':
      return 'Elegí qué conexión de Claude Code Remote usar en el aviso de claude.ai y tocá de nuevo.';
    case 'not_in_manifest':
    case 'consent_required':
      return 'No se dio permiso para arrancar la tarea. Se puede dar desde Permisos, en el menú de la app.';
    case 'blocked_by_policy':
    case 'approval_required':
      return 'La configuración de la cuenta no deja usar Claude Code Remote desde la app.';
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return 'El botón no funciona en esta vista de la app.';
    case 'server_unavailable':
    case 'upstream_error':
      return 'Claude Code Remote no respondió, así que no sé si la tarea arrancó. Si en un rato no aparece el valor nuevo, tocá de nuevo.';
    default:
      return `No se pudo arrancar la tarea: ${e?.message ?? 'error desconocido'}.`;
  }
}
