"""PRUEBA DE CONCEPTO (solo pruebas): firma un PDF con pyHanko y le agrega sello de tiempo RFC 3161.
Uso: python firmar_y_sellar.py entrada.pdf salida.pdf cert.p12 [TSA_URL]
La contraseña del .p12 se lee de la variable de entorno P12_PASSPHRASE (nunca por argumento ni en el código).
Un sello de FreeTSA NO es una constancia NOM-151 ni un servicio acreditado en México."""
import os, sys
from pyhanko.sign import signers, timestamps
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

entrada, salida, p12 = sys.argv[1:4]
tsa = sys.argv[4] if len(sys.argv) > 4 else "https://freetsa.org/tsr"
firmante = signers.SimpleSigner.load_pkcs12(p12, passphrase=os.environ["P12_PASSPHRASE"].encode())
from pyhanko.sign.timestamps.requests_client import RequestsHTTPTimeStamper  # respeta HTTPS_PROXY
ts = RequestsHTTPTimeStamper(tsa, timeout=30)  # solo se envía el hash de la firma
with open(entrada, "rb") as f:
    w = IncrementalPdfFileWriter(f)
    meta = signers.PdfSignatureMetadata(field_name="FirmaCAFIVER", md_algorithm="sha256",
                                        reason="Prueba de concepto CAFIVER (sin validez legal)")
    out = signers.PdfSigner(meta, signer=firmante, timestamper=ts).sign_pdf(w)
    open(salida, "wb").write(out.getbuffer())
print("OK:", salida)
