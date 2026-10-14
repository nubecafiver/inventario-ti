/* Recorrido con DATOS DE EJEMPLO (todo lo que se ve es DEMO). Usa el Firebase simulado en memoria: NO toca tu Firebase.
   Genera capturas en demo/recorrido/img/ y la página demo/recorrido/index.html.
   Uso: node tests/recorrido.js   (PLAYWRIGHT_MODULE y CHROMIUM como en integracion.js) */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const L = require('../ti/js/ti-logic.js');
const RAIZ = path.resolve(__dirname, '..'), IMG = path.join(RAIZ, 'demo', 'recorrido', 'img');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');
const URL_APP = 'file://' + path.join(RAIZ, 'ti', 'index.html');
const GER = 'ramaya@cafiver.com.mx', CONS = 'vlopez@cafiver.com.mx', CONS2 = 'aosorio@cafiver.com.mx';
const USERS = {}; [GER, CONS, CONS2].forEach((e) => { USERS[e] = 'pw'; });
const ahora = Date.now(), D = 86400000, iso = (n) => new Date(ahora + n * D).toISOString().slice(0, 10);
const S = {};
[[GER, 'Roberto Amaya (DEMO)', ['gerente']], [CONS, 'Valery López (DEMO)', ['consultor']], [CONS2, 'Alan Osorio (DEMO)', ['consultor']]].forEach(([e, n, r]) => { S['usuarios_ti/' + e] = { email: e, nombre: n, roles: r, activo: true }; });

/* Procesos */
function proceso(n, nombre, cat, estado, extra, pasos) {
  const id = 'PRO-' + ('000' + n).slice(-3), c = L.contenidoVacio();
  if (pasos) { c.objetivo = 'Objetivo de ejemplo (DEMO).'; c.alcance = 'Alcance de ejemplo (DEMO).'; c.pasos = pasos.map((d) => Object.assign(L.pasoVacio(), { descripcion: d, responsable: 'Consultor' })); }
  const vig = ['publicado', 'en_revision_periodica'].includes(estado);
  S['ti_procesos/' + id] = Object.assign({ codigo: id, nombre: nombre + ' (DEMO)', categoria: cat, responsable: CONS, participantes: [CONS2], periodoRevisionMeses: 12, estado, versionTrabajo: 1, versionPublicada: vig ? 1 : null, proximaRevision: vig ? iso(120) : null, documentado: vig, creadoPor: CONS }, extra || {});
  S['ti_procesos/' + id + '/versiones/1'] = { numero: 1, estado, contenido: c, editores: [CONS], creadoPor: CONS, aprobacion: vig ? { por: GER, fecha: iso(-30) } : null };
}
proceso(1, 'Gestión de incidentes', 'Servicio', 'publicado', {}, ['Registrar el ticket', 'Clasificar y priorizar', 'Resolver y confirmar']);
proceso(2, 'Gestión de cambios', 'Cambios', 'pendiente_aprobacion', {}, ['Solicitar el cambio', 'Evaluar riesgo']);
proceso(3, 'Administración de accesos', 'Accesos', 'borrador', {});
proceso(4, 'Gestión de respaldos', 'Continuidad', 'publicado', { proximaRevision: iso(-10), participantes: [] }, ['Programar respaldos', 'Probar restauración']);
proceso(5, 'Seguridad informática', 'Seguridad', 'en_revision', {}, ['Revisar controles']);

