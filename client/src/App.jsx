import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icono from './Iconos.jsx';
import CierreMes from './pages/CierreMes.jsx';
import Historial from './pages/Historial.jsx';
import Clientes from './pages/Clientes.jsx';
import AltaCliente from './pages/AltaCliente.jsx';
import EstadoCuenta from './pages/EstadoCuenta.jsx';
import Ventas from './pages/Ventas.jsx';
import Cotizaciones from './pages/Cotizaciones.jsx';
import Respaldo from './pages/Respaldo.jsx';

const SECCIONES = [
  { id: 'cierre', nombre: 'Cierre del mes' },
  { id: 'historial', nombre: 'Historial' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'cotizaciones', nombre: 'Dólar e IPC' },
  { id: 'respaldo', nombre: 'Respaldo' },
];
// La versión con servidor arranca vacía: avisa cómo traer los datos de la de claude.ai.
const conServidor = import.meta.env.MODE !== 'artifact';

// Si el menú queda abierto o cerrado se recuerda en este navegador, cuando deja guardar.
const CLAVE_MENU = 'deenex-cobranza.menu';
function menuAbiertoGuardado() {
  try {
    return localStorage.getItem(CLAVE_MENU) !== 'cerrado';
  } catch {
    return true;
  }
}
function guardarMenu(abierto) {
  try {
    localStorage.setItem(CLAVE_MENU, abierto ? 'abierto' : 'cerrado');
  } catch {
    // Sin almacenamiento el menú arranca abierto la próxima vez.
  }
}

export default function App() {
  const [vista, setVista] = useState({ pagina: 'cierre' });
  const [guardaDatos, setGuardaDatos] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(menuAbiertoGuardado);
  const [menuCelular, setMenuCelular] = useState(false);
  const [sinClientes, setSinClientes] = useState(false);
  const revisarClientes = () => conServidor && api.clientes().then((l) => setSinClientes(l.length === 0)).catch(() => {});
  const ir = (pagina, extra = {}) => {
    setVista({ pagina, ...extra });
    setMenuCelular(false);
    window.scrollTo?.(0, 0);
    if (sinClientes) revisarClientes();
  };
  const irAlCierre = (periodo) => ir('cierre', { periodo });
  // Las ventas y los locales de un mes se cargan en la cuenta del cliente.
  const cargarMes = (cliente, mes, volverAlCierre) => ir('cuenta', { cliente, pestana: 'mes', mes, volverAlCierre });
  const seccion = ['alta', 'cuenta'].includes(vista.pagina) ? 'clientes' : vista.pagina;

  useEffect(() => {
    api.estado().then((e) => setGuardaDatos(e.guardaDatos));
    revisarClientes();
  }, []);

  useEffect(() => {
    if (!menuCelular) return undefined;
    const alTeclear = (e) => e.key === 'Escape' && setMenuCelular(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [menuCelular]);

  function alternarMenu() {
    guardarMenu(!menuAbierto);
    setMenuAbierto(!menuAbierto);
  }

  return (
    <div className={`app${menuAbierto ? '' : ' menu-cerrado'}${menuCelular ? ' menu-celular' : ''}`}>
      <aside id="menu-lateral" className="lateral" aria-label="Menú">
        <div className="marca-lateral">
          <span className="logo-deenex" role="img" aria-label="Deenex" />
          <span className="producto">Cobranza</span>
        </div>
        <nav>
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              className={seccion === s.id ? 'activo' : ''}
              aria-current={seccion === s.id ? 'page' : undefined}
              onClick={() => ir(s.id)}
            >
              <Icono nombre={s.id} />
              {s.nombre}
            </button>
          ))}
        </nav>
        <button className="boton-icono cerrar-celular" aria-label="Cerrar el menú" onClick={() => setMenuCelular(false)}>
          <Icono nombre="cerrar" />
        </button>
      </aside>
      <button
        className="manija"
        onClick={alternarMenu}
        aria-controls="menu-lateral"
        aria-expanded={menuAbierto}
        aria-label={menuAbierto ? 'Ocultar el menú' : 'Mostrar el menú'}
        title={menuAbierto ? 'Ocultar el menú' : 'Mostrar el menú'}
      >
        <Icono nombre={menuAbierto ? 'izquierda' : 'derecha'} tamano={16} />
      </button>
      {menuCelular && <div className="velo" onClick={() => setMenuCelular(false)} />}

      <div className="contenido">
        <header className="barra-celular">
          <button className="boton-icono" aria-label="Abrir el menú" aria-controls="menu-lateral" aria-expanded={menuCelular} onClick={() => setMenuCelular(true)}>
            <Icono nombre="menu" />
          </button>
          <span className="logo-deenex" role="img" aria-label="Deenex" />
          <span className="seccion-celular">{SECCIONES.find((s) => s.id === seccion)?.nombre}</span>
        </header>
        <main>
          {!guardaDatos && <div className="alerta aviso">Esta vista no puede guardar datos: lo que cargues se pierde al cerrar.</div>}
          {sinClientes && vista.pagina !== 'respaldo' && (
            <div className="alerta aviso sin-pasar">
              <span>Esta versión todavía no tiene clientes. Si ya usabas la app en claude.ai, traé tus datos con un respaldo.</span>
              <button className="link" onClick={() => ir('respaldo')}>Traer mis datos</button>
            </div>
          )}
          {vista.pagina === 'cierre' && (
            <CierreMes
              key={vista.periodo ?? 'cierre'}
              periodoInicial={vista.periodo}
              onIrCotizaciones={() => ir('cotizaciones')}
              onCargarMes={cargarMes}
            />
          )}
          {vista.pagina === 'historial' && <Historial onIrCierre={irAlCierre} />}
          {vista.pagina === 'ventas' && <Ventas onIrCierre={irAlCierre} />}
          {vista.pagina === 'cotizaciones' && <Cotizaciones />}
          {vista.pagina === 'respaldo' && <Respaldo onCargado={() => setSinClientes(false)} onIrClientes={() => ir('clientes')} />}
          {vista.pagina === 'clientes' && (
            <Clientes
              onNuevo={() => ir('alta')}
              onEditar={(c) => ir('alta', { cliente: c })}
              onVerCuenta={(c) => ir('cuenta', { cliente: c })}
              onCargarMes={cargarMes}
              onIrCierre={irAlCierre}
            />
          )}
          {vista.pagina === 'cuenta' && (
            <EstadoCuenta
              key={`${vista.cliente.id}-${vista.pestana ?? ''}-${vista.mes ?? ''}`}
              cliente={vista.cliente}
              pestanaInicial={vista.pestana}
              mesInicial={vista.mes}
              volverAlCierre={vista.volverAlCierre}
              onVolver={() => (vista.volverAlCierre ? irAlCierre(vista.volverAlCierre) : ir('clientes'))}
              onEditar={(c) => ir('alta', { cliente: c })}
            />
          )}
          {vista.pagina === 'alta' && <AltaCliente inicial={vista.cliente} onListo={() => ir('clientes')} />}
        </main>
      </div>
    </div>
  );
}
