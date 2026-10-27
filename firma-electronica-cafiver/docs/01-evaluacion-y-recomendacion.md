# Plataforma de firma electrónica CAFIVER — Fase 1: Evaluación

> Estado: **evaluación y diseño. No hay código productivo.** Los proyectos originales se clonaron en modo
> lectura (`--depth 1`) fuera de este repositorio y **no se modificaron**.
> Este documento no es asesoría legal; los puntos jurídicos requieren revisión del área legal de CAFIVER.

## 1. Base de la evaluación

| | OpenSign | Documenso |
|---|---|---|
| Versión revisada (código) | 2.37.0 (commit del 26-oct-2026) | 2.21.1 (commit del 22-oct-2026) |
| Actividad | Activa | Activa |
| Popularidad* | ~6.5 mil ★ | ~13 mil ★ |

\* Cifras de un comparador de terceros (openalternative.co); pueden estar desactualizadas. Todo lo demás de este
documento se verificó leyendo el código de los repositorios clonados.

## 2. Comparación técnica

| Aspecto | OpenSign | Documenso |
|---|---|---|
| Front-end | React 19 + Vite (SPA), i18next | React 19 + React Router 7 (SSR), Tailwind + primitivas shadcn/Radix (`packages/ui`) |
| Back-end | **Parse Server** + Express 5 (funciones "cloud" en JS) | Hono + tRPC + API REST pública, TypeScript de punta a punta |
| Base de datos | **MongoDB** | **PostgreSQL** (Prisma) |
| Firma del PDF | `@signpdf/signpdf` + `pdf-lib` (certificado en servidor) | `@libpdf/core`; transportes de sellado: archivo local `.p12`, **Google Cloud HSM**, y modo **CSC** (Cloud Signature Consortium) |
| Sellos de tiempo | No encontré soporte RFC 3161 en el código revisado | **Sí**: autoridad de sellado configurable (RFC 3161), `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` |
| Webhooks | Sí (evento vía función cloud `triggerEvent`) + API v1 con llave | Sí, catálogo de eventos (`DOCUMENT_CREATED/SENT/OPENED/SIGNED/COMPLETED/REJECTED/CANCELLED`, `RECIPIENT_EXPIRED`, plantillas…) + API REST documentada |
| Roles | Administrador / usuario, equipos | Organización y equipo: `ADMIN / MANAGER / MEMBER`; destinatarios: `SIGNER, APPROVER, VIEWER, CC, ASSISTANT` |
| Estados del documento | (no verificado en detalle) | `DRAFT, PENDING, COMPLETED, REJECTED, CANCELLED` |
| Auditoría | Bitácora + certificado de finalización (IP, correo, teléfono, fechas) | Tabla `DocumentAuditLog` (tipo, datos, IP, user-agent) + certificado de firma |
| Plantillas / firma múltiple / orden / OTP / expiración / rechazo | Sí | Sí |
| Idiomas | `es` presente (1 686 claves, mismo tamaño que `en`) | `es` presente (`web.po`, ~406 cadenas vacías pendientes). **Ninguno trae `es-MX` específico.** |
| Referencias a México / NOM-151 | **Ninguna** en `apps/` | **Ninguna** en documentación ni `packages/` |
| Cumplimiento declarado | No lo declara con respaldo verificable | ESIGN/UETA y eIDAS-SES "Compliant"; AES/QES "Planned" (su propia documentación) |
| Despliegue | Docker Compose (app + server + Mongo) | Docker; Node ≥ 24, monorepo con Turbo, PostgreSQL |
| Costo de infraestructura | Bajo (3 contenedores) | Bajo–medio (app + PostgreSQL); un tercero reporta ~5–15 USD/mes en PaaS |

## 3. Licencia y obligaciones

### OpenSign
- **AGPL-3.0**, con una **excepción**: el directorio `apps/OpenSignServer/cloud/customRoute` "se licencia bajo la licencia
  definida en ese directorio". **Ese directorio no contiene ningún archivo de licencia** (solo `.js`). Es una
  ambigüedad real (contiene, entre otras, `docxtopdf.js`, `decryptpdf.js` y rutas de borrado de cuenta).
  → Antes de adoptarlo habría que pedir aclaración por escrito a OpenSign Labs.

### Documenso
- **Licencia dual**: la Community Edition es **AGPL-3.0**; lo que está en `packages/ee/` es **licencia comercial**
  (Documenso Enterprise Edition).
- Funciones EE (archivo `packages/ee/FEATURES`): módulo de facturación Stripe, portal de autenticación de organización
  (SSO), **reautenticación de acciones con passkeys y 2FA**, 21 CFR, dominios de correo propios, *embed authoring* y
  su marca blanca, soporte enterprise.
  → **Uso en producción solo con suscripción**; para desarrollo y pruebas se permite sin suscripción.

