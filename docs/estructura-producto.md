# Sistema de cobranza Deenex · Estructura del producto (v0.9)

Objetivo: que el 1° de cada mes el sistema tire **cuánto tiene que pagar cada pagador**, a partir de lo que Deenex cargó en cada cliente.

**Decidido con Joaco (4/10/2026):**
- La **v1 termina en el monto a pagar** por pagador. El Excel para el contador y el seguimiento de cobro quedan para después.
- Las ventas para la comisión salen de la **plataforma de Deenex**. La conexión la hacen los devs a mano, así que el sistema define un formato de entrada claro (sección 7) y ellos lo llenan.
- La comisión se calcula sobre el **total vendido con IVA, sin costo de envío**.
- Todo lo que "depende del caso" (cómo se combina un híbrido, prorrateo de locales nuevos, precio distinto por local) queda **parametrizable por acuerdo**, con un valor por defecto.
- Los **extras los paga la marca**; el franquiciado paga solo lo de sus locales. Se puede cambiar por concepto si algún día aparece la excepción.
- Acuerdos en **USD** se convierten al **MEP venta de dolarhoy del día de la liquidación**. Acuerdos en **ARS** pueden ajustar por **IPC** cada mes (caso Hatsu Sushi), usando el **último IPC publicado por INDEC** al momento de liquidar (el 1/11 se usa el de septiembre).
- **Joaco da de alta cada cliente** desde el sistema y carga él los valores (sección 5). Nada viene precargado.
- **Es solo financiero (5/10/2026):** no se carga cada local, solo **cuántos locales propios y cuántos franquiciados** tiene la marca. Todos los propios pagan lo mismo, y los franquiciados pagan lo mismo o su propio precio y comisión. Con **fee mensual fijo** no importan los locales ni los franquiciados. No hay prorrateo: un local que abre a mitad de mes se cobra como extra de ese mes.
- **Locales que cambian y saldos reales (6/10/2026):** la cantidad de locales se cambia **desde un mes** y queda el historial (los meses anteriores no se tocan). Lo que un cliente ya debía antes del sistema se carga como **saldo anterior** en su cuenta, y los pagos lo cancelan primero. La pestaña **Ventas** pasa a ser el **análisis de la facturación** mes a mes: **MRR** (abonos, comisiones e infraestructura) contra **extra jobs** (desarrollos, implementaciones, lanzamientos), con los meses anteriores importados del Excel del contador. Las ventas para la comisión se cargan en el Cierre del mes.
- **Ventas por cliente, Historial y Excel para el contador (7/10/2026):** las ventas para la comisión salen del Cierre del mes y se cargan **en cada cliente** (Clientes → Locales y ventas), mes a mes junto con los locales y solo en los canales que cobra (delivery, take away o los dos). **Historial** muestra los cierres pasados por mes y por cliente. El Cierre del mes baja el **Excel para el contador** (una factura por pagador, con su producto Dux) para facturar el día 1: es el primer paso, la idea es automatizar la facturación después. QUEM y QUEM Central son **dos clientes** y dos facturas aunque compartan CUIT.
- **Dólar e IPC automáticos (7/10/2026):** el botón **Actualizar dólar e IPC** (en Cierre del mes y en Dólar e IPC) trae el MEP venta de dolarhoy y el último IPC del INDEC, con el historial del IPC desde 1943. Lo hace una tarea en la nube (hilo Cotizaciones automáticas), así que tarda un par de minutos, y además corre sola los días hábiles a las 17:10. Lo cargado a mano sigue valiendo para los días en que dolarhoy no tiene valor.
- **Versión con servidor, sin costo (7/10/2026):** además de la app de claude.ai hay una versión con servidor propio en los planes gratis de Render y MongoDB Atlas, con usuario y clave. Como el server gratis se duerme sin uso, el dólar y el IPC se traen solos la primera vez que se abre cada día y el botón contesta en el momento. Los datos se pasan con **Respaldo** (en el menú): se baja de la app de claude.ai y se carga en la nueva, que arranca vacía.
- **Producción (7/10/2026):** el código completo está en GitHub (joaquinlombardi-wq/deenex-cobranza) y el CTO lo sube al administrador de operaciones de Deenex, en lugar de Render y Atlas. Los datos pasan con **Respaldo**, bajado de la app de claude.ai en el momento del cambio.

---

## 1. Las piezas (modelo de datos)

