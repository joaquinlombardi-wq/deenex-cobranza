import { useEffect, useState } from 'react';
import { api } from './api.js';
import CierreMes from './pages/CierreMes.jsx';
import Clientes from './pages/Clientes.jsx';
import AltaCliente from './pages/AltaCliente.jsx';
import Ventas from './pages/Ventas.jsx';

const PESTANAS = [
  { id: 'cierre', nombre: 'Cierre del mes' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'clientes', nombre: 'Clientes' },
];

export default function App() {
  const [vista, setVista] = useState({ pagina: 'cierre' });
  const [guardaDatos, setGuardaDatos] = useState(true);
  const ir = (pagina, extra = {}) => setVista({ pagina, ...extra });
  const pestana = vista.pagina === 'alta' ? 'clientes' : vista.pagina;

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
        {vista.pagina === 'cierre' && <CierreMes onIrVentas={() => ir('ventas')} />}
        {vista.pagina === 'ventas' && <Ventas />}
        {vista.pagina === 'clientes' && <Clientes onNuevo={() => ir('alta')} onEditar={(c) => ir('alta', { cliente: c })} />}
        {vista.pagina === 'alta' && <AltaCliente inicial={vista.cliente} onListo={() => ir('clientes')} />}
      </main>
    </div>
  );
}
