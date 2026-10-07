# Rutina: dólar MEP e IPC

Es el texto de la rutina de Claude Code que actualiza el dólar MEP (dolarhoy) y el IPC (INDEC) en la
app de cobranza publicada en claude.ai. Corre sola los días hábiles a las 17:10 (hora de Buenos Aires)
y la arranca también el botón "Actualizar dólar e IPC" de la app, que le agrega el texto
`pedido: boton`. Tiene que correr en un entorno con acceso a dolarhoy.com, www.indec.gob.ar,
api.argentinadatos.com y github.com.

Si se cambia este texto, hay que actualizar la rutina con el mismo texto (`update_trigger`).

---

Actualizá el dólar MEP y el IPC de la app de cobranza de Deenex, publicada en
https://claude.ai/artifact/SkfBMqP3pYoFwXE9mt2z6A. No hagas nada más que esto.

1. Usá el repo github.com/joaquinlombardi-wq/deenex-cobranza, rama main. Si no está en el directorio
   de trabajo, clonalo. No hace falta `npm install`.
2. Bajá cómo está la colección hoy: ArtifactData con action `list`, la url de arriba, collection
   `cotizaciones` y out_dir `/tmp/cotiz/actuales`. Anotá la version de cada documento.
3. Corré, desde la raíz del repo:
   `node server/scripts/cotizaciones.mjs --actuales /tmp/cotiz/actuales --salida /tmp/cotiz/salida --crudo /tmp/cotiz/crudo --pedido P`
   P es `boton` si este pedido trae el texto `pedido: boton`; si no, `automatico`.
4. El comando imprime un JSON. `escribir` es la lista de documentos a guardar (collection, doc_id,
   file_path, existe). Guardalos todos en una sola llamada a ArtifactData con action `batch`: un
   `set` por documento con su file_path y, si `existe` es true, `if_version` con la version que
   anotaste. Si el batch falla porque un documento cambió, volvé al paso 2 una sola vez.
5. Solo se escriben esos documentos de la colección `cotizaciones`. Nunca toques otras colecciones
   (clientes, cierres, cargos, pagos, ventas, facturacion, parametros).
6. Si el comando falla sin imprimir el JSON, guardá solo `cotizaciones/estado` con
   `{ "ultima": { "pedido": P, "inicio": <ahora, ISO>, "fin": <ahora, ISO>, "ok": false, "mep": null, "ipc": null, "errores": [{ "fuente": "tarea", "mensaje": <el error en una línea> }], "documentos": [] } }`
   (con `if_version` si ya existía).
7. Si en `resultado.errores` alguna fuente dice que no encontró el valor o las columnas (cambió el
   formato de la página), subí `/tmp/cotiz/crudo` a la rama `fuentes-crudas` del repo, en un commit
   aparte, sin tocar main.
8. Terminá con una línea: el MEP venta y su fecha, el IPC y su mes, y los errores si hubo.
