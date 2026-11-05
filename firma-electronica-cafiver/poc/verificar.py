"""Verifica firma y sello de tiempo de un PDF con pyHanko.
Uso: python verificar.py documento.pdf raiz_firmante.pem raiz_tsa.pem
Solo declara 'confiable' lo que valida contra las raíces que se le indiquen."""
import sys
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature, validate_pdf_timestamp
from pyhanko_certvalidator import ValidationContext
from pyhanko.keys import load_cert_from_pemder

pdf, raiz_firmante, raiz_tsa = sys.argv[1:4]
raices = [load_cert_from_pemder(raiz_firmante), load_cert_from_pemder(raiz_tsa)]
vc = ValidationContext(trust_roots=raices, allow_fetching=False)
r = PdfFileReader(open(pdf, "rb"))
for sig in r.embedded_regular_signatures:
    st = validate_pdf_signature(sig, signer_validation_context=vc, ts_validation_context=vc)
    print("Campo:", sig.field_name)
    print("Integridad:", st.intact, "| Firma válida:", st.valid, "| Cobertura:", st.coverage.name)
    print("Certificado confiable (según raíces dadas):", st.trusted)
    print("Sello de tiempo presente:", st.timestamp_validity is not None)
    if st.timestamp_validity:
        t = st.timestamp_validity
        print("  Sello íntegro:", t.intact, "| válido:", t.valid, "| confiable:", t.trusted, "| fecha:", t.timestamp)
