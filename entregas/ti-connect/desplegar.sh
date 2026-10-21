#!/usr/bin/env bash
# Despliega los arreglos de TI Connect paso a paso, preguntando antes de cada uno.
# Ejecútalo DENTRO de la carpeta de tu proyecto TI_Connect_Firebase, después de copiar aquí los archivos de esta entrega.
set -e
PROYECTO="ti-connect-3d3a7"
pregunta() { read -r -p "$1 [s/N] " r; [[ "$r" == "s" || "$r" == "S" ]]; }

command -v firebase >/dev/null || { echo "Falta firebase-tools. Instálalo con:  npm install -g firebase-tools"; exit 1; }
[ -f firebase.json ] || { echo "Aquí no hay firebase.json: ejecuta este archivo dentro de la carpeta TI_Connect_Firebase."; exit 1; }

echo "Proyecto: $PROYECTO"
firebase use "$PROYECTO"

COPIA="respaldo-antes-del-arreglo-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$COPIA"
cp -r web firestore.rules storage.rules scripts "$COPIA"/ 2>/dev/null || true
echo "Copia local de lo que hay ahora en: $COPIA  (para revertir, copia esos archivos de vuelta y vuelve a desplegar)"

if pregunta "1/3  ¿Desplegar el SITIO (corrige el XSS)?"; then firebase deploy --only hosting; fi
echo
echo "Antes del paso 2, prueba la app: crea un ticket de prueba con el título  <img src=x onerror=alert(1)>  y revisa que no salga ninguna alerta."
if pregunta "2/3  ¿Desplegar las REGLAS DE FIRESTORE? (prueba antes en el Simulador de reglas de la consola)"; then firebase deploy --only firestore:rules; fi
if pregunta "3/3  ¿Desplegar las REGLAS DE STORAGE?"; then firebase deploy --only storage; fi
echo "Listo. Revisa LEEME.md, sección 'Pruebas después de desplegar'."
