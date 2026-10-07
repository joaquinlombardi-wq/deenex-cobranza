// Usuario y clave para entrar (HTTP Basic): el navegador los pide una vez y después los manda solo en
// cada pedido, también en los de la API. Los desarrolladores que cargan ventas usan los mismos
// (curl -u usuario:clave).
import { createHash, timingSafeEqual } from 'node:crypto';

const huella = (texto) => createHash('sha256').update(texto, 'utf8').digest();

// `libres`: direcciones que no piden clave (la de salud, para el control del hosting).
export function pedirClave({ usuario, clave, libres = [] }) {
  const esperada = huella(`${usuario}:${clave}`);
  return (req, res, next) => {
    if (libres.includes(req.path)) return next();
    const [esquema, credenciales] = (req.get('authorization') ?? '').split(' ');
    if (/^basic$/i.test(esquema) && credenciales) {
      const dadas = Buffer.from(credenciales, 'base64').toString('utf8');
      if (timingSafeEqual(huella(dadas), esperada)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Deenex Cobranza", charset="UTF-8"');
    res.status(401).type('text').send('Hace falta el usuario y la clave de Deenex Cobranza.');
  };
}
