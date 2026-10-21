/**
 * Importa el padrón de la Semana TI a Firebase (una sola vez para arrancar).
 * Uso:
 *   1) Descarga la clave de servicio: Firebase Console → Configuración → Cuentas de servicio → Generar clave.
 *   2) GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node import_padron.js padron.csv
 *
 * Cada persona nueva recibe una contraseña inicial ALEATORIA (ya no existe una contraseña común). Las contraseñas se guardan en
 * contrasenas-iniciales.csv (solo en tu computadora; entrégalas en persona o por un canal privado y borra el archivo).
 * Opción  --reiniciar : también cambia la contraseña de las cuentas que YA existen (las que todavía usan la anterior).
 *                       Esas personas dejarán de poder entrar con la contraseña vieja hasta recibir la nueva.
 *
 * CSV esperado (encabezados): numero,nombre,direccion,departamento,role,agentId
 *   role = colaborador | consultor | director   (agentId solo para consultores, p. ej. CR)
 */
const admin = require("firebase-admin");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const DOMAIN = "ti.cafiver.mx";          // dominio sintético para el login por número
const crypto = require("crypto");
const REINICIAR = process.argv.includes("--reiniciar");
// Contraseña aleatoria legible: 10 caracteres sin letras que se confundan (sin 0/O/1/l/I).
function nuevaClave() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(10), b => abc[b % abc.length]).join("");
}

async function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith("--")) || "padron.csv";
  const claves = [["numero", "nombre", "contrasena_inicial"]];
  const rows = parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Importando ${rows.length} empleados...`);
  for (const r of rows) {
    const numero = String(r.numero).trim();
    const email = `${numero}@${DOMAIN}`;
    const role = (r.role || "colaborador").trim();
    const agentId = (r.agentId || "").trim() || null;

    // 1) cuenta de autenticación
    let user, clave = null;
    try {
      user = await admin.auth().getUserByEmail(email);
      if (REINICIAR) { clave = nuevaClave(); await admin.auth().updateUser(user.uid, { password: clave }); }
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;   // cualquier otro error no se oculta
      clave = nuevaClave();
      user = await admin.auth().createUser({ email, password: clave, displayName: r.nombre });
    }
    if (clave) claves.push([numero, r.nombre, clave]);

    // 2) custom claims (rol / identidad)
    await admin.auth().setCustomUserClaims(user.uid, { role, emp: numero, agentId });

    // 3) ficha en el padrón
    await db.collection("employees").doc(numero).set({
      numero, nombre: r.nombre, direccion: r.direccion || "", departamento: r.departamento || "",
      role, agentId, email, uid: user.uid, active: true
    }, { merge: true });

    console.log(`✓ ${numero} ${r.nombre} (${role}${agentId ? " / " + agentId : ""})`);
  }
  if (claves.length > 1) {
    fs.writeFileSync("contrasenas-iniciales.csv", claves.map(f => f.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n") + "\n", { mode: 0o600 });
    console.log(`Listo. ${claves.length - 1} contraseñas nuevas en contrasenas-iniciales.csv (entrégalas y borra el archivo).`);
  } else {
    console.log("Listo. No se creó ni reinició ninguna contraseña.");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
