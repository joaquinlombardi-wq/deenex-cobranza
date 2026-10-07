// La dirección de Atlas y la clave se pegan a mano en Render. Los errores típicos al pegar que tienen
// una sola lectura posible se arreglan acá; para el resto, queRevisar dice qué mirar.

// Comillas o espacios alrededor de lo pegado.
export const sinComillas = (texto) => texto.trim().replace(/^(["'])(.*)\1$/s, '$2').trim();

// Lo que no puede ir suelto en la contraseña, sin tocar lo que ya venía escapado (%40).
const escaparClave = (clave) => clave.replace(/%(?![0-9A-Fa-f]{2})|[:/?#[\]@]/g, (c) => encodeURIComponent(c));

export function limpiarDireccion(uri) {
  const limpia = sinComillas(uri).replace(/^MONGODB_URI\s*=\s*/i, '');
  // La última @ separa la contraseña del cluster: en la parte del cluster nunca hay una.
  const partes = limpia.match(/^(mongodb(?:\+srv)?:\/\/)([^:@]*):(.*)@([^@]*)$/s);
  if (!partes) return limpia;
  const [, esquema, usuario, clave, cluster] = partes;
  // Atlas muestra la contraseña como <db_password>: si quedaron los < >, se sacan.
  return `${esquema}${usuario}:${escaparClave(clave.replace(/^<(.*)>$/s, '$1'))}@${cluster}`;
}

// Qué revisar según lo que contestó Mongo, en las palabras de las pantallas de Render y Atlas.
export function queRevisar(error, uri = '') {
  const mensaje = String(error?.message ?? error);
  if (/db_password/.test(uri)) return 'En MONGODB_URI quedó «db_password»: poné en su lugar la contraseña del usuario de la base.';
  if (/Invalid scheme/i.test(mensaje)) return 'MONGODB_URI tiene que empezar justo con mongodb+srv:// y llevar solo la dirección de Atlas.';
  if (/bad auth|authentication failed/i.test(mensaje)) {
    return 'Atlas rechazó el usuario o la contraseña: va la del usuario de la base (Database Users), no la de tu cuenta de Atlas.';
  }
  if (/querySrv|ENOTFOUND/i.test(mensaje)) return 'No encuentro el cluster: revisá lo que va después de la @ en MONGODB_URI.';
  if (/Could not connect to any servers|Server selection timed out/i.test(mensaje)) {
    return 'Atlas no deja entrar: en Network Access tiene que estar 0.0.0.0/0, en «Active».';
  }
  return 'Revisá MONGODB_URI (usuario y contraseña incluidos) y que en Atlas, Network Access, esté permitida la entrada desde 0.0.0.0/0.';
}