/* Mesa de ayuda */
S['ti_config/tickets'] = { categorias: L.configTicketsPorDefecto().categorias, sla: { 'sap|critica': { respuestaH: 1, resolucionH: 8 }, 'redes|alta': { respuestaH: 2, resolucionH: 24 } }, horario: { dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' }, ventanaReaperturaDias: 5, alertaPct: 25 };
const tk = (n, extra) => { const id = 'TCK-' + ('0000' + n).slice(-4); S['ti_tickets/' + id] = Object.assign({ codigo: id, titulo: 'Ticket de ejemplo (DEMO)', descripcion: 'Descripción de ejemplo (DEMO).', tipo: 'incidente', categoria: 'redes', impacto: 'medio', urgencia: 'media', prioridad: 'media', estado: 'nuevo', solicitanteEmail: CONS2, responsable: null, evidencias: [], esperas: [], escaladoNivel: 0, reaperturas: 0, primeraRespuestaMs: null, resueltoMs: null, cerradoMs: null, creadoMs: ahora - 2 * 3600000 }, extra || {}); };
tk(1, { titulo: 'SAP no abre en contabilidad (DEMO)', categoria: 'sap', impacto: 'alto', urgencia: 'alta', prioridad: 'critica', creadoMs: ahora - 3 * D });
tk(2, { titulo: 'Impresora de recepción sin tinta (DEMO)', categoria: 'impresoras', estado: 'asignado', responsable: CONS, prioridad: 'baja', impacto: 'bajo' });
tk(3, { titulo: 'Sin internet en bodega (DEMO)', categoria: 'redes', estado: 'en_atencion', responsable: CONS, impacto: 'alto', urgencia: 'alta', prioridad: 'critica', primeraRespuestaMs: ahora - 3600000 });
tk(4, { titulo: 'Alta de usuario nuevo (DEMO)', tipo: 'solicitud', categoria: 'accesos', estado: 'espera_usuario', responsable: CONS2, esperas: [{ desde: ahora - 3600000, hasta: null, tipo: 'usuario' }], primeraRespuestaMs: ahora - 7200000 });
tk(5, { titulo: 'Laptop lenta (DEMO)', categoria: 'computadoras', estado: 'resuelto', responsable: CONS, resueltoMs: ahora - 86400000, diagnostico: 'Disco lleno (DEMO)', solucion: 'Limpieza y ampliación (DEMO)', primeraRespuestaMs: ahora - 2 * D });
S['ti_tickets/TCK-0003/comentarios/c1'] = { texto: 'Estoy revisando el enlace de la bodega (DEMO).', autor: CONS, interno: false, fechaMs: ahora - 3000000 };
S['ti_tickets/TCK-0003/comentarios/c2'] = { texto: 'Nota interna: posible falla del proveedor (DEMO).', autor: CONS, interno: true, fechaMs: ahora - 2900000 };

/* Cambios */
const H = new Date(ahora + 3 * D); H.setHours(21, 0, 0, 0);
const chg = (n, extra) => { const id = 'CHG-' + ('0000' + n).slice(-4); S['ti_cambios/' + id] = Object.assign({ codigo: id, titulo: 'Cambio de ejemplo (DEMO)', tipo: 'normal', descripcion: 'Descripción (DEMO).', justificacion: 'Justificación (DEMO).', sistema: 'Red', activoIds: 'SW-01', impacto: 'medio', probabilidad: 'baja', riesgo: 'bajo', planImplementacion: '1. Respaldar 2. Aplicar', planPruebas: 'Ping y consola', planReversa: 'Restaurar configuración', inicioMs: H.getTime(), finMs: H.getTime() + 2 * 3600000, estado: 'pendiente_aprobacion', solicitanteEmail: CONS, responsableImpl: CONS, evidencias: [], aprobacion: null, creadoMs: ahora - D }, extra || {}); };
chg(1, { titulo: 'Actualizar firmware de switches (DEMO)', impacto: 'alto', probabilidad: 'media', riesgo: 'alto' });
chg(2, { titulo: 'Migrar servidor de archivos (DEMO)', estado: 'aprobado', sistema: 'Red', aprobacion: { por: GER, fecha: ahora - D / 2, excepcion: false }, riesgo: 'medio', impacto: 'medio', probabilidad: 'media' });
chg(3, { titulo: 'Parche urgente del ERP (DEMO)', tipo: 'emergencia', sistema: 'ERP', activoIds: '', estado: 'borrador', solicitanteEmail: CONS2, responsableImpl: CONS2, inicioMs: ahora + 3600000, finMs: ahora + 7200000 });

/* Proveedores y contratos */
S['ti_proveedores/PRV-001'] = { codigo: 'PRV-001', nombre: 'Proveedor de Soporte (DEMO)', categoria: 'servicios', estado: 'activo', contactos: [{ nombre: 'Contacto Demo', rol: 'Ventas', correo: 'contacto@ejemplo.com', telefono: '55 0000 0000' }], responsable: CONS, creadoPor: CONS, sitioWeb: 'https://ejemplo.com' };
S['ti_proveedores/PRV-002'] = { codigo: 'PRV-002', nombre: 'Proveedor de Nube (DEMO)', categoria: 'nube', estado: 'activo', contactos: [], responsable: CONS2, creadoPor: CONS2 };
const ctr = (n, extra) => { const id = 'CTR-' + ('0000' + n).slice(-4); S['ti_contratos/' + id] = Object.assign({ codigo: id, titulo: 'Contrato de ejemplo (DEMO)', tipo: 'soporte', proveedorId: 'PRV-001', objeto: 'Objeto de ejemplo (DEMO).', inicio: iso(-300), fin: iso(400), renovacion: 'manual', monto: 12000, moneda: 'MXN', periodicidad: 'mensual', responsable: CONS, creadoPor: CONS, estado: 'vigente', documentos: [{ titulo: 'Contrato PDF', url: 'https://ejemplo.com/c.pdf' }], aprobacion: { por: GER, fecha: ahora - 300 * D } }, extra || {}); };
ctr(1, { titulo: 'Soporte técnico anual (DEMO)', fin: iso(40) });
ctr(2, { titulo: 'Licencias de oficina (DEMO)', tipo: 'licencia', proveedorId: 'PRV-002', monto: 3000, periodicidad: 'anual', moneda: 'USD', fin: iso(-5), documentos: [] });
ctr(3, { titulo: 'Internet dedicado (DEMO)', tipo: 'servicio', monto: 8500, fin: iso(500) });
ctr(4, { titulo: 'Arrendamiento de impresoras (DEMO)', tipo: 'arrendamiento', estado: 'pendiente_aprobacion', aprobacion: null, creadoPor: CONS2, responsable: CONS2, inicio: iso(10), fin: iso(375) });

/* Respaldos */
const rs = (n, extra) => { const id = 'RSP-' + ('000' + n).slice(-3); S['ti_respaldos/' + id] = Object.assign({ codigo: id, nombre: 'Respaldo de ejemplo (DEMO)', que: 'Datos (DEMO)', categoria: 'servidor', frecuencia: 'diario', ubicacion: 'NAS de oficina (DEMO)', metodo: 'Herramienta (DEMO)', cifrado: 'si', responsable: CONS, creadoPor: CONS, estado: 'activo', ultimaEjecucionMs: ahora - 3600000, ultimaEjecucionResultado: 'exitoso', ultimaPruebaMs: ahora - 20 * D, ultimaPruebaResultado: 'exitosa', creadoMs: ahora }, extra || {}); };
rs(1, { nombre: 'Servidor de archivos (DEMO)' });
rs(2, { nombre: 'Base de datos del ERP (DEMO)', categoria: 'base_datos', frecuencia: 'semanal', ultimaEjecucionMs: ahora - 10 * D });
rs(3, { nombre: 'Correo en la nube (DEMO)', categoria: 'correo_nube', ultimaEjecucionResultado: 'fallido', ultimaPruebaMs: ahora - 300 * D });
rs(4, { nombre: 'Laptops directivos (DEMO)', categoria: 'equipos', ultimaEjecucionMs: null, ultimaEjecucionResultado: null, ultimaPruebaMs: null, ultimaPruebaResultado: null, responsable: CONS2, creadoPor: CONS2 });
S['ti_respaldos/RSP-001/ejecuciones/e1'] = { fechaMs: ahora - 3600000, resultado: 'exitoso', valor: 42.5, observaciones: '', evidencia: '', registradoPor: CONS };
S['ti_respaldos/RSP-001/pruebas/p1'] = { fechaMs: ahora - 20 * D, resultado: 'exitosa', valor: 35, observaciones: 'Restauración completa (DEMO).', evidencia: '', registradoPor: CONS };

/* Inventario (solo el resumen guardado; los equipos reales no se tocan) */
const equipos = []; for (let i = 0; i < 14; i++) equipos.push({ estado: i < 10 ? (i % 5 === 0 ? 'Regular' : 'Bueno') : i < 12 ? 'Malo' : 'Baja', responsable: i % 4 === 3 ? '' : 'Persona ' + i, fecha: iso(-(200 + i * 150)) });
S['ti_resumenes/inventario'] = { calculadoMs: ahora - 2 * D, calculadoPor: GER, equiposLeidos: equipos.length, datos: L.indicadoresInventario(equipos, L.hoyISO()) };

/* Auditoría */
['crear_proceso', 'aprobar', 'crear_ticket', 'ticket_asignar', 'crear_cambio', 'cambio_aprobar', 'crear_contrato', 'contrato_aprobar', 'crear_respaldo', 'registrar_ejecucion_respaldo'].forEach((a, i) => { S['ti_auditoria/a' + i] = { fecha: ahora - (i + 1) * 5400000, usuario: i % 2 ? GER : CONS, accion: a, tipoRegistro: a.split('_').pop(), registroId: 'DEMO-' + (i + 1), resultado: 'ok', detalle: 'Evento de ejemplo (DEMO)', motivo: '' }; });

const PASOS = [];
function paso(archivo, rol, modulo, titulo, texto, ruta) { PASOS.push({ archivo, rol, modulo, titulo, texto, ruta }); }

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  async function sesion(email, rol) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    await page.addInitScript((a) => { window.__SEED_USERS = a.u; window.__SEED_STORE = a.s; }, { u: USERS, s: S });
    await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith('file:')) return route.continue(); if (u.includes('firebase-app-compat.js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK }); if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'application/javascript', body: '' }); return route.abort(); });
    await page.goto(URL_APP); await page.fill('#login-email', email); await page.fill('#login-pass', 'pw'); await page.click('#login-btn');
    await page.waitForSelector('#app:not(.hidden)'); await page.waitForFunction(() => window.TI && window.TI.ready); await page.waitForTimeout(500);
    const ir = async (v, p) => { await page.evaluate(([x, y]) => TI.ir(x, y), [v, p]); await page.waitForTimeout(450); };
    const foto = async (n, completa) => { await page.screenshot({ path: path.join(IMG, n + '.png'), fullPage: !!completa }); };
    const modal = async (sel, n) => { await page.click(sel); await page.waitForSelector('.ti-ov .modal-footer', { timeout: 4000 }); await page.waitForTimeout(350); await foto(n); await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
    return { page, ir, foto, modal };
  }

  /* ----- Gerente ----- */
  const G = await sesion(GER, 'Gerente');
  await G.ir('ti-inicio'); await G.page.waitForTimeout(500); await G.foto('g01-inicio', true);
  paso('g01-inicio', 'Gerente', 'Inicio', 'Tu resumen de todo', 'Atención pendiente, y una sección por módulo con cifras reales. Cada tarjeta es clicable y abre el módulo ya filtrado. Lo que no se puede calcular dice "No disponible".', 'Menú › Inicio');
  await G.ir('ti-procesos'); await G.foto('g02-procesos');
  paso('g02-procesos', 'Gerente', 'Procesos y procedimientos', 'Lista con indicadores', 'Procesos con estado, versión y próxima revisión. Las tarjetas filtran la tabla. Solo tú aprobás y publicás.', 'Menú › Procesos y procedimientos');
  await G.modal('.ti-row:has-text("PRO-002")', 'g03-proceso-detalle');
  paso('g03-proceso-detalle', 'Gerente', 'Procesos y procedimientos', 'Detalle y aprobación', 'Ficha, actividades, versiones e historial. Los botones de abajo son las acciones permitidas para tu rol en ese estado.', 'Procesos › clic en un proceso');
  await G.ir('ti-tickets'); await G.foto('g04-tickets');
  paso('g04-tickets', 'Gerente', 'Mesa de ayuda', 'Todos los tickets', 'Prioridad, estado, responsable y semáforo de SLA con texto. Tarjetas de gestión y exportar CSV.', 'Menú › Mesa de ayuda');
  await G.modal('.ti-row:has-text("TCK-0001")', 'g05-ticket-detalle');
  paso('g05-ticket-detalle', 'Gerente', 'Mesa de ayuda', 'Detalle con SLA vencido', 'Resumen, conversación (con notas internas) e historial. Asignar, cambiar prioridad o cancelar.', 'Mesa de ayuda › clic en un ticket');
  await G.ir('ti-cambios'); await G.foto('g06-cambios');
  paso('g06-cambios', 'Gerente', 'Gestión de cambios', 'Cambios y riesgo', 'Cambios con riesgo, tipo, estado y ventana. Aprobar es solo tuyo (y del Director).', 'Menú › Gestión de cambios');
  await G.modal('.ti-row:has-text("CHG-0001")', 'g07-cambio-detalle');
  paso('g07-cambio-detalle', 'Gerente', 'Gestión de cambios', 'Detalle y choque de ventanas', 'Avisa si la ventana se traslapa con otro cambio sobre el mismo sistema o equipo.', 'Gestión de cambios › clic en un cambio');
  await G.ir('ti-proveedores'); await G.foto('g08-contratos');
  paso('g08-contratos', 'Gerente', 'Proveedores y contratos', 'Contratos y vigencia', 'Por vencer y vencidos se calculan con la fecha de hoy. El monto anual se suma por moneda, sin convertir.', 'Menú › Proveedores y contratos');
  await G.page.click('[data-tab=proveedores]'); await G.page.waitForTimeout(300); await G.foto('g09-proveedores');
  paso('g09-proveedores', 'Gerente', 'Proveedores y contratos', 'Proveedores', 'Contactos, categoría, responsable y sus contratos.', 'Proveedores y contratos › pestaña Proveedores');
  await G.ir('ti-respaldos'); await G.foto('g10-respaldos');
  paso('g10-respaldos', 'Gerente', 'Respaldos', 'Control de respaldos', 'Un trabajo sin registros aparece "Sin registros", nunca "Al día". La plataforma no hace respaldos: registra los que hacen tus consultores.', 'Menú › Respaldos');
  await G.modal('.ti-row:has-text("RSP-001")', 'g11-respaldo-detalle');
  paso('g11-respaldo-detalle', 'Gerente', 'Respaldos', 'Detalle y registro', 'Última ejecución, última prueba de restauración y botones para registrar nuevas.', 'Respaldos › clic en un trabajo');
  await G.ir('ti-admin'); await G.foto('g12-usuarios');
  paso('g12-usuarios', 'Gerente', 'Administración', 'Usuarios y roles', 'Asigna Gerente, Consultor u otros roles. Siempre debe quedar al menos un Gerente o Administrador.', 'Menú › Administración › Usuarios y roles');
  await G.page.click('[data-t=tickets]'); await G.page.waitForTimeout(400); await G.foto('g13-config-tickets', true);
  paso('g13-config-tickets', 'Gerente', 'Administración', 'Configuración de la mesa de ayuda', 'Categorías, SLA por categoría y prioridad, horario de servicio. Nada viene predefinido: lo defines tú.', 'Administración › Mesa de ayuda');
  await G.page.click('[data-t=auditoria]'); await G.page.waitForTimeout(500); await G.foto('g14-auditoria');
  paso('g14-auditoria', 'Gerente', 'Administración', 'Auditoría', 'Quién hizo qué y cuándo. Solo lectura: nadie puede editarla ni borrarla.', 'Administración › Auditoría');
  await G.page.close();

  /* ----- Consultor ----- */
  const C = await sesion(CONS, 'Consultor');
  await C.ir('ti-inicio'); await C.page.waitForTimeout(400); await C.foto('c01-inicio', true);
  paso('c01-inicio', 'Consultor', 'Inicio', 'El resumen del consultor', 'Solo lo suyo: su atención de procesos y accesos. Sin inventario, auditoría ni indicadores globales.', 'Menú › Inicio');
  await C.ir('ti-tickets'); await C.foto('c02-tickets');
  paso('c02-tickets', 'Consultor', 'Mesa de ayuda', 'Tus tickets', 'Los que tiene asignados, los que creó y los nuevos sin responsable, que puede tomar.', 'Menú › Mesa de ayuda');
  await C.ir('ti-cambios'); await C.foto('c03-cambios');
  paso('c03-cambios', 'Consultor', 'Gestión de cambios', 'Tus cambios', 'Los que solicitó o debe implementar. No puede aprobar.', 'Menú › Gestión de cambios');
  await C.ir('ti-respaldos'); await C.foto('c04-respaldos');
  paso('c04-respaldos', 'Consultor', 'Respaldos', 'Tus trabajos de respaldo', 'Registra ejecuciones y pruebas de restauración de los trabajos que tiene asignados.', 'Menú › Respaldos');
  const menu = await C.page.evaluate(() => [...document.querySelectorAll('#side nav > *')].filter((e) => !e.classList.contains('hidden')).map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  await C.page.close(); await browser.close();

  /* ----- Página del recorrido ----- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const grupos = ['Gerente', 'Consultor'].map((rol) => '<section><h2>' + (rol === 'Gerente' ? 'Como Gerente de TI (ves todo)' : 'Como Consultor de TI (ves lo tuyo)') + '</h2>' + PASOS.filter((p) => p.rol === rol).map((p) => '<figure><figcaption><span class="mod">' + esc(p.modulo) + '</span><h3>' + esc(p.titulo) + '</h3><p>' + esc(p.texto) + '</p><p class="ruta">Cómo llegar: <b>' + esc(p.ruta) + '</b></p></figcaption><a href="img/' + p.archivo + '.png"><img src="img/' + p.archivo + '.png" alt="' + esc(p.titulo) + '" loading="lazy"></a></figure>').join('') + '</section>').join('');
  fs.writeFileSync(path.join(RAIZ, 'demo', 'recorrido', 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recorrido CAFIVER TI</title><style>' +
    ':root{--bg:#f6f7f9;--ink:#111827;--mut:#4b5563;--azul:#1a73e8;--bor:#e5e7eb}@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--ink:#f3f4f6;--mut:#aab2bf;--azul:#7db3ff;--bor:#2a2f3a}}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,Segoe UI,sans-serif}header,main{max-width:1180px;margin:0 auto;padding:20px 24px}h1{margin:0 0 6px;font-size:26px}h2{margin:36px 0 14px;font-size:20px;border-bottom:1px solid var(--bor);padding-bottom:8px}h3{margin:4px 0 6px;font-size:17px}p{margin:0 0 8px}.mut,.ruta{color:var(--mut)}.aviso{background:#fff7e0;color:#5c4400;border:1px solid #f0d98a;border-radius:10px;padding:12px 14px;margin-top:14px}figure{margin:0 0 28px;display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start;background:color-mix(in srgb,var(--bg) 70%,#fff);border:1px solid var(--bor);border-radius:14px;padding:16px}figure img{width:100%;border:1px solid var(--bor);border-radius:8px;display:block}.mod{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--azul)}a{color:var(--azul)}@media(max-width:800px){figure{grid-template-columns:1fr}}</style></head><body><header><h1>Recorrido de CAFIVER TI</h1><p class="mut">Capturas de cada módulo, como las vería cada rol.</p><div class="aviso"><b>Datos de ejemplo.</b> Todo lo que aparece está marcado DEMO y viene de un Firebase simulado en memoria; no se tocó tu Firebase real. Haz clic en una imagen para verla completa. Menú del Consultor: ' + esc(menu.join(' · ')) + '.</div></header><main>' + grupos + '<p class="mut">Generado con <code>node tests/recorrido.js</code>.</p></main></body></html>');
  console.log('Listo: ' + PASOS.length + ' capturas en demo/recorrido/img/ y demo/recorrido/index.html');
})().catch((e) => { console.error(e); process.exit(1); });
