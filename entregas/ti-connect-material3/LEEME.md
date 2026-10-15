# TI Connect · vista del colaborador en Material 3 (SIN DESPLEGAR)

Demo: https://claude.ai/artifact/DGwjGhZatb8oufJeDsz7Ss (antes y después, datos de ejemplo).

- `web/index.html`: el desplegado actual + (1) capa de estilos `<style id="m3-colaborador">` solo para `#empView`, (2) arreglo del listener de `e-cursos` (elemento inexistente que detiene la carga del colaborador), (3) sin el "Aviso crítico" escrito a mano.
- `web/sw.js`: `ti-connect-v9`.
- `m3-colaborador.css`: la misma capa de estilos por separado.
- `capturas/`: antes y después (390×844, datos DEMO).

Probado: capturas con la app real y un módulo de datos simulado (0 errores de JavaScript). No probado en un teléfono real ni con Firebase. Para revertir: volver al `index.html` y `sw.js` anteriores (con `ti-connect-v10`).
