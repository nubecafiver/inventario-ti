# ZKE80_EDOPRE – clon de KE80 con salida a CSV

Reproduce lo que se ejecuta hoy con **KE80 → Z8-PCA001G → variante EDOPRE**:
Plan / Real / Desviación / Desv.% del grupo de CeBe (p. ej. `VAQUERO`) con el
grupo de cuentas de resultados `EDOPRE`, ledger `8A`, sociedad `KF01`.
En lugar de ejecutar el Report Writer, lee los totales EC-PCA (tabla `GLPCT`,
`RRCTY` 0 = real, 1 = plan) y suma los períodos `HSLxx` pedidos.

Archivo: `ZKE80_EDOPRE.abap`

## Instalación (en DEV, luego transporte)
1. **SE38** → crear `ZKE80_EDOPRE` (programa ejecutable) y pegar el código.
2. **Textos de selección** (Ir a → Elementos de texto): títulos `001` Selección,
   `002` Grupos, `003` Salida; y descripciones de cada parámetro.
3. **SE93** → transacción `ZKE80` → *Transacción de informe* → programa
   `ZKE80_EDOPRE`. Opcional: variante con `KF01`, `8A`, `EDOPRE`, área de CeBe
   y plan de cuentas ya cargados.
4. Asignar la transacción al rol de los usuarios (PFCG).

## Puntos a verificar en el sistema (no tengo acceso a SAP)
- **GS03**: clase de set del grupo `EDOPRE` (el código asume `0H`, cuentas de
  mayor por plan de cuentas) y de `VAQUERO` (`0106`, CeBe por área de CeBe).
  Si `EDOPRE` es un conjunto propio de Report Writer, ajustar la clase en
  `FORM get_sets`.
- **SE11 `GLPCT`**: nombres `RBUKRS`, `RPRCTR`, `RACCT`, `HSL01..HSL16`.
  Si el informe muestra moneda de CeBe, cambiar `HSL` por `KSL`.
- **SE11 `RGSBV`**: nombres de campos valor desde/hasta (el código prueba
  `VFROM/VTO` y `FROM/TO`).
- Validar el resultado contra KE80: p. ej. VAQUERO, período 9/2026, versión 0,
  Real = -45,242,056.59. La suma debe coincidir; si no, revisar signos,
  el grupo de cuentas y si el informe incluye saldos arrastrados.
- Falta un `AUTHORITY-CHECK` (objeto de EC-PCA, p. ej. `K_PCA`); añadir según
  la política de seguridad.

## Salida
- ALV en pantalla (marcar *ALV*).
- **CSV en PC**: parámetro de archivo local (F4 abre el diálogo); UTF-8 con BOM,
  separador `;`, decimales con punto.
- **CSV en servidor** (para fondo/job SM36): ruta de aplicación (AL11).
- Marcar *Desglosar por CeBe* para una fila por CeBe y cuenta.
