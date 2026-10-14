# CAFIVER TI — Plataforma de gestión de TI

## Estado de las fases
| Fase | Estado |
|---|---|
| 1 Diagnóstico | Hecha (`docs/DIAGNOSTICO.md`). |
| 2 Estructura general | Hecha en lo necesario para procesos: app `ti/`, menú, roles, auditoría, ventanas, reglas (propuesta). |
| 3 Procesos y procedimientos | Implementada y probada con Firebase simulado. **Reglas sin probar con el emulador.** |
| 4 Dashboard de Inicio | **Primera versión hecha y probada con datos simulados:** atención por rol, indicadores de procesos e indicadores del inventario (solo lectura). Sin metas ni tendencias (no hay histórico). Garantías y equipos en reparación: "No disponible" (ver más abajo). |
| 5 Mesa de ayuda | **Implementada y probada con Firebase simulado** (ver "Mesa de ayuda"). Los SLA no vienen definidos: los configura el administrador. **Reglas sin probar con el emulador.** |
| 6–10 Cambios, proyectos, contratos, respaldos, IA y SAP | **No iniciadas.** No aparecen en el menú. |

## Arquitectura
Firebase puro: Authentication + Cloud Firestore, alojado donde ya estaba (GitHub Pages). Sin servidor propio, sin Cloud Functions, sin Storage.

**La plataforma es una app independiente en la carpeta `ti/`. La app de inventario (`index.html`) no se modifica ni se carga dentro de ella.** Comparten el mismo proyecto de Firebase y las mismas cuentas de inicio de sesión, y la plataforma enlaza al inventario (se abre en otra pestaña). Una prueba automática verifica que `index.html` sea idéntico al de la rama principal.

| Archivo | Qué hace |
|---|---|
| `ti/index.html` | Página de la plataforma: inicio de sesión, menú, configuración pública de Firebase. |
| `ti/js/ti-shell.js` | Inicio de sesión (se restaura al recargar), enrutador (`TI.ir(vista, parametros)`) y menú por rol. |
| `ti/js/ti-logic.js` | Lógica pura sin Firebase ni DOM: roles, permisos, máquina de estados, validaciones, indicadores, catálogo. Se prueba en Node. |
| `ti/js/ti-core.js` | Roles del usuario, auditoría, ventanas y avisos. |
| `ti/js/ti-inicio.js` | Dashboard de Inicio: requiere atención, indicadores de procesos e indicadores del inventario. |
| `ti/js/ti-procesos.js` | Módulo "Procesos y procedimientos". |
| `ti/js/ti-admin.js` | Usuarios y roles; auditoría. |
| `ti/css/base.css`, `ti/css/ti.css` | Estilos (Minimalism & Swiss). La plataforma no depende de los estilos del inventario. |
| `firestore.rules` | Reglas de seguridad **propuestas, no desplegadas**. |
| `tests/` | Pruebas (ver abajo). |
| `demo/` | Maquetas con datos inventados usadas para elegir el estilo visual. No forman parte de la app. |

Dirección en GitHub Pages (una vez publicada la rama): `…/inventario-ti/ti/`. El inventario sigue en `…/inventario-ti/`.

## Modelo de datos (colecciones nuevas; el inventario no se duplica ni se modifica)
| Ruta | Contenido | Notas |
|---|---|---|
| `usuarios_ti/{correo}` | `email, nombre, roles[], activo, …` | Fuente oficial de roles. El id es el correo en minúsculas. |
| `ti_procesos/{PRO-###}` | Cabecera: `codigo, nombre, categoria, responsable, participantes[], periodoRevisionMeses, estado, versionTrabajo, versionPublicada, proximaRevision, documentado, esPlantilla, creadoPor, …` | `estado` es copia del estado de la versión de trabajo (para listar sin leer versiones). |
| `ti_procesos/{id}/versiones/{n}` | `numero, estado, contenido{…, pasos[]}, editores[], aprobacion, creadoPor, publicadoEn, …` | Fuente oficial del contenido y del estado de cada versión. Aprobadas y publicadas son inmutables. |
| `ti_procesos/{id}/historial/*` | `fecha, usuario, accion, version, detalle, motivo` | Solo creación. |
| `ti_auditoria/*` | `fecha, usuario, accion, tipoRegistro, registroId, resultado, detalle, motivo` | Solo creación; nadie edita ni borra. |
| `ti_config/contadores` | `procesos`, `tickets` (último folio) | Se incrementa en transacción. |
| `ti_tickets/{TCK-####}` | `codigo, titulo, descripcion, tipo, categoria, impacto, urgencia, prioridad, estado, solicitanteEmail, responsable, departamento, sistema, activoId, evidencias[], esperas[], escaladoNivel, reaperturas, primeraRespuestaMs, resueltoMs, cerradoMs, diagnostico, solucion, confirmacion, creadoMs, …` | `activoId` es solo el ID del equipo del inventario (no se copian sus datos). Tiempos en milisegundos. |
| `ti_tickets/{id}/comentarios/*` | `texto, autor, interno, fechaMs, fecha` | `interno = true`: notas del equipo de TI que el solicitante no puede leer. Solo creación. |
| `ti_tickets/{id}/historial/*` | `fecha, usuario, accion, detalle, motivo` | Solo creación; solo lo lee TI. |
| `ti_config/tickets` | `categorias[], sla{categoria+prioridad → {respuestaH, resolucionH}}, horario, ventanaReaperturaDias, alertaPct` | Lo edita solo el Administrador. Sin SLA ni horario por defecto. |
| `ti_resumenes/inventario` | `calculadoEn, calculadoMs, calculadoPor, equiposLeidos, datos{…}` | Resumen del inventario, calculado a mano; lo lee el dashboard. |