### Implicaciones prácticas (AGPL-3.0)
| Escenario | Consecuencia |
|---|---|
| Usar sin modificar, autoalojado para uso interno | Sin obligación de publicar código; conservar avisos y licencia. |
| Modificar y ofrecerlo por red a usuarios | Hay que **ofrecer el código fuente completo de la versión modificada** a esos usuarios, bajo AGPL-3.0 (§13). Quién cuenta como "usuario" (¿empleados? ¿firmantes externos?) debe confirmarlo legal. |
| Cambios propietarios que CAFIVER quiera mantener privados | No permitidos bajo AGPL; opción: licencia comercial/Enterprise de Documenso. |
| Sistemas CAFIVER (SAP, PSC Gateway) que hablan con la plataforma por API/webhooks | Programas **separados** que se comunican por HTTP normalmente no son obra derivada; **confirmar con legal** y mantener la frontera estricta (sin importar código AGPL en ellos). |
| Marca / logotipo de CAFIVER | Cambios de tema son modificaciones → quedan bajo AGPL si se despliega modificado. Respetar avisos de copyright. |
| Contribuciones upstream | Documenso exige CLA (`CLA.md`). |

## 4. ¿Qué incluye ya y qué falta?

**Incluido (en ambos, con matices):** carga de PDF, campos de firma, múltiples firmantes, orden de firma, plantillas,
recordatorios, rechazo, expiración, correos, certificado de finalización, bitácora, API y webhooks.

**Desarrollo pendiente para CAFIVER (ninguno de los dos lo trae):**
1. Localización **es-MX** y términos legales mexicanos.
2. **Servicio PSC Gateway** (NOM-151) desacoplado — ver `02-arquitectura-y-psc.md`.
3. Relación documento original ↔ firmado ↔ constancia, y su visualización/descarga.
4. Identificación del firmante conforme a la política de CAFIVER (INE/CURP, FIEL/e.firma, OTP, etc.) — definir con legal.
5. Reporte de uso y costo por constancia.
6. Tema corporativo y logotipo oficial (no proporcionado aún).
7. Integración con SAP y directorio corporativo (SSO) — fuera de alcance de la demo.
8. Endurecimiento: respaldo, retención, gestión de secretos, monitoreo, pruebas de penetración.

## 5. Integración de una API externa para constancias NOM-151

| | OpenSign | Documenso |
|---|---|---|
| Punto de enganche limpio sin tocar el núcleo | Hooks de Parse (`DocumentAftersave`) — **implica modificar el servidor** | **Webhook `DOCUMENT_COMPLETED`** + API REST para descargar el PDF sellado → servicio externo; **cero modificación** del núcleo |
| Dónde guardar la constancia | Colección Mongo propia o archivo adjunto | Base y almacenamiento del propio gateway (PostgreSQL/S3 propios), enlazado por `envelopeId` |
| Riesgo AGPL | Mayor (hay que modificar) | Menor (patrón sidecar) |

→ Con Documenso la integración puede vivir **100 % fuera** del proyecto, que es el escenario más favorable para AGPL.

## 6. Limitaciones técnicas y de seguridad (ambos)
- Ninguno es un PSC: **no emiten constancias NOM-151** ni certificados acreditados en México.
- Sellado con certificado propio (`.p12`) = integridad, no identidad acreditada. Proteger la llave (HSM/KMS).
- El sello RFC 3161 de Documenso **no equivale** a una constancia NOM-151.
- Documenso sin EE: sin reautenticación con 2FA/passkeys por acción ni SSO de organización (hoy sustituible por OTP/correo y proxy SSO a validar).
- Revisión de dependencias, CVE y actualizaciones frecuentes (ambos versionan rápido) → proceso de parches.
- Envío por correo: configurar SPF/DKIM/DMARC; los enlaces de firma son credenciales — expiración y rate limit.
- Retención y privacidad: aviso de privacidad (LFPDPPP) para datos de firmantes (IP, user-agent).

## 7. Recomendación

**Documenso (Community Edition) como base**, con un **PSC Gateway** propio y desacoplado.

Razones:
1. **Integración sin modificar el núcleo** (webhooks + API) → menor exposición a AGPL y actualizaciones sencillas.
2. **PostgreSQL + TypeScript tipado**: encaja con la infraestructura habitual de TI y facilita auditoría y reportes.
3. **Transportes de sellado intercambiables** (local, HSM en la nube, CSC) y **RFC 3161 nativo** → camino hacia llaves protegidas y a una integración con un PSC que ofrezca CSC.
4. **Licenciamiento claro**: la frontera AGPL/comercial está explícita (`packages/ee`), a diferencia de la excepción sin texto de OpenSign.
5. Mejor base de UI (shadcn/Radix + Tailwind) para tema corporativo y para la demostración.

Contras aceptados: pila más pesada (Node ≥ 24, monorepo), sin funciones EE salvo contratar, `es` genérico.
**Cuándo reconsiderar OpenSign:** si se prioriza el despliegue mínimo y se obtiene aclaración escrita de la licencia de `customRoute`.

Siguiente decisión pendiente para CAFIVER: ¿presupuesto para EE (2FA/passkeys, SSO) o se cubren esos requisitos de otra forma?
