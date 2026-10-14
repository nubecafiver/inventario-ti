# CAFIVER TI — Plataforma de gestión de TI

## Estado de las fases
| Fase | Estado |
|---|---|
| 1 Diagnóstico | Hecha (`docs/DIAGNOSTICO.md`). |
| 2 Estructura general | Hecha en lo necesario para procesos: menú, roles, auditoría, ventanas, reglas (propuesta). |
| 3 Procesos y procedimientos | Implementada y probada con Firebase simulado. **Reglas sin probar con el emulador.** |
| 4 Dashboard ejecutivo | **Pendiente.** Hoy el módulo de procesos tiene sus propios indicadores; el "Inicio" original no cambió. |
| 5–10 Mesa de ayuda, cambios, proyectos, contratos, respaldos, IA y SAP | **No iniciadas.** No aparecen en el menú. |

## Arquitectura
Firebase puro: Authentication + Cloud Firestore, alojado donde ya estaba (GitHub Pages). Sin servidor propio, sin Cloud Functions, sin Storage.

| Archivo | Qué hace |
|---|---|
| `js/ti-logic.js` | Lógica pura sin Firebase ni DOM: roles, permisos, máquina de estados, validaciones, indicadores, catálogo. Se prueba en Node. |
| `js/ti-core.js` | Roles del usuario, auditoría, ventanas, menú; envuelve `switchView`, `enterApp`, `doLogout`. |
| `js/ti-procesos.js` | Módulo "Procesos y procedimientos". |
| `js/ti-admin.js` | Usuarios y roles; auditoría. |
| `css/ti.css` | Estilos (estilo Minimalism & Swiss, igual que la app actual). |
| `firestore.rules` | Reglas de seguridad **propuestas, no desplegadas**. |
| `tests/` | Pruebas (ver abajo). |
| `demo/` | Maquetas con datos inventados usadas para elegir el estilo visual. No forman parte de la app. |

Cambios en `index.html` (los únicos): `<link>` a `css/ti.css`; cuatro `<script src>` antes de `</body>`; el texto "Dashboard" ahora dice "Inicio". El menú y las vistas nuevas se agregan por JavaScript **al final** del menú para no alterar el orden de las secciones existentes (el modo campo depende de él).

## Modelo de datos (colecciones nuevas; el inventario no se duplica ni se modifica)
| Ruta | Contenido | Notas |
|---|---|---|
| `usuarios_ti/{correo}` | `email, nombre, roles[], activo, …` | Fuente oficial de roles. El id es el correo en minúsculas. |
| `ti_procesos/{PRO-###}` | Cabecera: `codigo, nombre, categoria, responsable, participantes[], periodoRevisionMeses, estado, versionTrabajo, versionPublicada, proximaRevision, documentado, esPlantilla, creadoPor, …` | `estado` es copia del estado de la versión de trabajo (para listar sin leer versiones). |
| `ti_procesos/{id}/versiones/{n}` | `numero, estado, contenido{…, pasos[]}, editores[], aprobacion, creadoPor, publicadoEn, …` | Fuente oficial del contenido y del estado de cada versión. Aprobadas y publicadas son inmutables. |
| `ti_procesos/{id}/historial/*` | `fecha, usuario, accion, version, detalle, motivo` | Solo creación. |
| `ti_auditoria/*` | `fecha, usuario, accion, tipoRegistro, registroId, resultado, detalle, motivo` | Solo creación; nadie edita ni borra. |
| `ti_config/contadores` | `procesos` (último folio) | Se incrementa en transacción. |

**Sincronización de campos copiados.** `estado`, `versionPublicada`, `proximaRevision` y `documentado` de la cabecera se escriben en la **misma transacción** que el cambio de la versión. Las reglas exigen que `estado` de la cabecera sea igual al de la versión de trabajo y que `versionPublicada` apunte a una versión publicada, para que no se pueda "publicar" tocando solo la cabecera. `documentado` lo calcula el cliente al publicar (las reglas no pueden verificarlo; ver limitaciones).

Los tickets, cambios y proyectos futuros deberán guardar **solo el id** del equipo del inventario (`equipos/{id}`), sin copiar sus datos.

## Roles y permisos
Un usuario puede tener varios roles; los permisos se suman. Se validan en `firestore.rules`; la interfaz solo oculta lo que no corresponde.

| Rol | Puede |
|---|---|
| Director de TI | Ver todo, aprobar o rechazar (no lo que él editó), publicar, ver auditoría. |
| Administrador | Crear y editar cualquier proceso, publicar, cargar el catálogo, administrar usuarios y roles, ver auditoría. **No aprueba** por ser administrador. |
| Responsable de proceso | Crear procesos; editar solo los suyos (responsable, participante o creador); enviar a revisión y a aprobación. |
| Técnico de TI | Solo leer procedimientos publicados vigentes. |
| Solicitante | Sin acceso a procesos (reservado para tickets). |

El inventario existente **no** cambió: sigue abierto a los cinco usuarios actuales (modo transitorio, ver reglas).

## Flujo de estados de una versión
Borrador → En revisión → Pendiente de aprobación → Aprobado → Publicado → En revisión periódica → Obsoleto (además "Reemplazada" para versiones que una nueva sustituye).