**Sincronización de campos copiados.** `estado`, `versionPublicada`, `proximaRevision` y `documentado` de la cabecera se escriben en la **misma transacción** que el cambio de la versión. Las reglas exigen que `estado` de la cabecera sea igual al de la versión de trabajo y que `versionPublicada` apunte a una versión publicada, para que no se pueda "publicar" tocando solo la cabecera. `documentado` lo calcula el cliente al publicar (las reglas no pueden verificarlo; ver limitaciones).

Los tickets, cambios y proyectos futuros deberán guardar **solo el id** del equipo del inventario (`equipos/{id}`), sin copiar sus datos.

## Roles y permisos
Un usuario puede tener varios roles; los permisos se suman. Se validan en `firestore.rules`; la interfaz solo oculta lo que no corresponde.

| Rol | Puede |
|---|---|
| Director de TI | Ver todo, aprobar o rechazar (no lo que él editó), publicar, ver auditoría. |
| Administrador | Crear y editar cualquier proceso, publicar, cargar el catálogo, administrar usuarios y roles, ver auditoría. **No aprueba** por ser administrador. |
| Responsable de proceso | Crear procesos; editar solo los suyos (responsable, participante o creador); enviar a revisión y a aprobación. |
| Técnico de TI | Leer procedimientos publicados vigentes. En la mesa de ayuda: ve todos los tickets, toma los que no tienen responsable y atiende los suyos. |
| Solicitante | Sin acceso a procesos. En la mesa de ayuda: crea tickets y ve solo los suyos. |

En la **mesa de ayuda**: todos los roles crean tickets y ven los propios; Administrador, Director y Técnico ven todos. El Director asigna y cambia prioridad pero no atiende; el Administrador asigna, atiende, cancela tickets ajenos y configura categorías, SLA y horario; el Técnico atiende solo los tickets que tiene asignados.

> **Importante:** el equipo inicial está como *Responsable de proceso*, que **no** atiende tickets. Para que alguien pueda recibir y atender tickets hay que darle también el rol **Técnico** (Administración › Usuarios y roles).

El inventario existente **no** cambió: sigue abierto a cualquier usuario autenticado, igual que con las reglas actuales (modo transitorio).

## Estructura del menú
CAFIVER TI es la plataforma; el **Inventario de equipos es un módulo dentro de ella**, y se abre como la app que ya existe. Solo aparece lo que existe y lo que el rol permite:

1. **Inicio** (dashboard; ver "Dashboard de Inicio").
2. **Procesos y procedimientos** (según rol).
3. **Mesa de ayuda** (todos los roles).
4. **Inventario de equipos** (enlace a la app de inventario existente, en otra pestaña; visible para todos los que inician sesión, igual que hoy).
5. *(Gestión de cambios, Proyectos, Proveedores y Respaldos aparecerán cuando existan.)*
6. **Administración** (usuarios, roles y auditoría; según rol).

## Mesa de ayuda
**Ticket.** Tipo (incidente o solicitud), categoría, título, descripción, departamento, sistema afectado, equipo (ID o activo fijo, verificado con una consulta puntual a `equipos`), impacto, urgencia y evidencias como enlaces https. El folio es `TCK-####` (transacción sobre `ti_config/contadores`).

