"""CAFIVER Firma Digital — Gateway de PRUEBAS.

Firma PDF con pyHanko (+ sello RFC 3161), verifica PDFs, recibe webhooks de Documenso y
registra constancias NOM-151 SIMULADAS. NADA de esto tiene validez legal ni emite constancias oficiales.

Configuración solo por variables de entorno (nunca en el código ni en el navegador):
  P12_PATH, P12_PASSPHRASE   certificado de pruebas del firmante
  TSA_URL                    servidor RFC 3161 (por defecto FreeTSA, solo pruebas)
  WEBHOOK_SECRET             secreto compartido con Documenso
  TRUSTED_ROOTS              carpeta con raíces PEM que se consideran confiables (opcional)
  DATA_DIR                   carpeta de datos (por defecto ./data)
"""
import hashlib, hmac, json, os, sqlite3, time, uuid
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from starlette.concurrency import run_in_threadpool
from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import signers
from pyhanko.sign.timestamps.requests_client import RequestsHTTPTimeStamper
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

DATA = Path(os.environ.get("DATA_DIR", "data")); DATA.mkdir(exist_ok=True, parents=True)
(DATA / "pdf").mkdir(exist_ok=True)
MAX_BYTES = 15 * 1024 * 1024
TSA_URL = os.environ.get("TSA_URL", "https://freetsa.org/tsr")
db = sqlite3.connect(DATA / "gateway.db", check_same_thread=False)
db.executescript("""
create table if not exists eventos(id integer primary key, ts real, tipo text, envelope text, detalle text);
create table if not exists documentos(id text primary key, ts real, nombre text, sha256 text, origen text);
create table if not exists constancias(id text primary key, ts real, doc_id text, sha256 text, estado text, nota text);
create table if not exists auditoria(id integer primary key, ts real, accion text, detalle text);
""")
app = FastAPI(title="CAFIVER Firma Digital (pruebas)")


def audit(accion, detalle=""):
    db.execute("insert into auditoria(ts,accion,detalle) values(?,?,?)", (time.time(), accion, detalle)); db.commit()


async def leer_pdf(f: UploadFile) -> bytes:
    data = await f.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "El archivo excede 15 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "No es un PDF")
    return data


def _roots():
    d = os.environ.get("TRUSTED_ROOTS")
    return [load_cert_from_pemder(str(p)) for p in sorted(Path(d).glob("*.pem"))] if d else []


@app.post("/api/firmar")
async def firmar(file: UploadFile = File(...)):
    data = await leer_pdf(file)
    p12, pw = os.environ.get("P12_PATH"), os.environ.get("P12_PASSPHRASE")
    if not p12 or pw is None:
        raise HTTPException(503, "Certificado de pruebas no configurado en el servidor")
    import io
    firmante = signers.SimpleSigner.load_pkcs12(p12, passphrase=pw.encode())
    meta = signers.PdfSignatureMetadata(field_name=f"Firma{int(time.time())}", md_algorithm="sha256",
                                        reason="PRUEBAS CAFIVER - sin validez legal")
    try:
        firmador = signers.PdfSigner(meta, signer=firmante, timestamper=RequestsHTTPTimeStamper(TSA_URL, timeout=30))
        # pyHanko usa su propio ciclo asyncio: se ejecuta en un hilo aparte
        out = await run_in_threadpool(lambda: firmador.sign_pdf(IncrementalPdfFileWriter(io.BytesIO(data))))
    except Exception as e:  # sello de tiempo inaccesible, PDF cifrado, etc.
        audit("firma_error", type(e).__name__)
        raise HTTPException(502, f"No se pudo firmar/sellar: {type(e).__name__}")
    pdf = out.getvalue(); did = uuid.uuid4().hex[:12]
    (DATA / "pdf" / f"{did}.pdf").write_bytes(pdf)
    sha = hashlib.sha256(pdf).hexdigest()
    db.execute("insert into documentos values(?,?,?,?,?)", (did, time.time(), file.filename, sha, "firmado-en-gateway")); db.commit()
    audit("firma", f"{did} {sha[:16]}")
    return {"id": did, "sha256": sha, "descarga": f"/api/descargar/{did}", "tsa": TSA_URL}