| Acción | De → a | Quién |
|---|---|---|
| Enviar a revisión | Borrador → En revisión | Editor; el borrador debe tener objetivo, alcance y ≥1 actividad. |
| Solicitar aprobación / Devolver | En revisión → Pendiente / Borrador | Editor. |
| Aprobar | Pendiente → Aprobado | Director; no puede haber editado la versión. |
| Rechazar | Pendiente → Borrador | Director; motivo obligatorio. |
| Publicar | Aprobado → Publicado | Director o Administrador; la versión anterior pasa a "Reemplazada". |
| Iniciar revisión periódica | Publicado → En revisión periódica | Editor. |
| Ratificar vigencia | En revisión periódica → Publicado | Director o Administrador; mueve la próxima revisión. |
| Crear nueva versión | Publicado / En revisión periódica → nueva versión en Borrador | Editor; la publicada se conserva. |
| Marcar obsoleto | Borrador, Aprobado, Publicado o En revisión periódica → Obsoleto | Director o Administrador; motivo obligatorio. |

Cada transición es una transacción que actualiza versión, cabecera, historial y auditoría. Antes de aplicarse se vuelve a validar con datos frescos.

## Indicadores del módulo (fórmulas)
Todos usan datos reales. Los procesos obsoletos no cuentan como registrados.
- **Registrados** = procesos con estado distinto de Obsoleto.
- **Documentados** = procesos con versión vigente y `documentado = true` (objetivo, alcance, responsable y ≥1 actividad al publicar). **El porcentaje solo se muestra con ≥5 procesos registrados**; con menos se muestra "n de m".
- **En revisión / Pendientes de aprobación** = estado de la versión de trabajo.
- **Publicados vigentes** = procesos con versión publicada en uso.
- **Revisión en 30 días** = vigentes con `proximaRevision` entre hoy y hoy + 30 días. **Vencida** = anterior a hoy.
- **Dependen de una persona** = procesos activos sin participantes.
Cada tarjeta filtra la tabla con exactamente los registros que la componen. "Acciones correctivas pendientes" no existe todavía (módulo futuro) y no se muestra.

## Catálogo inicial
El botón "Cargar catálogo inicial" crea los 21 nombres solicitados como **borradores vacíos**, marcados "plantilla", sin responsable y sin pasos. No se inventa ningún procedimiento. Se carga en tandas de 8 porque las reglas permiten 20 consultas de documentos por lote y cada proceso usa 2.

## Instalación y primer arranque
1. **No requiere compilar.** Los archivos se publican junto con `index.html` donde ya está alojada la app. Nada se desplegó.
2. **Reglas (acción de la persona administradora):** compara `firestore.rules` con las reglas actuales (consola de Firebase → Firestore → Reglas). Si coinciden en el inventario, publícalas primero en un proyecto de pruebas. Cambia el correo de arranque si corresponde (en `firestore.rules` y en `TI.BOOTSTRAP_ADMINS` de `js/ti-core.js`).
3. **Primer ingreso:** el correo de arranque entra, abre "Usuarios, roles y auditoría" y pulsa "Crear mi registro de administrador". Después asigna roles a los demás (y el de Director de TI a quien corresponda: sin Director nadie puede aprobar).
4. Los usuarios deben existir en Firebase Authentication; la plataforma solo asigna roles.

Variables de entorno y secretos: **ninguno**. La configuración pública de Firebase ya está en `index.html`.

## Pruebas
| Prueba | Resultado |
|---|---|
| `node --test tests/logica.test.js` — lógica pura | **21 de 21 correctas.** Permisos, flujo, segregación, versionado, indicadores, fechas. |
| `node tests/integracion.js` — navegador con Firebase **simulado** en memoria | **48 de 48 correctas.** Arranque, roles por interfaz, catálogo, creación y validación, aprobación, publicación, versiones, técnico, solicitante, 9 vistas del inventario, auditoría, cierre de sesión, XSS y ausencia de errores de JavaScript. |
| `tests/reglas.test.js` — reglas con el emulador | **NO ejecutadas.** El entorno de desarrollo bloqueaba `registry.npmjs.org`, `gstatic.com` y `storage.googleapis.com`. Están escritas y listas para ejecutar donde haya internet. |

La simulación **no aplica reglas de seguridad**, así que las pruebas de integración no demuestran que las reglas funcionen. Tampoco se probó contra el Firebase real.

## Limitaciones conocidas
- **Reglas sin ejecutar** (arriba). Hasta correr `tests/reglas.test.js` no se debe considerar segura la propuesta.
- **Auditoría escrita por el navegador:** las reglas impiden editarla o borrarla, pero un cliente modificado podría omitir crear un evento. La versión a prueba de omisiones requiere Cloud Functions (plan Blaze, facturable; no autorizado).
- **`documentado` y el contenido de los campos** no se pueden verificar a fondo en las reglas.
- **Documentos como enlaces** (https). Subir archivos requiere Firebase Storage (plan Blaze).
- **Inventario sin endurecer:** sigue abierto a los usuarios autenticados.
- **Sin histórico de indicadores:** no hay tendencias hasta guardar un resumen mensual (decisión pendiente).
- **Error existente `confirmAction`** (ver diagnóstico).
- Si el Director de TI aún no existe, el administrador debe asignarse también ese rol o designar a alguien; la separación de funciones se mantiene.
- Un Administrador que también sea Director no puede aprobar lo que él mismo editó.

## Seguimiento de cambios
- 2026-10-14 — Fase 1 y primera versión de las Fases 2 y 3: `js/`, `css/`, `firestore.rules`, `tests/`, `docs/`; tres cambios en `index.html`.