**Prioridad = impacto × urgencia** (convención ITIL, no un compromiso de CAFIVER):
| Impacto \ Urgencia | Alta | Media | Baja |
|---|---|---|---|
| Alto | Crítica | Alta | Media |
| Medio | Alta | Media | Baja |
| Bajo | Media | Baja | Baja |

**Estados:** Nuevo → Asignado → En atención → (En espera del usuario / En espera de un tercero) → Resuelto → Cerrado; Cancelado. Quien resuelve registra diagnóstico y solución; el solicitante confirma (cierra) o reabre dentro de la ventana de reapertura (5 días por omisión, editable). Escalar suma un nivel y reasigna con motivo. Cada acción es una transacción: ticket + historial + comentario (si aplica) + auditoría.

**SLA (no inventado).** El administrador define por categoría y prioridad las horas de **respuesta** y de **resolución**, el **horario de servicio** (días y horas; sin horario corre 24×7, hora local del navegador) y el margen de alerta (25 % por omisión, editable). Sin SLA para una categoría y prioridad, el ticket muestra "SLA no configurado" y no se marca como vencido.
- Tiempo transcurrido = horas de servicio entre la creación y ahora (o la resolución), **menos** los periodos en espera del usuario o de un tercero (el reloj se pausa).
- Estado: *en tiempo* (queda más del margen), *por vencer* (queda ≤ margen), *vencido* (restante < 0), *cumplido* / *incumplido* (ya respondido o resuelto), *en pausa* (espera abierta).
- La primera respuesta es la primera atención del equipo (iniciar atención, esperar, resolver o un mensaje público).

**Indicadores** (ventana de 90 días para los resueltos; mínimo de muestra 5):
| Indicador | Fórmula |
|---|---|
| Abiertos | Tickets en nuevo, asignado, en atención o en espera. |
| Críticos abiertos | Abiertos con prioridad crítica. |
| Sin asignar | Abiertos sin responsable. |
| SLA vencido / por vencer | Abiertos cuyo SLA configurado venció o está dentro del margen. Sin SLA: "no disponible". |
| Por responsable | Abiertos agrupados por responsable. |
| Tiempo medio de resolución | Promedio de (resuelto − creado − esperas) de los resueltos en 90 días. **Solo con ≥ 5 tickets resueltos**; si no, "No disponible". Es tiempo natural (24 h), no de horario. |
| Cumplimiento de SLA | Resueltos con SLA de resolución cumplido ÷ resueltos con SLA. **Solo con ≥ 5 evaluables.** |

**Costo de lecturas.** El equipo de TI escucha dos consultas acotadas (abiertos, y resueltos en los últimos 90 días); un solicitante, solo `solicitanteEmail == yo`. No se lee la colección completa ni el inventario (la verificación del equipo es una lectura, o dos).

**Exportar.** Botón "Exportar CSV" de lo que muestra la tabla (neutraliza celdas que empiezan con `=`, `+`, `-`, `@`).

## Equipo y roles iniciales (decididos por la Dirección de TI)
| Persona | Rol inicial |
|---|---|
| `ramaya@cafiver.com.mx` | Administrador de la plataforma **y** Director de TI |
| `vlopez@`, `aosorio@`, `soportetecnico@`, `dgomez@cafiver.com.mx` | Responsable de proceso |
| `soportetec@cafiver.com.mx` (Daniela Gomez Aleluya, ya en la app) | Sin rol de plataforma por ahora (es una persona distinta de `dgomez@`) |

Los responsables preparan y envían procedimientos; el Director los aprueba. Como el Director no puede aprobar lo que él mismo editó, conviene que los procedimientos los redacte el equipo. Todo se puede cambiar después en Administración. `TI.ARRANQUE_ROLES` y `TI.EQUIPO_INICIAL` (en `js/ti-core.js`) guardan estos valores; la regla de arranque en `firestore.rules` debe coincidir.

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

## Dashboard de Inicio
Se arma con datos reales; si no hay datos, muestra un estado vacío comprensible, nunca cifras inventadas.

**Requiere atención** (según rol): el Director ve los procedimientos pendientes de su aprobación y todas las revisiones vencidas; quien edita, las revisiones vencidas de sus procesos, sus borradores y los que están en revisión. Cada elemento abre el proceso.

**Procesos:** los mismos 8 indicadores del módulo (fórmulas más arriba). Cada tarjeta abre Procesos ya filtrado con exactamente los registros que la componen.

