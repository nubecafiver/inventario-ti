# CAFIVER Firma Digital — Gateway de pruebas

Python (FastAPI) + pyHanko (MIT). **Solo pruebas, sin validez legal, sin constancias NOM-151 reales.**

Funciones: firmar PDF y sellarlo RFC 3161, verificar PDFs, recibir webhooks de Documenso (secreto compartido), registrar constancias **simuladas**, auditoría.

## Arranque rápido (pruebas)
```
python -m venv v
v/bin/pip install pyHanko requests fastapi uvicorn python-multipart     # Windows: v\Scripts\pip
v/bin/python iniciar_pruebas.py            # Windows: v\Scripts\python
```
Crea solo un certificado autofirmado de pruebas y abre en `http://localhost:8000`.

## Ejecutar a mano
```
python -m venv v && v/bin/pip install pyHanko requests fastapi uvicorn python-multipart
P12_PATH=cert.p12 P12_PASSPHRASE=*** WEBHOOK_SECRET=*** TRUSTED_ROOTS=./roots DATA_DIR=./data \
  v/bin/uvicorn app:app --port 8000
```
Variables solo por entorno; la llave nunca llega al navegador. `TRUSTED_ROOTS` = carpeta con raíces `.pem` que se consideran confiables.

## Pendiente
- Descargar el PDF final de Documenso por API (requiere token de API) al recibir `DOCUMENT_COMPLETED`.
- Adaptador real del PSC (hoy simulado), revocación CRL/OCSP, LTV, autenticación de usuarios, HSM, PostgreSQL en lugar de SQLite.
