# Revisión de TI Connect (app móvil de tickets de CAFIVER)

Revisado a partir de `TI_Connect_Firebase.zip` (solo lectura). **No se modificó TI Connect ni su Firebase, y no se ejecutó nada contra él.** Todo lo de abajo sale de leer el código; los hallazgos marcados "por lectura" no se probaron en vivo. El archivo `web/index.html` (1,193 líneas) se revisó con búsquedas dirigidas, no línea por línea.

## Resumen
TI Connect ya es la app móvil que se quería construir: PWA instalable con notificaciones push, login por número de empleado, tickets en tiempo real, bolsa común para consultores, base de conocimiento y avisos. Está en producción (`ti-connect-3d3a7.web.app`) con su propio proyecto de Firebase. **No conviene construir otra app de tickets desde cero.**

Tiene cuatro riesgos de seguridad que conviene corregir pronto (el más serio: XSS almacenado en el panel del staff) y le faltan cosas que la mesa de ayuda de CAFIVER TI sí tiene (SLA, escalamiento, auditoría, notas internas).

## Qué tiene
- Vista del colaborador (móvil) y panel del staff (escritorio) en el mismo `index.html`, elegida por rol.
- Roles por *custom claims* (`colaborador`, `consultor`, `director`), reglas de Firestore que imponen lectura por rol y propiedad.
- Bolsa común: el colaborador levanta el ticket, cae sin asignar, un consultor lo toma, lo regresa o lo cierra con la solución, que alimenta la base de conocimiento.
- Mensajes por ticket, avisos con confirmación de lectura, muro (oculto para el colaborador).
- Cloud Functions 2ª generación: push por ticket nuevo, cambio de estado, mensaje y aviso; `refreshClaims`; límite de una publicación al día.
- Service worker de red primero; índices definidos; sin llaves privadas en el zip (solo configuración pública).

## Hallazgos de seguridad y calidad

| # | Severidad | Dónde | Qué pasa | Arreglo propuesto |
|---|---|---|---|---|
| 1 | **Alta** | `web/index.html` líneas ~997, 1012, 1122 | El título del ticket (`t.t`, tomado de lo que escribe el colaborador) se concatena **sin escapar** en `innerHTML`, también en el panel del staff. Un colaborador podría meter código que se ejecute en la sesión de un consultor o del gerente (leer todos los tickets, publicar avisos con push, etc.). Existe una función `esc` pero se usa solo en algunas vistas. *Por lectura.* | Escapar todo texto de usuario con `esc()` (títulos, nombres, mensajes, categorías) o usar `textContent`. Probar con un título como `<img src=x onerror=alert(1)>`. |
| 2 | **Media** | `firestore.rules`, `fcmTokens` | La regla valida `emp` pero no `role` ni `agentId`, que escribe el cliente. Un colaborador podría registrar su token como `director` y recibir el push de cada ticket nuevo con su título. Tampoco se impide pisar el token de otra persona. *Por lectura.* | Que el rol y `agentId` salgan del token de autenticación (`request.auth.token.role`), no del documento; o mover el registro del token a una Function. |
| 3 | **Media** | `storage.rules` | `tickets/**` y `posts/**` permiten leer y escribir a cualquier usuario autenticado: se pueden leer y sobrescribir evidencias de tickets ajenos. | Atar la ruta al dueño del ticket (`tickets/{ticketId}/…` solo dueño o staff, con una función que consulte el ticket) y limitar tamaño y tipo. |
| 4 | **Media** | `scripts/import_padron.js` | La contraseña inicial es fija (`Cafiver2026`) y el login es solo número de empleado + contraseña. No se encontró código que obligue a cambiarla (`updatePassword` no aparece). Quien conozca un número de empleado puede entrar mientras no se haya cambiado. | Contraseñas iniciales aleatorias por persona, cambio obligatorio en el primer ingreso y límite de intentos. |
| 5 | Media | `firestore.rules`, `tickets` | Al crear no se validan prioridad, folio ni campos. El consultor puede actualizar **cualquier** campo de un ticket sin asignar o propio (solo se restringe `assignedTo`), incluido el dueño. El folio lo genera el cliente (`SR-` + últimos 5 dígitos de `Date.now()`) y puede repetirse. | Lista cerrada de campos que cada rol puede cambiar y folio por transacción en el servidor. |
| 6 | Baja | `firestore.rules`, `posts` y `onPostCreate` | El colaborador declara su propio `authorRole`; la Function solo cuenta publicaciones con `authorRole == 'colaborador'`, así que se puede saltar el límite diario. El muro está oculto para el colaborador, pero el código sigue. | Validar `authorRole` contra el token en las reglas. |
| 7 | Baja | Operación | El service worker está en `ti-connect-v5`: cada cambio necesita subir la versión o el navegador sirve el caché viejo (el propio `CLAUDE.md` lo advierte). 39 usos de `innerHTML`; todo en un archivo de ~230 KB; código muerto de demos; sin pruebas automáticas. | Pruebas mínimas del flujo de ticket y revisión de `innerHTML`. |

## Qué le falta frente a la mesa de ayuda de CAFIVER TI

| Tema | TI Connect | Mesa de ayuda de CAFIVER TI |
|---|---|---|
| Prioridad | La elige el usuario | Impacto × urgencia (matriz) |
| SLA y horario | No hay | Configurables por categoría y prioridad, con pausas por espera |
| Estados | abierto, proceso, resuelto | Nuevo, asignado, en atención, espera de usuario o tercero, resuelto, cerrado, cancelado |
| Confirmar o reabrir | No | El solicitante confirma o reabre dentro de una ventana |
| Notas internas | No | Sí, el solicitante no las ve |
| Historial y auditoría | No | Cada acción queda en historial y auditoría |
| Escalamiento | No | Sí, con motivo |
| Indicadores | No | Abiertos, críticos, vencidos, tiempo medio, cumplimiento (con muestra mínima) |
| App móvil con push | **Sí** | No |
| Base de conocimiento | **Sí** | No |
| Avisos y muro | **Sí** | No |

## Opciones (decide la Gerencia)

1. **Rediseñar TI Connect al estilo Material 3 (el elegido).** Cambia solo la vista del colaborador, sin tocar la lógica, con demo antes y subiendo la versión del service worker. Esfuerzo bajo a medio; riesgo bajo. Los dos sistemas de tickets siguen separados.
2. **Unificar:** que el colaborador levante tickets en TI Connect pero caigan en la mesa de ayuda de CAFIVER TI. Requiere dar de alta a los usuarios en el Firebase de CAFIVER TI (o conectar ambos proyectos) y migrar el flujo. Es lo más limpio y lo más grande; toca una app que hoy funciona.
3. **Conectar sin mover usuarios:** CAFIVER TI lee, solo lectura, los tickets de TI Connect para mostrarlos en el Inicio del Gerente. Esfuerzo medio; requiere ajustar las reglas de TI Connect.

**Recomendación:** corregir primero los hallazgos 1 a 4 (son cambios pequeños y de mucho valor), luego la opción 1, y decidir después entre 2 y 3 con la app ya estable. No recomiendo construir una tercera app.

## Lo que no se hizo
No se ejecutó ni se desplegó nada, no se tocó el repositorio de TI Connect ni su Firebase, y no se probaron en vivo los hallazgos. Las reglas de TI Connect tampoco se pasaron por el emulador.
