// Qué rutas de documento ('coleccion/id') acepta la base. Aparte de documentos.js para que la app
// también lo pueda usar (al revisar un respaldo) sin traer mongoose.
const SEGMENTO = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

export function validarRuta(path, segmentos) {
  const partes = path.split('/');
  if (partes.length !== segmentos || !partes.every((p) => SEGMENTO.test(p) && p !== '.' && p !== '..')) {
    throw Object.assign(new Error(`Ruta inválida: ${path}`), { status: 400 });
  }
  return partes;
}