**Inventario de equipos** (solo Director y Administrador, permiso `inventario.resumen`; **solo lectura de `equipos`**, el inventario no se modifica). Base: equipos *activos* = estado distinto de "Baja".
| Indicador | Fórmula |
|---|---|
| Registrados / dados de baja | Todos los documentos / estado "Baja". |
| Activos | Estado distinto de "Baja". |
| Con responsable | Activos con el campo `responsable` no vacío (ni solo espacios). Se llama "sin responsable registrado", no "disponible": el inventario no distingue disponible de sin dato. |
| En buen estado | Activos con estado "Bueno". Se muestran también Regular, Malo y "Sin estado". |
| Vida útil vencida / próxima | Misma regla que la app de inventario (`VIDA_UTIL = 4`): años desde `fecha` (compra) ≥ 4 / ≥ 3 y < 4. |
| Sin fecha de compra | Fecha vacía o inválida; **no se mezcla** con los demás. Las cuatro categorías de vida útil suman los activos. |
Los porcentajes solo se muestran con **≥ 5 equipos activos**; con menos, "n de m".

**No disponible, y por qué (no se inventan):**
- **Garantías próximas a vencer:** el inventario guarda la garantía como texto libre ("1 año, vencida"); no se puede calcular el vencimiento con certeza.
- **Equipos en reparación:** el inventario registra reparaciones terminadas (con su resultado), no un estado "en reparación" vigente.
- *Necesidades documentadas (no implementadas; modificarían el inventario y requieren tu decisión):* un campo de fecha de vencimiento de garantía y un estado "en reparación".

**Costo de Firestore (decisión de la Dirección: no leer el inventario a diario).** Los procesos llegan por una sola suscripción compartida (solo cambios). **El inventario no se lee al abrir Inicio**: se lee una vez y el resultado se guarda como un resumen (`ti_resumenes/inventario`); cada visita posterior lee solo ese documento. Solo el Director o el Administrador pueden pulsar "Actualizar desde el inventario" (pide confirmación): ese botón lee todos los equipos una vez (una lectura por equipo; 500 equipos = 500 lecturas) y reemplaza el resumen. Se hace cuando haya cambios importantes. Pasados 30 días sin actualizar, el dashboard avisa "puede estar desactualizado" pero **nunca lee por su cuenta**.

*Por qué no "solo la diferencia":* el inventario no guarda fecha de modificación en cada equipo y no se va a modificar, así que Firestore no puede indicar qué cambió desde la última vez. Si algún día se agrega ese campo al inventario, la actualización podría leer solo lo modificado.

Un error de permisos en el inventario no afecta lo demás.

**Pendiente:** metas y tendencias. No existe un histórico de los indicadores; requeriría guardar un resumen mensual (decisión tuya).

## Catálogo inicial
El botón "Cargar catálogo inicial" crea los 21 nombres solicitados como **borradores vacíos**, marcados "plantilla", sin responsable y sin pasos. No se inventa ningún procedimiento. Se carga en tandas de 8 porque las reglas permiten 20 consultas de documentos por lote y cada proceso usa 2.

## Instalación y primer arranque
1. **No requiere compilar.** La carpeta `ti/` se publica junto al resto del repositorio donde ya está alojada la app de inventario. Nada se desplegó. Publicar la carpeta `ti/` **no cambia** la app de inventario.
2. **Reglas (acción de la persona administradora):** sigue `docs/PUBLICAR-REGLAS.md`. Las reglas actuales (cualquier usuario autenticado lee y escribe todo) están guardadas en `docs/reglas-anteriores.txt` para revertir. La propuesta las conserva para el inventario y protege solo `ti_*` y `usuarios_ti`. Cambia el correo de arranque si corresponde (en `firestore.rules` y en `TI.BOOTSTRAP_ADMINS` de `js/ti-core.js`).
3. **Primer ingreso:** el correo de arranque entra, abre "Usuarios, roles y auditoría" y pulsa "Crear mi registro de administrador". Después asigna roles a los demás (y el de Director de TI a quien corresponda: sin Director nadie puede aprobar).
4. Los usuarios deben existir en Firebase Authentication; la plataforma solo asigna roles.

Variables de entorno y secretos: **ninguno**. La configuración pública de Firebase (la misma de la app de inventario) está en `ti/index.html`.