| Pieza | Qué es | Ejemplo |
|---|---|---|
| **Marca** | El cliente comercial con el que se negocia. Tiene el acuerdo y define *quién paga*. | QUEM, La Fábrica, Hatsu Sushi |
| **Locales** | Cuántos locales **propios** y cuántos **franquiciados** tiene la marca (no una lista). Si paga cada franquiciado, cuántos tiene cada uno. | QUEM: 12 propios |
| **Pagador** | Razón social + CUIT a la que se le cobra. La marca o un franquiciado. | QUEM S.A., "Juan Pérez SRL" |
| **Acuerdo** | Lo negociado con la marca: componentes de cobro, moneda, ajuste, reglas. Tiene vigencia desde/hasta para cambiar precios sin perder historia. | 12 locales × USD 45 + 3% delivery |
| **Conceptos extra** | Cargos que no dependen de locales: cloud, servidores, desarrollo en cuotas ("cuota X de N"), reintegros. Por defecto los paga la marca. | Cloud USD 75 |
| **Ventas del mes** | Lo que mandan los devs desde la plataforma: ventas del mes anterior por grupo de locales y canal (sección 7). | QUEM sept, propios: delivery $ 1.244.000 |
| **Parámetros del mes** | MEP venta del día (dolarhoy) y el IPC del mes para los acuerdos en pesos. | MEP 1.549,80 · IPC 2,1% |
| **Liquidación** | El resultado: una por pagador, con sus renglones y el **monto a pagar**. | QUEM S.A. $ 1.055.378,94 |

## 2. Quién paga (se configura en la marca)

**A · Paga la marca.** Una sola liquidación con todos los locales y los extras.

**B · Paga cada franquiciado.** Sale:
- una liquidación **por franquiciado**, con el fee y la comisión de sus locales;
- una liquidación **a la marca** con sus **locales propios** y **todos los extras**.

Cada concepto extra tiene un campo "lo paga" (por defecto: marca) para cubrir la excepción el día que aparezca.

## 3. El acuerdo: componentes y parámetros

### 3.1 Componentes (se pueden combinar)

| Componente | Cálculo | Cuándo |
|---|---|---|
| **Fee por local** | cantidad de locales × precio por local | Mes en curso, por adelantado |
| **Comisión por local** | ventas del mes anterior × % del canal. Canales: delivery, takeaway o ambos, cada uno con su % | Mes vencido |
| **Fee mensual fijo** | Monto fijo, sin importar locales ni ventas | Mes en curso |
| **Extras** | Monto fijo por concepto, o cuotas | Mes en curso |

Los modelos que charlamos son combinaciones de estos: *fee por local*, *comisión por local*, *híbrido* (fee + comisión) y *fee mensual fijo*.

### 3.2 Parámetros (cada uno con su valor por defecto)

| Parámetro | Opciones | Por defecto |
|---|---|---|
| **Moneda** | USD o ARS | USD |
| **Ajuste** (solo ARS) | Ninguno o IPC mensual | Ninguno |
| **Cómo se combina el híbrido** | Suma · El mayor de los dos · Fee como mínimo garantizado (paga el fee o la comisión, lo que sea mayor, pero nunca menos que X) · Tope máximo de comisión | Suma |
| **Lo que pagan los franquiciados** | Lo mismo que los propios · Su propio precio por local y su propia comisión | Lo mismo que los propios |
| **IVA** | 21% · Sin IVA (por concepto, ej. reintegros) | 21% |

## 4. Reglas de cálculo

1. **USD → ARS** al **MEP venta de dolarhoy del día en que se liquida**. Lo trae el botón Actualizar dólar e IPC (o la corrida diaria de las 17:10) y se puede corregir a mano en el cierre.
2. **ARS con IPC**: monto del mes = monto del mes anterior × (1 + último IPC publicado). Se guarda el monto base y el mes base, y el sistema muestra la evolución mes a mes.
3. **Comisión**: ventas del mes anterior **con IVA y sin costo de envío** × % del canal. Queda en ARS.
4. **IVA 21%** encima de todo, salvo conceptos marcados sin IVA.
5. Cada renglón guarda su **producto Dux** (P006 fee, P002 comisión, P0005 hosting, P004 servidores, 8 desarrollo, 2 reintegros) para cuando sumemos el Excel del contador.

