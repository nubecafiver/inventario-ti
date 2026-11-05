# Prueba de concepto: firma PDF + sello de tiempo RFC 3161 (PRUEBAS)

**Solo pruebas. No tiene validez legal. No es constancia NOM-151.**

- `firmar_y_sellar.py`: firma un PDF con pyHanko 0.38.1 y pide sello de tiempo a FreeTSA (solo viaja el hash de la firma).
- `verificar.py`: valida integridad, firma y sello contra las raíces indicadas.
- `evidencia/`: PDF de ejemplo (documento ficticio), salida de `pdfsig` y de la verificación.

## Resultado
| Comprobación | Resultado |
|---|---|
| Integridad del PDF | Correcta (cobertura: archivo completo) |
| Firma criptográfica | Válida |
| Sello de tiempo RFC 3161 (FreeTSA) | Presente, íntegro, válido y confiable contra la raíz publicada por FreeTSA |
| Certificado del firmante | **No confiable** para un tercero: es autofirmado de pruebas. Solo "confiable" si se declara como raíz propia |
| Adobe Acrobat | **No probado** (no hay Adobe en este entorno). Se espera "emisor no confiable" con este certificado |
| Revocación (CRL/OCSP) | No evaluada: el certificado de prueba no tiene puntos de revocación |

## Limitaciones
- FreeTSA es un servicio gratuito de terceros, no acreditado en México y sin garantías de servicio; no sustituye a un PSC.
- Para que Adobe marque la firma como confiable hace falta un certificado de una emisora de la lista AATL (de pago).
- Para el sello LTV completo se requiere cadena y revocación del certificado real.

## Uso
```
python -m venv v && v/bin/pip install pyHanko requests
P12_PASSPHRASE=<contraseña> v/bin/python firmar_y_sellar.py entrada.pdf salida.pdf cert.p12
```
En este entorno hubo que usar el cliente `requests` de pyHanko porque el cliente por defecto (aiohttp) ignora el proxy.