## Pruebas
| Prueba | Resultado |
|---|---|
| `node --test tests/logica.test.js` — lógica pura | **54 de 54 correctas.** Lo anterior más la mesa de ayuda: matriz de prioridad, horario laboral (noches y fines de semana), pausas por espera, fecha objetivo, estados de SLA, permisos y flujo de acciones, ventana de reapertura, validación e indicadores con muestra mínima. |
| `node tests/integracion.js` — navegador con Firebase **simulado** en memoria | **146 de 146 correctas** (51 son de la mesa de ayuda: crear, asignar, atender, esperar, responder, resolver, confirmar y reabrir con distintos roles; visibilidad; nota interna; SLA configurado desde Administración; CSV; dashboard). Que `index.html` no cambió, dashboard de Inicio (cifras exactas con datos sembrados, caché y costo de lecturas, permisos por rol, estados vacíos, errores), arranque, equipo inicial, estructura del menú, roles por interfaz, catálogo, creación y validación, aprobación, publicación, versiones, técnico, solicitante, 9 vistas del inventario, auditoría, cierre de sesión, XSS y ausencia de errores de JavaScript. |
| `tests/reglas.test.js` — reglas con el emulador | **NO ejecutadas** (incluidas las nuevas de tickets). El entorno de desarrollo bloqueaba `registry.npmjs.org`, `gstatic.com` y `storage.googleapis.com`. Están escritas y listas para ejecutar donde haya internet. |

La simulación **no aplica reglas de seguridad**, así que las pruebas de integración no demuestran que las reglas funcionen. Tampoco se probó contra el Firebase real.

## Limitaciones conocidas
- **Reglas sin ejecutar** (arriba). Hasta correr `tests/reglas.test.js` no se debe considerar segura la propuesta.
- **Auditoría escrita por el navegador:** las reglas impiden editarla o borrarla, pero un cliente modificado podría omitir crear un evento. La versión a prueba de omisiones requiere Cloud Functions (plan Blaze, facturable; no autorizado).
- **`documentado` y el contenido de los campos** no se pueden verificar a fondo en las reglas.
- **Documentos como enlaces** (https). Subir archivos requiere Firebase Storage (plan Blaze).
- **Inventario sin cambios y sin endurecer:** `index.html` no se tocó y sigue abierto a cualquier usuario autenticado (regla actual conservada). Hasta publicar `firestore.rules`, las colecciones nuevas tampoco están protegidas: los roles son solo de pantalla.
- **Sin histórico de indicadores:** no hay metas ni tendencias hasta guardar un resumen mensual (decisión pendiente).
- **El inventario no registra garantías ni reparaciones en curso de forma calculable:** esos dos indicadores aparecen como "No disponible".
- **Error existente `confirmAction`** (ver diagnóstico).
- Si el Director de TI aún no existe, el administrador debe asignarse también ese rol o designar a alguien; la separación de funciones se mantiene.
- Un Administrador que también sea Director no puede aprobar lo que él mismo editó.

## Seguimiento de cambios
- 2026-10-14 — Fase 5: mesa de ayuda (tickets, prioridad, SLA configurable con horario y pausas, conversación con notas internas, indicadores con muestra mínima, configuración en Administración, sección en Inicio, reglas de Firestore propuestas y pruebas). Las reglas de tickets **no se han ejecutado**.
- 2026-10-14 — Fase 1 y primera versión de las Fases 2 y 3: `firestore.rules`, `tests/`, `docs/` y los módulos (primero con tres cambios en `index.html`; ver la corrección de rumbo siguiente).
- 2026-10-14 — Costo del inventario: el dashboard ya no lee los equipos al abrir; usa un resumen guardado que se actualiza solo a pedido.
- 2026-10-14 — Fase 4: dashboard de Inicio (atención por rol, procesos, inventario en solo lectura). Se corrige que un nuevo inicio de sesión conservaba la pantalla del usuario anterior.
- 2026-10-14 — **Corrección de rumbo:** la plataforma pasa a ser una app independiente en `ti/`; `index.html` (inventario) se restauró idéntico a la rama principal y ya no se modifica. El inventario es un módulo que se abre desde la plataforma.
- 2026-10-14 — Equipo inicial: ramaya Administrador + Director; vlopez, aosorio, soportetecnico y dgomez Responsables de proceso; botón "Asignar roles iniciales al equipo".
- 2026-10-14 — Reglas: se conoce la regla vigente (`docs/reglas-anteriores.txt`); `firestore.rules` pasa a conservarla para todo lo que no sea `ti_*`/`usuarios_ti`; guía `docs/PUBLICAR-REGLAS.md`.