**Ejemplos con casos reales:**
- **QUEM S.A.** (híbrido = suma, paga la marca): 12 × USD 45 + 3% del delivery de sept ($ 1.244.000 → $ 37.320) + IVA.
- **QUEM Central** (fee mensual fijo, liquidación aparte): USD 420 + IVA.
- **La Fábrica** (fee por local + extras): 86 × USD 60 + cloud USD 75 + reintegro $ 6.900 sin IVA.
- **Hatsu Sushi** (ARS + IPC): monto del mes pasado × (1 + IPC) + IVA.
- **Franquicia inventada** (paga cada franquiciado): marca X, USD 50 por local propio y USD 55 por franquiciado, + 2% delivery. Salen la liquidación de la marca (propios + cloud) y una por cada franquiciado (sus locales + su comisión).

## 5. Alta de cliente (la carga Joaco)

Un formulario por pasos. Todo se puede editar después.

**Paso 1 · Marca**
- Nombre comercial
- Razón social, CUIT, condición frente al IVA, domicilio fiscal
- Contacto de cobranza: nombre, mail, teléfono
- ¿Todos los locales son propios o tiene franquiciados?
- ¿Quién paga? La marca / Cada franquiciado (solo si tiene franquiciados)

**Paso 2 · Acuerdo**
- Moneda (USD / ARS); si es ARS, si ajusta por IPC y desde qué mes
- Cómo paga: fee mensual fijo, fee por local, comisión (% delivery y/o % takeaway), híbrido o solo extras
- Si depende de los locales: cuántos propios y su precio y comisión; cuántos franquiciados (si paga la marca) y si pagan lo mismo o distinto
- Combinación del híbrido y vigencia desde

**Paso 3 · Franquiciados** (solo si paga cada franquiciado y el acuerdo depende de los locales)
Uno por fila, con lo necesario para cobrarle y mandarle su detalle directo:
- Razón social, CUIT, condición frente al IVA, domicilio fiscal, cantidad de locales
- Contacto de cobranza: nombre, mail

Si todos los locales son propios, si paga la marca o si es fee fijo, este paso no aparece.

**Paso 4 · Extras**
- Concepto, monto, moneda, con o sin IVA, cuotas (si aplica), quién lo paga (por defecto la marca)

Al terminar, el sistema muestra una **simulación del próximo mes** con lo que pagaría cada pagador, para validar antes de guardar.

## 6. Flujo de cada mes

1. **Cierre del mes**: tocar **Actualizar dólar e IPC** para traer el MEP venta del día (dolarhoy) y el último IPC del INDEC. Se pueden corregir a mano.
2. Si cambió la cantidad de locales de alguna marca, cargarlo en Clientes → Locales y ventas, en el mes en que cambia.
3. Verificar que estén las ventas del mes anterior de todas las marcas con comisión, cargadas en Clientes → Locales y ventas (el sistema avisa cuáles faltan).
4. **Generar**: una liquidación por pagador con el monto a pagar.
5. Bajar el **Excel para el contador** y pasar el cierre a las cuentas corrientes.

Pantallas mínimas: Clientes (marca + acuerdo + extras), Locales, Pagadores, Cierre del mes, Liquidaciones.

## 7. Formato de ventas para los devs

Lo que la plataforma tiene que entregarle al sistema cada mes. Una fila por **cliente × grupo de locales × mes × canal**, con el total del grupo:

| Campo | Tipo | Ejemplo | Nota |
|---|---|---|---|
| `cliente_id` | texto | `quem` | El id del cliente en el sistema de cobranza |
| `grupo` | texto | `propios` | `propios`, `franquiciados` (si paga la marca) o el id del franquiciado (si paga cada uno). Si la marca paga todo con la misma comisión, alcanza con `todos` |
| `periodo` | AAAA-MM | `2026-09` | Mes de las ventas (el anterior al que se cobra) |
| `canal` | `delivery` · `takeaway` | `delivery` | |
| `total_con_iva` | número (ARS) | `1244000.00` | **Sin** costo de envío |

Puede llegar como JSON a la API o cargarse a mano en cada cliente (Clientes → Locales y ventas). Si un grupo no vendió en un canal, va la fila con 0 (así se distingue "no vendió" de "no llegó el dato").

---

## 8. Lo que queda por definir

1. **Detalle para el franquiciado**: los datos ya quedan cargados para mandarle a cada uno su liquidación. Si en la v1 alcanza con verlo en pantalla, o si querés un PDF o un mail, lo definimos al construir.
2. **Dónde vive el sistema**: resuelto el 7/10/2026. El código está en GitHub (MERN) y la puesta en producción la hace el CTO en el administrador de operaciones de Deenex.
