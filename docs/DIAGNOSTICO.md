# Diagnóstico técnico de la aplicación existente (Fase 1)

Fecha: 2026-10-14. Solo lectura: no se modificó nada para obtener estos datos.

## Cómo está construida
- **Un solo archivo** `index.html` (≈1.4 MB, ≈37,900 líneas). Las líneas 9–33184 son una librería `docx` incrustada; la aplicación real ocupa ≈3,300 líneas. HTML + JavaScript sin framework ni paso de compilación.
- **Librerías por CDN:** Firebase 9.23 (compat: app, auth, firestore), jsPDF 2.5.1, qrcodejs, ZXing 0.19.1, Tabler Icons 2.44, fuente Inter.
- **Alojamiento:** GitHub Pages (`nubecafiver.github.io/inventario-ti`). No hay `firebase.json`, reglas, índices ni pruebas en el repositorio.

## Servicios de Firebase que usa realmente
- **Authentication** con correo y contraseña (`signInWithEmailAndPassword`). No usa `onAuthStateChanged`: la sesión no se restaura al recargar.
- **Cloud Firestore.** No usa Realtime Database, Storage ni Cloud Functions.

## Cómo funciona el inventario
- Colecciones: `equipos`, `transferencias`, `reparaciones`, `celulares`, `licencias`, `software_equipos`, `personal`, `escaneos`, `catalogo`.
- Cada equipo es un documento con `id` generado en el cliente (`EQ…`), guardado con `set()` completo. Se leen con `onSnapshot` sobre la colección entera; las lecturas se facturan por documento cambiado.
- Códigos QR apuntan a `…/#EQ…`; al abrir ese enlace la app localiza el equipo y abre su ficha.
- Vistas: dashboard, inventario, QR, reparaciones, etiquetas, celulares, simulador, obsoletos, licencias, personal y "modo campo" (móvil).

## Autenticación, roles y permisos
- Los 5 usuarios están escritos en el código (`USER_DIR`); la etiqueta "Admin TI" es fija.
- **No hay roles ni permisos**: cualquier usuario autenticado puede leer, crear, editar y borrar todo.
- Las reglas de Firestore **no están en el repositorio**: se desconoce su contenido real. Debe revisarse en la consola de Firebase.

## Riesgos detectados
| Riesgo | Detalle |
|---|---|
| Sin mínimo privilegio | Todos los usuarios pueden todo. |
| Reglas desconocidas | No versionadas; pueden estar abiertas. |
| XSS | ≈41 usos de `innerHTML` que concatenan datos sin función de escape. |
| Borrados reales | 6 llamadas `.delete()` (equipos, licencias, personal, reparaciones, celulares). |
| **Error existente** | `confirmAction` nunca ejecuta su acción: `closeConfirm()` pone `_confirmCb=null` antes de llamarlo (hoy los botones de eliminar no borran). No se corrigió porque cambiaría el comportamiento de los borrados; queda como tarea aparte. |
| Sin auditoría | Nadie sabe quién cambió qué. |
| Sin pruebas | No hay pruebas automatizadas. |
| Mantenimiento | Un archivo de 1.4 MB. |
| Clave de API en el HTML | Normal en Firebase; la protección real son las reglas. |

## Qué se reutiliza
Inicio de sesión, estilos (`.btn`, `.fi`, `.pill`, `.modal-card`), `toast`, `switchView`, `enterApp`, `doLogout`, iconos Tabler y todo el inventario.

## Cómo se incorporan los módulos nuevos
Archivos nuevos (`css/ti.css`, `js/ti-*.js`) y **tres cambios en `index.html`**: enlace a la hoja de estilos, cuatro `<script>` al final y renombrar "Dashboard" a "Inicio". Los módulos envuelven `switchView`, `enterApp` y `doLogout` sin modificar su código. Detalle en `docs/PLATAFORMA.md`.
