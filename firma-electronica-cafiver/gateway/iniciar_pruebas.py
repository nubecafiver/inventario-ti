"""Arranque de PRUEBAS en un solo paso.
Crea (si no existen) un certificado AUTOFIRMADO de pruebas, descarga la raíz de FreeTSA y lanza el gateway.
NO usar con documentos reales. Uso:  python iniciar_pruebas.py [puerto]"""
import datetime, os, secrets, sys, urllib.request
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

base = Path(__file__).parent / "data"; (base / "roots").mkdir(parents=True, exist_ok=True)
p12, clave = base / "cert-pruebas.p12", base / "clave-pruebas.txt"
if not p12.exists():
    pw = secrets.token_urlsafe(16)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nombre = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CAFIVER DEMO"),
                        x509.NameAttribute(NameOID.COMMON_NAME, "CAFIVER PRUEBAS (autofirmado)")])
    ahora = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(nombre).issuer_name(nombre).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(ahora - datetime.timedelta(minutes=5))
            .not_valid_after(ahora + datetime.timedelta(days=365))
            .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
            .sign(key, hashes.SHA256()))
    p12.write_bytes(pkcs12.serialize_key_and_certificates(b"cafiver", key, cert, None,
                    serialization.BestAvailableEncryption(pw.encode())))
    clave.write_text(pw)
    print("Certificado de PRUEBAS creado en", p12)
raiz = base / "roots" / "freetsa.pem"
if not raiz.exists():
    try:
        urllib.request.urlretrieve("https://freetsa.org/files/cacert.pem", raiz)
    except Exception as e:
        print("Aviso: no se pudo bajar la raíz de FreeTSA (el sello se verá como no confiable):", e)
puerto = sys.argv[1] if len(sys.argv) > 1 else "8000"
os.environ.update(P12_PATH=str(p12), P12_PASSPHRASE=clave.read_text(), WEBHOOK_SECRET=secrets.token_hex(16),
                  TRUSTED_ROOTS=str(base / "roots"), DATA_DIR=str(base))
print(f"\n>>> Abre http://localhost:{puerto} en tu navegador (Ctrl+C para detener)\n")
import uvicorn
uvicorn.run("app:app", host="127.0.0.1", port=int(puerto), app_dir=str(Path(__file__).parent))
