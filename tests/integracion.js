/* Pruebas de integración en navegador (Chromium + Playwright) con Firebase simulado en memoria (tests/mock-firebase.js).
   Verifican interfaz, flujos y compatibilidad con el inventario. NO prueban las reglas de seguridad (ver reglas.test.js).
   Uso: node tests/integracion.js   (requiere playwright; variable PLAYWRIGHT_MODULE para indicar su ruta) */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const RAIZ = path.resolve(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');
const USERS = { 'ramaya@cafiver.com.mx': 'pw', 'aosorio@cafiver.com.mx': 'pw', 'vlopez@cafiver.com.mx': 'pw', 'soportetec@cafiver.com.mx': 'pw', 'soportetecnico@cafiver.com.mx': 'pw', 'dgomez@cafiver.com.mx': 'pw' };
const ADMIN = 'ramaya@cafiver.com.mx', DIR = 'aosorio@cafiver.com.mx', RESP = 'vlopez@cafiver.com.mx', TEC = 'soportetec@cafiver.com.mx', SOL = 'soportetecnico@cafiver.com.mx';

const resultados = [];
const SHOTS = process.env.SHOTS;
function ok(nombre, cond, extra) { resultados.push({ nombre, ok: !!cond, extra }); console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre + (cond ? '' : '  → ' + JSON.stringify(extra))); }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript((u) => { window.__SEED_USERS = u; window.__SEED_STORE = {}; window.__xss = undefined; }, USERS);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:')) return route.continue();
    if (u.includes('firebase-app-compat.js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK });
    if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'application/javascript', body: '' });
    return route.abort();
  });
  await page.goto('file://' + path.join(RAIZ, 'index.html'));

  const login = async (email) => { await page.fill('#login-email', email); await page.fill('#login-pass', 'pw'); await page.click('#login-btn'); await page.waitForSelector('#app:not(.hidden)'); await page.waitForFunction(() => window.TI && window.TI.ready, null, { timeout: 5000 }); };
  const logout = async () => { await page.evaluate(() => doLogout()); await page.waitForSelector('#login-screen:not(.hidden)'); };
  const visible = (sel) => page.locator(sel).isVisible().catch(() => false);
  const ir = async (v) => { await page.evaluate((x) => switchView(x), v); await page.waitForTimeout(120); };
  const filas = () => page.locator('.ti-row').count();
  const espera = (ms) => page.waitForTimeout(ms || 150);
  const toast = async () => (await page.locator('#toast').textContent()) || '';
  const abrirFila = async (cod) => { await page.click('.ti-row:has-text("' + cod + '")'); await page.waitForSelector('.ti-ov .modal-footer'); await espera(120); };
  const cerrarModal = async () => { await page.keyboard.press('Escape'); await espera(100); };
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const accion = (id) => page.locator('.ti-ov [data-a=' + id + ']');

  /* ---------- T1: arranque (bootstrap) ---------- */
  await login(ADMIN);
  ok('T1 arranque: sin registro, solo aparece Administración', (await visible('#tnav-ti-admin')) && !(await visible('#tnav-ti-procesos')));
  await ir('ti-admin');
  ok('T1 panel de configuración inicial visible', await visible('#ad-boot'));
  await page.click('#ad-boot'); await page.waitForSelector('#tnav-ti-procesos:not(.hidden)', { timeout: 4000 }).catch(() => {});
  ok('T1 tras crear su registro aparece Procesos', await visible('#tnav-ti-procesos'));
  ok('T1 etiqueta "Inicio" en lugar de "Dashboard"', (await page.locator('#tnav-dashboard').textContent()).includes('Inicio'));

  /* ---------- T1b: asignar roles desde la interfaz ---------- */
  await ir('ti-admin'); await espera(200);
  const asignar = async (email, rol) => { await page.click('[data-ed="' + email + '"]'); await page.check('.ti-ov .u-rol[value=' + rol + ']'); await page.click('#u-ok'); await espera(250); };
  await shot('0-admin-usuarios');
  await asignar(DIR, 'director'); await asignar(RESP, 'resp_proceso'); await asignar(TEC, 'tecnico'); await asignar(SOL, 'solicitante');
  const usuarios = await page.evaluate(() => Object.keys(window.__MOCK.store).filter((k) => k.startsWith('usuarios_ti/')).length);
  ok('T1b se registraron 5 usuarios con rol', usuarios === 5, usuarios);
  await page.click('[data-ed="' + ADMIN + '"]'); await page.uncheck('.ti-ov .u-rol[value=administrador]'); await page.check('.ti-ov .u-rol[value=tecnico]'); await page.click('#u-ok'); await espera(150);
  ok('T1b no se puede dejar sin Administrador', (await page.locator('#u-e2').textContent()).includes('al menos un Administrador'));
  await cerrarModal();

  /* ---------- T2: catálogo inicial ---------- */
  await ir('ti-procesos');
  ok('T2 lista vacía con mensaje comprensible', (await page.locator('.ti-empty').first().textContent()).includes('Aún no hay procesos'));
  await page.click('#ti-cat'); await page.click('#ti-conf-ok'); await page.waitForFunction(() => document.querySelectorAll('.ti-row').length >= 21, null, { timeout: 5000 }).catch(() => {});
  ok('T2 catálogo: 21 procesos', (await filas()) === 21, await filas());
  const cat = await page.evaluate(() => { const p = Object.keys(window.__MOCK.store).filter((k) => /^ti_procesos\/PRO-\d+$/.test(k)).map((k) => window.__MOCK.store[k]); return { n: p.length, borradores: p.filter((x) => x.estado === 'borrador').length, sinResp: p.filter((x) => x.responsable === '').length, plantillas: p.filter((x) => x.esPlantilla).length, contador: window.__MOCK.store['ti_config/contadores'].procesos, pasos: Object.keys(window.__MOCK.store).filter((k) => /versiones\/1$/.test(k)).reduce((a, k) => a + window.__MOCK.store[k].contenido.pasos.length, 0) }; });
  ok('T2 todos borrador, sin responsable, marcados plantilla, sin pasos inventados', cat.borradores === 21 && cat.sinResp === 21 && cat.plantillas === 21 && cat.pasos === 0 && cat.contador === 21, cat);
  await page.click('#ti-cat'); await page.click('#ti-conf-ok').catch(() => {}); await espera(200);
  ok('T2 cargar de nuevo no duplica', (await filas()) === 21 && (await toast()).includes('ya está cargado'), await toast());
  await shot('1-lista-catalogo');
  ok('T2 KPI: 21 registrados y % oculto no aplica (0 documentados)', (await page.locator('[data-kpi=registrados] .ti-kv').textContent()) === '21');

  /* ---------- T3: crear proceso, validar y enviar a revisión ---------- */
  await page.click('#ti-nuevo'); await page.fill('#e-nombre', '<img src=x onerror="window.__xss=1"> Proceso de prueba');
  await page.selectOption('#e-cat', 'Seguridad'); await page.check('.ti-ov .ti-part[value="' + RESP + '"]');
  await page.click('#e-addpaso'); await page.click('#e-save'); await espera(150);
  ok('T3 validación: paso sin descripción ni responsable', (await page.locator('.ti-ov .ti-err:not(:empty)').count()) >= 2);
  await page.fill('#ps0descripcion', 'Registrar el hallazgo'); await page.fill('#ps0responsable', 'Responsable del proceso'); await page.click('#e-save');
  await page.waitForSelector('.ti-ov .modal-footer', { timeout: 3000 }).catch(() => {}); await espera(200);
  const nombreRender = await page.locator('.ti-ov .modal-hd h3').textContent();
  ok('T3 el proceso nuevo se creó como PRO-022 en borrador', nombreRender.includes('PRO-022'), nombreRender);
  ok('T3 seguridad XSS: el nombre se muestra como texto y no ejecuta código', (await page.evaluate(() => window.__xss)) === undefined && nombreRender.includes('<img'), nombreRender);
  await shot('2-detalle-borrador');
  ok('T3 aparece "Enviar a revisión" para el editor', await accion('enviar_revision').count() === 1);
  await accion('enviar_revision').click(); await espera(250);
  await shot('3-editor-errores');
  ok('T3 borrador incompleto: no se envía y se abre el editor con errores', (await visible('#e-obj')) && (await page.locator('.ti-ov [data-e=objetivo]').textContent()).length > 0);
  await page.fill('#e-obj', 'Gestionar la seguridad de los activos.'); await page.fill('#e-alc', 'Activos de TI.'); await page.click('#e-save'); await espera(250);
  await cerrarModal(); await abrirFila('PRO-022');
  await accion('enviar_revision').click(); await espera(250);
  ok('T3 enviado a revisión', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('En revisión'));
  await accion('solicitar_aprobacion').click(); await espera(250);
  ok('T3 pendiente de aprobación', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Pendiente'));
  const apr = accion('aprobar');
  ok('T3 quien arrancó la plataforma (Admin + Director) NO aprueba lo que él mismo editó', (await apr.getAttribute('aria-disabled')) === 'true');
  await apr.click({ force: true }); ok('T3 explica el motivo (separación de funciones)', (await page.locator('#ti-st').textContent()).includes('Segregación'));
  await cerrarModal();

  /* T4 (administrador sin rol de Director no aprueba) está cubierto en tests/logica.test.js. */

  /* ---------- T5: el Director aprueba y publica ---------- */
  await logout(); await login(DIR);
  ok('T5 director ve Procesos y Administración (auditoría)', (await visible('#tnav-ti-procesos')) && (await visible('#tnav-ti-admin')));
  await ir('ti-procesos'); await abrirFila('PRO-022');
  await accion('aprobar').click(); await espera(300);
  ok('T5 aprobado', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Aprobado'));
  await accion('publicar').click(); await espera(300);
  ok('T5 publicado', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Publicado'));
  const pub = await page.evaluate(() => ({ p: window.__MOCK.store['ti_procesos/PRO-022'], v: window.__MOCK.store['ti_procesos/PRO-022/versiones/1'] }));
  ok('T5 se registró la aprobación, la vigencia, la próxima revisión y el indicador "documentado"', pub.v.aprobacion && pub.v.aprobacion.por === DIR && pub.p.versionPublicada === 1 && /^\d{4}-\d{2}-\d{2}$/.test(pub.p.proximaRevision) && pub.p.documentado === true, pub);
  await shot('4-detalle-publicado');
  await page.click('.ti-ov .ti-tabs [data-t=historial]'); await espera(250);
  await shot('5-historial');
  ok('T5 historial con eventos de quién hizo cada acción', (await page.locator('.ti-ov .ti-tl > div').count()) >= 4);
  await cerrarModal();
  ok('T5 KPI publicados = 1 y documentados = 5% (1 de 22; hay ≥5 procesos, por eso sí hay porcentaje)', (await page.locator('[data-kpi=publicados] .ti-kv').textContent()) === '1' && (await page.locator('[data-kpi=documentados] .ti-kv').textContent()) === '5%', await page.locator('[data-kpi=documentados] .ti-kv').textContent());
  await page.click('[data-kpi=publicados]'); ok('T5 clic en tarjeta filtra los registros que la componen', (await filas()) === 1);
  await page.click('#ti-lim');

  /* ---------- T6: versionado ---------- */
  await logout(); await login(ADMIN);
  await ir('ti-procesos'); await abrirFila('PRO-022');
  await accion('nueva_version').click(); await espera(300);
  const vv = await page.evaluate(() => ({ v1: window.__MOCK.store['ti_procesos/PRO-022/versiones/1'], v2: window.__MOCK.store['ti_procesos/PRO-022/versiones/2'], p: window.__MOCK.store['ti_procesos/PRO-022'] }));
  ok('T6 la v1 publicada se conserva intacta', vv.v1.estado === 'publicado' && vv.p.versionPublicada === 1);
  ok('T6 se creó v2 en borrador copiando el contenido', vv.v2 && vv.v2.estado === 'borrador' && vv.v2.contenido.objetivo === vv.v1.contenido.objetivo && vv.p.versionTrabajo === 2 && vv.p.estado === 'borrador');
  await page.click('.ti-ov .ti-tabs [data-t=versiones]'); await espera(100);
  ok('T6 pestaña de versiones lista v1 y v2', (await page.locator('.ti-ov .ti-table tbody tr').count()) === 2);
  await cerrarModal();
  ok('T6 la lista muestra "v2 (vigente v1)"', (await page.locator('.ti-row:has-text("PRO-022")').textContent()).includes('vigente v1'));

  /* ---------- T7: técnico ---------- */
  await logout(); await login(TEC);
  await ir('ti-procesos');
  ok('T7 técnico: ve solo procedimientos publicados', (await filas()) === 1 && (await page.locator('.ti-row').textContent()).includes('PRO-022'));
  ok('T7 técnico: sin indicadores ni botón "Nuevo proceso" ni catálogo', !(await visible('.ti-kpis')) && !(await visible('#ti-nuevo')) && !(await visible('#ti-cat')));
  ok('T7 técnico: Administración oculta', !(await visible('#tnav-ti-admin')));
  await abrirFila('PRO-022');
  ok('T7 técnico: ve la versión publicada, sin pestaña de historial y sin acciones', (await page.locator('.ti-ov .modal-hd .ti-e').first().textContent()).includes('Publicado') && (await page.locator('.ti-ov [data-t=historial]').count()) === 0 && (await page.locator('.ti-ov [data-a]').count()) === 0);
  await cerrarModal();

  /* ---------- T8: solicitante ---------- */
  await logout(); await login(SOL);
  ok('T8 solicitante: no ve módulos nuevos', !(await visible('#tnav-ti-procesos')) && !(await visible('#tnav-ti-admin')));
  await ir('ti-procesos');
  ok('T8 solicitante: acceso directo bloqueado y vuelve al inicio', (await toast()).includes('No tienes permiso') && (await visible('#view-dashboard')));

  /* ---------- T9: el inventario sigue funcionando ---------- */
  const vistas = ['inventario', 'qr', 'reparaciones', 'celulares', 'licencias', 'personal', 'obsoletos', 'etiquetas', 'simulador'];
  const falloVistas = [];
  for (const v of vistas) { await ir(v); const vis = await visible('#view-' + v); if (!vis) falloVistas.push(v); }
  ok('T9 las 9 vistas del inventario se abren', !falloVistas.length, falloVistas);
  await ir('dashboard'); ok('T9 Inicio (dashboard original) se abre', await visible('#view-dashboard'));
  await logout(); await login(DIR); await ir('ti-procesos'); await ir('inventario');
  ok('T9 alternar entre módulos nuevos e inventario oculta correctamente cada vista', (await visible('#view-inventario')) && !(await visible('#view-ti-procesos')));
  await ir('ti-admin'); ok('T9 y de vuelta a administración', (await visible('#view-ti-admin')) && !(await visible('#view-inventario')));

  /* ---------- T10: auditoría ---------- */
  await page.click('[data-t=auditoria]'); await espera(300);
  await shot('6-auditoria');
  const aud = await page.evaluate(() => { const a = Object.keys(window.__MOCK.store).filter((k) => k.startsWith('ti_auditoria/')).map((k) => window.__MOCK.store[k]); return { n: a.length, acciones: [...new Set(a.map((x) => x.accion))], sinSecretos: a.every((x) => !/pass|token|secret|clave/i.test(JSON.stringify(x))), conUsuario: a.every((x) => x.usuario && x.fecha) }; });
  ok('T10 auditoría registra arranque, roles, catálogo, creación, edición, aprobación y publicación', ['arranque_plataforma', 'cambio_roles', 'cargar_catalogo', 'crear_proceso', 'editar_procedimiento', 'aprobar', 'publicar', 'nueva_version'].every((x) => aud.acciones.includes(x)), aud.acciones);
  ok('T10 cada evento tiene usuario y fecha, y no contiene secretos', aud.conUsuario && aud.sinSecretos);
  ok('T10 la tabla de auditoría muestra eventos', (await page.locator('.ti-table tbody tr').count()) >= 10);

  /* ---------- T11: limpieza al cerrar sesión ---------- */
  await logout();
  ok('T11 al cerrar sesión se oculta el menú nuevo y se cierran ventanas', (await page.locator('.ti-nav:not(.hidden)').count()) === 0 && (await page.locator('.ti-ov').count()) === 0);


  /* ---------- T12: arranque con el equipo inicial (Director + Administrador y 4 Responsables de proceso) ---------- */
  const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p2.on('pageerror', (e) => errores.push(e.message)); p2.on('dialog', (d) => d.dismiss());
  await p2.addInitScript((u) => { window.__SEED_USERS = u; window.__SEED_STORE = {}; }, USERS);
  await p2.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith('file:')) return route.continue(); if (u.includes('firebase-app-compat.js')) return route.fulfill({ contentType: 'application/javascript', body: MOCK }); if (u.includes('gstatic.com/firebasejs')) return route.fulfill({ contentType: 'application/javascript', body: '' }); return route.abort(); });
  await p2.goto('file://' + path.join(RAIZ, 'index.html'));
  const login2 = async (email) => { await p2.fill('#login-email', email); await p2.fill('#login-pass', 'pw'); await p2.click('#login-btn'); await p2.waitForSelector('#app:not(.hidden)'); await p2.waitForFunction(() => window.TI && window.TI.ready, null, { timeout: 5000 }); };
  const logout2 = async () => { await p2.evaluate(() => doLogout()); await p2.waitForSelector('#login-screen:not(.hidden)'); };
  await login2(ADMIN); await p2.evaluate(() => switchView('ti-admin')); await p2.click('#ad-boot'); await p2.waitForTimeout(400);
  await p2.evaluate(() => switchView('ti-admin')); await p2.waitForTimeout(300);
  const ur = () => p2.evaluate(() => { const o = {}; Object.keys(window.__MOCK.store).filter((k) => k.startsWith('usuarios_ti/')).forEach((k) => { o[k.slice(12)] = window.__MOCK.store[k].roles.join('+'); }); return o; });
  const r0 = await ur();
  ok('T12 el arranque crea a ramaya como Administrador y Director', r0[ADMIN] === 'administrador+director', r0);
  ok('T12 aparece el botón del equipo inicial con 4 pendientes', (await p2.locator('#ad-equipo').textContent()).includes('(4)'));
  await p2.click('#ad-equipo'); await p2.click('#ti-conf-ok'); await p2.waitForTimeout(500);
  const r1 = await ur();
  ok('T12 se crean los 4 registros como Responsable de proceso', ['vlopez', 'aosorio', 'soportetecnico', 'dgomez'].every((n) => r1[n + '@cafiver.com.mx'] === 'resp_proceso') && Object.keys(r1).length === 5, r1);
  ok('T12 el botón desaparece cuando ya no hay pendientes', (await p2.locator('#ad-equipo').count()) === 0);
  ok('T12 soportetec@ (Daniela) no recibe rol: es otra persona', !('soportetec@cafiver.com.mx' in r1));
  await logout2(); await login2('dgomez@cafiver.com.mx');
  ok('T12 dgomez (Responsable) ve Procesos y no Administración', (await p2.locator('#tnav-ti-procesos').isVisible()) && !(await p2.locator('#tnav-ti-admin').isVisible()));
  await p2.evaluate(() => switchView('ti-procesos')); await p2.waitForTimeout(200);
  ok('T12 dgomez puede crear procesos pero no cargar el catálogo', (await p2.locator('#ti-nuevo').isVisible()) && (await p2.locator('#ti-cat').count()) === 0);
  await logout2(); await login2('soportetec@cafiver.com.mx');
  ok('T12 una cuenta sin registro no ve los módulos nuevos pero conserva el inventario', !(await p2.locator('#tnav-ti-procesos').isVisible()) && (await p2.locator('#tnav-inventario').isVisible()));
  await logout2();

  ok('Sin errores de JavaScript en toda la sesión', errores.length === 0, errores.slice(0, 5));
  await browser.close();
  const fallas = resultados.filter((r) => !r.ok);
  console.log('\nResumen: ' + (resultados.length - fallas.length) + '/' + resultados.length + ' pruebas correctas');
  process.exit(fallas.length ? 1 : 0);
})().catch((e) => { console.error('Error en las pruebas:', e); process.exit(2); });
