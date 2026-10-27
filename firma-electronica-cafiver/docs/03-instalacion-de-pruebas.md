# Instalación de pruebas de Documenso (contenedor de desarrollo)

Solo pruebas: sin producción, sin correos reales, sin datos reales. Versión 2.21.1 (commit 8707e33), Community Edition.

## Resultado
- Aplicación compilada y sirviendo en `http://localhost:3000` (solo dentro del contenedor).
- Cuenta de prueba creada y verificada con el buzón SMTP local; sesión iniciada y panel de documentos visible
  (ver [capturas-documenso/](../capturas-documenso/)).
- PostgreSQL 16 local (`127.0.0.1:54320`), 166 migraciones aplicadas. Correos capturados por un SMTP local (`127.0.0.1:2500`) que no reenvía nada.
- Sellado con un certificado `.p12` **autofirmado de pruebas**: las firmas no tienen valor legal.
- **Flujo completo probado**: carga de PDF → firmante ficticio → campo de firma → envío (correo al buzón local) → firma con el enlace → documento `COMPLETED` → PDF sellado con firma CAdES válida (`pdfsig`).
- **Webhooks** hacia un receptor local (`SENT, OPENED, SIGNED, COMPLETED`): ejemplos redactados en [evidencias-pruebas/](../evidencias-pruebas/). Capturas del flujo en [capturas-documenso/flujo/](../capturas-documenso/flujo/).
- No se instaló/validó: sello RFC 3161, correo real, NOM-151, PSC. El webhook se registró insertando la fila en la base de pruebas (el formulario de la interfaz no se automatizó).

## Pasos que hubo que adaptar (útiles para repetir)
1. Node ≥ 24 y npm ≥ 11.17 (el contenedor traía 22 / 10): instalados vía npm en una carpeta aparte.
2. `npm ci --ignore-scripts` (el postinstall de `inngest-cli` descarga un binario de github.com).
3. Permitir en la red del entorno `binaries.prisma.sh` (motores de Prisma) y `github.com`.
4. Ejecutar a mano `npm run install` dentro de `node_modules/@documenso/skia-canvas` (binario nativo) y `npm rebuild esbuild sharp @prisma/engines prisma @prisma/client`.
5. `prisma generate` + `migrate deploy`.
6. Compilar solo la app: `NODE_OPTIONS=--max-old-space-size=10240 npx turbo run build --filter=@documenso/remix` (con el heap por defecto se agota la memoria; el sitio de documentación no compila sin sus scripts y no se necesita).
7. Arrancar: `cd apps/remix && npm run start`.

## Para producción (no hecho)
Secretos reales en gestor de secretos, certificado en HSM/KMS, SMTP corporativo, respaldos de PostgreSQL, almacenamiento S3 en lugar de base de datos, TLS y dominio propio, y revisión de licencia (AGPL / Enterprise).
