// Rutina de Claude Code que trae el dólar MEP de dolarhoy y el IPC del INDEC y los guarda en la base
// del artifact (instrucciones en server/scripts/rutina-cotizaciones.md). Corre sola cada día hábil y
// la arranca el botón "Actualizar dólar e IPC" por el conector Claude Code Remote. El id va en
// client/.env.artifact (VITE_RUTINA_COTIZACIONES); sin id, el botón no aparece.
export const RUTINA_COTIZACIONES = import.meta.env.VITE_RUTINA_COTIZACIONES || null;
