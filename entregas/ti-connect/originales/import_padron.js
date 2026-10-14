/**
 * Importa el padrón de la Semana TI a Firebase (una sola vez para arrancar).
 * Uso:
 *   1) Descarga la clave de servicio: Firebase Console → Configuración → Cuentas de servicio → Generar clave.
 *   2) GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node import_padron.js padron.csv
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
const DEFAULT_PASS = "Cafiver2026";       // contraseña inicial (el usuario la cambia después)

async function main() {
  const file = process.argv[2] || "padron.csv";
  const rows = parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Importando ${rows.length} empleados...`);
  for (const r of rows) {
    const numero = String(r.numero).trim();
    const email = `${numero}@${DOMAIN}`;
    const role = (r.role || "colaborador").trim();
    const agentId = (r.agentId || "").trim() || null;

    // 1) cuenta de autenticación
    let user;
    try { user = await admin.auth().getUserByEmail(email); }
    catch { user = await admin.auth().createUser({ email, password: DEFAULT_PASS, displayName: r.nombre }); }

    // 2) custom claims (rol / identidad)
    await admin.auth().setCustomUserClaims(user.uid, { role, emp: numero, agentId });

    // 3) ficha en el padrón
    await db.collection("employees").doc(numero).set({
      numero, nombre: r.nombre, direccion: r.direccion || "", departamento: r.departamento || "",
      role, agentId, email, uid: user.uid, active: true
    }, { merge: true });

    console.log(`✓ ${numero} ${r.nombre} (${role}${agentId ? " / " + agentId : ""})`);
  }
  console.log("Listo. Contraseña inicial:", DEFAULT_PASS);
}
main().catch(e => { console.error(e); process.exit(1); });
