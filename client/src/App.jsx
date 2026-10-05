import { useEffect, useState } from 'react';
import { api } from './api.js';
import CierreMes from './pages/CierreMes.jsx';
import Clientes from './pages/Clientes.jsx';
import AltaCliente from './pages/AltaCliente.jsx';
import EstadoCuenta from './pages/EstadoCuenta.jsx';
import Ventas from './pages/Ventas.jsx';
import Cotizaciones from './pages/Cotizaciones.jsx';

const PESTANAS = [
  { id: 'cierre', nombre: 'Cierre del mes' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'cotizaciones', nombre: 'Dólar e IPC' },
];

export default function App() {
  const [vista, setVista] = useState({ pagina: 'cierre' });
  const [guardaDatos, setGuardaDatos] = useState(true);
  const ir = (pagina, extra = {}) => {
    setVista({ pagina, ...extra });
    window.scrollTo?.(0, 0);
  };
  const pestana = ['alta', 'cuenta'].includes(vista.pagina) ? 'clientes' : vista.pagina;

  useEffect(() => { api.estado().then((e) => setGuardaDatos(e.guardaDatos)); }, []);

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <span className="logo">D</span> Deenex <span className="sub">Cobranza</span>
        </div>
        <nav>
          {PESTANAS.map((p) => (
            <button key={p.id} className={pestana === p.id ? 'activo' : ''} onClick={() => ir(p.id)}>{p.nombre}</button>
          ))}
        </nav>
      </header>
      <main>
        {!guardaDatos && <div className="alerta aviso">Esta vista no puede guardar datos: lo que cargues se pierde al cerrar.</div>}
        {vista.pagina === 'cierre' && <CierreMes onIrVentas={() => ir('ventas')} onIrCotizaciones={() => ir('cotizaciones')} />}
        {vista.pagina === 'ventas' && <Ventas />}
        {vista.pagina === 'cotizaciones' && <Cotizaciones />}
        {vista.pagina === 'clientes' && (
          <Clientes onNuevo={() => ir('alta')} onEditar={(c) => ir('alta', { cliente: c })} onVerCuenta={(c) => ir('cuenta', { cliente: c })} />
        )}
        {vista.pagina === 'cuenta' && (
          <EstadoCuenta cliente={vista.cliente} onVolver={() => ir('clientes')} onEditar={() => ir('alta', { cliente: vista.cliente })} />
        )}
        {vista.pagina === 'alta' && <AltaCliente inicial={vista.cliente} onListo={() => ir('clientes')} />}
      </main>
    </div>
  );
}