@app.get("/api/descargar/{did}")
def descargar(did: str):
    p = DATA / "pdf" / f"{Path(did).name}.pdf"
    if not p.exists():
        raise HTTPException(404, "No existe")
    audit("descarga", did)
    return FileResponse(p, media_type="application/pdf", filename=f"firmado-{did}.pdf")


@app.post("/api/verificar")
async def verificar(file: UploadFile = File(...)):
    data = await leer_pdf(file)
    import io
    roots = _roots()
    vc = ValidationContext(trust_roots=roots or None, allow_fetching=False)
    r = PdfFileReader(io.BytesIO(data)); res = []
    for sig in r.embedded_regular_signatures:
        try:
            st = await run_in_threadpool(lambda: validate_pdf_signature(sig, signer_validation_context=vc, ts_validation_context=vc))
            t = st.timestamp_validity
            res.append({"campo": sig.field_name, "integro": st.intact, "firma_valida": st.valid,
                        "cobertura": st.coverage.name, "certificado_confiable": st.trusted,
                        "firmante": st.signing_cert.subject.human_friendly,
                        "emisor": st.signing_cert.issuer.human_friendly,
                        "autofirmado": st.signing_cert.self_signed != "no",
                        "sello_tiempo": None if not t else {"integro": t.intact, "valido": t.valid,
                                                              "confiable": t.trusted, "fecha": str(t.timestamp)},
                        "revocacion": "No evaluada (sin consulta CRL/OCSP en esta prueba)"})
        except Exception as e:
            res.append({"campo": sig.field_name, "error": type(e).__name__})
    audit("verificacion", f"{len(res)} firmas")
    return {"sha256": hashlib.sha256(data).hexdigest(), "firmas": res,
            "raices_configuradas": len(roots),
            "aviso": "Adobe Acrobat no se evalúa aquí. 'Confiable' solo significa confiable contra las raíces configuradas. "
                     "Ni esto ni Adobe prueban validez legal ni sustituyen una constancia NOM-151."}


@app.post("/webhook/documenso")
async def webhook(req: Request, x_documenso_secret: str = Header(default="")):
    esperado = os.environ.get("WEBHOOK_SECRET", "")
    if not esperado or not hmac.compare_digest(x_documenso_secret, esperado):
        audit("webhook_rechazado")
        raise HTTPException(401, "Secreto inválido")
    body = await req.json(); p = body.get("payload", {})
    db.execute("insert into eventos(ts,tipo,envelope,detalle) values(?,?,?,?)",
               (time.time(), body.get("event"), p.get("envelopeId"), json.dumps({"titulo": p.get("title"), "estado": p.get("status")})))
    db.commit(); audit("webhook", f"{body.get('event')} {p.get('envelopeId')}")
    return {"ok": True}


@app.get("/api/eventos")
def eventos():
    return [dict(zip(("ts", "tipo", "envelope", "detalle"), r)) for r in
            db.execute("select ts,tipo,envelope,detalle from eventos order by id desc limit 50")]


@app.get("/api/documentos")
def documentos():
    return [dict(zip(("id", "ts", "nombre", "sha256", "origen"), r)) for r in
            db.execute("select * from documentos order by ts desc limit 50")]


@app.post("/api/nom151/simular/{did}")
def nom151_simular(did: str):
    row = db.execute("select sha256 from documentos where id=?", (did,)).fetchone()
    if not row:
        raise HTTPException(404, "Documento no encontrado")
    cid = "SIMULADA-" + uuid.uuid4().hex[:8]
    db.execute("insert into constancias values(?,?,?,?,?,?)", (cid, time.time(), did, row[0], "SIMULACION",
               "Registro ficticio. No hay PSC conectado; no es una constancia oficial."))
    db.commit(); audit("nom151_simulada", cid)
    return {"id": cid, "estado": "SIMULACION", "nota": "No es una constancia NOM-151."}


@app.get("/api/constancias")
def constancias():
    return [dict(zip(("id", "ts", "doc_id", "sha256", "estado", "nota"), r)) for r in
            db.execute("select * from constancias order by ts desc limit 50")]


@app.get("/api/auditoria")
def auditoria():
    return [dict(zip(("ts", "accion", "detalle"), r)) for r in
            db.execute("select ts,accion,detalle from auditoria order by id desc limit 100")]


@app.get("/", response_class=HTMLResponse)
def home():
    return (Path(__file__).parent / "index.html").read_text(encoding="utf8")
