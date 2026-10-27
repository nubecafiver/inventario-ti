# Firma electrónica CAFIVER — evaluación, diseño y demostración

**Todo es DEMOSTRACIÓN / DISEÑO. No hay despliegue, integración real, firmas ni constancias oficiales.**

| Entregable | Archivo |
|---|---|
| 1–3. Comparación, recomendación y licencias | [docs/01-evaluacion-y-recomendacion.md](docs/01-evaluacion-y-recomendacion.md) |
| 4. Diagrama de arquitectura (Mermaid) + diseño PSC | [docs/02-arquitectura-y-psc.md](docs/02-arquitectura-y-psc.md) |
| 5. Demostración navegable (abrir en el navegador) | [demo/index.html](demo/index.html) |
| 6. Imagen conceptual | [concepto.png](concepto.png) · [concepto.svg](concepto.svg) |
| 7–8. Reutilizado/pendiente y requisitos a producción | sección 4 y 5 de `docs/02-…` |
| Capturas de la demo | [capturas/](capturas/) |

**Recomendación:** Documenso (Community, AGPL-3.0) + *PSC Gateway* propio y desacoplado.

## Sobre la demostración
- Archivo único, sin dependencias ni red; los PDF "cargados" no salen del navegador.
- Es una **maqueta independiente**: toma los *tokens de diseño* de Documenso (verde primario, radio 0.5rem) y su estructura de estados/roles,
  pero **no copia código de Documenso**. La reutilización real de sus componentes (`packages/ui`) requiere instalar el proyecto
  (Node ≥ 24, PostgreSQL) y es el siguiente paso, previa autorización.
- Roles conceptuales (selector inferior izquierdo): Administrador, Solicitante, Firmante, Auditor.
- Logotipo: marcador "C" provisional; se sustituirá con el archivo oficial de CAFIVER cuando se proporcione.
- Tarifas del reporte: supuestos editables y ficticios.

## Pendientes que requieren a CAFIVER
1. Elegir PSC y entregar su **documentación oficial** (no se inventaron endpoints ni credenciales).
2. Revisión legal (tipo de firma, valor probatorio, AGPL, frontera del gateway).
3. Logotipo oficial y paleta corporativa.
4. Decidir si se contrata Documenso Enterprise (2FA/passkeys, SSO).

Repositorios evaluados (solo lectura, no modificados): OpenSignLabs/OpenSign @ a6ecc43 · documenso/documenso @ 8707e33.
