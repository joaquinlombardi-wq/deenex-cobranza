// En la versión con servidor el dólar y el IPC se traen solos una vez por día, la primera vez que
// alguien usa la app ese día (hora argentina): el servidor gratis se duerme cuando nadie lo usa, así
// que no puede esperar a una hora fija. Si la última corrida de hoy salió bien (la del día o la del
// botón), no hace nada; si falló, la reintenta pasado un rato.
import { fechaArgentina } from './fuentes.js';

/**
 * @param docs          la base del servidor (lee cotizaciones/estado)
 * @param actualizar    (pedido) => Promise<estado>, la actualización completa
 * @param revisarCada   cada cuánto vuelve a mirar la base como mucho (ms)
 * @param reintentarEn  cuánto espera después de una corrida que falló (ms)
 * @returns alUsar(): se llama en cada pedido a la app; devuelve la revisión en curso, si hay una
 */
export function crearActualizacionDiaria({
  docs, actualizar, reloj = () => Date.now(), revisarCada = 10 * 60000, reintentarEn = 30 * 60000, avisar = console.error,
}) {
  let proxima = 0;
  let enCurso = null;

  async function revisar(ahora) {
    const ultima = (await docs.get('cotizaciones/estado'))?.ultima;
    if (ultima?.ok && fechaArgentina(ultima.inicio) === fechaArgentina(new Date(ahora).toISOString())) return null;
    if (ahora - Date.parse(ultima?.inicio ?? '') < reintentarEn) return null;
    return actualizar('automatico');
  }

  return function alUsar() {
    const ahora = reloj();
    if (enCurso || ahora < proxima) return enCurso;
    proxima = ahora + revisarCada;
    enCurso = revisar(ahora)
      .catch((e) => avisar(`No pude actualizar el dólar y el IPC: ${e.message}`))
      .finally(() => { enCurso = null; });
    return enCurso;
  };
}
