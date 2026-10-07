// Íconos de línea para el menú y las acciones. Toman el color del texto.
const TRAZOS = {
  cierre: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M16 2.5v3M8 2.5v3M3 9.5h18M9 15l2 2 4-4" />
    </>
  ),
  historial: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3" />
      <path d="M3.5 3.5v4.8h4.8M12 7.5V12l3 1.8" />
    </>
  ),
  clientes: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7" />
    </>
  ),
  ventas: <path d="M4 4v16h16M8.5 16v-5M13 16V8M17.5 16v-3" />,
  cotizaciones: <path d="M12 3v18M16.5 6.5H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  izquierda: <path d="m14.5 6-6 6 6 6" />,
  derecha: <path d="m9.5 6 6 6-6 6" />,
  descargar: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />,
  actualizar: <path d="M19.5 11a7.5 7.5 0 0 0-13.2-4.3L4.5 8.5M4.5 4v4.5H9M4.5 13a7.5 7.5 0 0 0 13.2 4.3l1.8-1.8M19.5 20v-4.5H15" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
};

export default function Icono({ nombre, tamano = 20 }) {
  return (
    <svg
      className="icono"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
