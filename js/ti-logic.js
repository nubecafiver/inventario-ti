/* CAFIVER TI — Lógica pura de procesos y procedimientos.
   Sin Firebase ni DOM: se usa en el navegador (window.TI_LOGIC) y en las pruebas de Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TI_LOGIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===== Roles y permisos ===== */
  var ROLES = {
    director:      'Director de TI',
    administrador: 'Administrador de la plataforma',
    resp_proceso:  'Responsable de proceso',
    tecnico:       'Técnico de TI',
    solicitante:   'Solicitante'
  };
  var PERMISOS_POR_ROL = {
    director:      ['procesos.ver', 'procesos.aprobar', 'procesos.publicar', 'auditoria.ver'],
    administrador: ['procesos.ver', 'procesos.crear', 'procesos.editar_todos', 'procesos.publicar', 'procesos.catalogo', 'usuarios.admin', 'auditoria.ver'],
    resp_proceso:  ['procesos.ver', 'procesos.crear', 'procesos.editar_propios'],
    tecnico:       ['procesos.ver_publicados'],
    solicitante:   []
  };
  function permisos(roles) {
    var set = {};
    (roles || []).forEach(function (r) { (PERMISOS_POR_ROL[r] || []).forEach(function (p) { set[p] = true; }); });
    return set;
  }
  function tiene(user, permiso) { return !!(user && permisos(user.roles)[permiso]); }

  /* ===== Estados ===== */
  var ESTADOS = ['borrador', 'en_revision', 'pendiente_aprobacion', 'aprobado', 'publicado', 'en_revision_periodica', 'obsoleto'];
  var ESTADO_LABEL = {
    borrador: 'Borrador', en_revision: 'En revisión', pendiente_aprobacion: 'Pendiente de aprobación',
    aprobado: 'Aprobado', publicado: 'Publicado', en_revision_periodica: 'En revisión periódica',
    obsoleto: 'Obsoleto', reemplazada: 'Reemplazada'
  };
  function vigente(estado) { return estado === 'publicado' || estado === 'en_revision_periodica'; }

  /* ===== Visibilidad y edición ===== */
  function esPropietario(user, proceso) {
    if (!user || !proceso) return false;
    var e = user.email;
    return proceso.responsable === e || proceso.creadoPor === e || (proceso.participantes || []).indexOf(e) >= 0;
  }
  function puedeVer(user, proceso) {
    if (tiene(user, 'procesos.ver')) return true;
    if (tiene(user, 'procesos.ver_publicados')) return typeof proceso.versionPublicada === 'number' && proceso.versionPublicada > 0;
    return false;
  }
  function esEditor(user, proceso) {
    return tiene(user, 'procesos.editar_todos') || (tiene(user, 'procesos.editar_propios') && esPropietario(user, proceso));
  }

  /* ===== Contenido de una versión ===== */
  var CAMPOS_PASO = ['descripcion', 'responsable', 'sistema', 'entrada', 'resultado', 'evidencia', 'tiempo', 'excepciones'];
  function pasoVacio() { var p = {}; CAMPOS_PASO.forEach(function (c) { p[c] = ''; }); return p; }
  function contenidoVacio() {
    return {
      objetivo: '', alcance: '', descripcion: '', entradas: [], resultadosEsperados: [], sistemas: [],
      riesgos: [], controles: [], evidencias: [], indicadores: [], tiempoObjetivo: '',
      documentosRelacionados: [], pasos: []
    };
  }
  function lineas(texto) {
    return String(texto || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function urlSegura(u) {
    try { var x = new URL(String(u).trim()); return x.protocol === 'https:'; } catch (e) { return false; }
  }
  /* Errores de un borrador que se guarda (laxo) o se envía a revisión (estricto). */
  function validarContenido(c, estricto) {
    var e = {};
    (c.pasos || []).forEach(function (p, i) {
      if (!String(p.descripcion || '').trim()) e['paso' + i + '.descripcion'] = 'Escribe qué se hace en este paso.';
      if (!String(p.responsable || '').trim()) e['paso' + i + '.responsable'] = 'Indica quién lo hace.';
    });
    (c.documentosRelacionados || []).forEach(function (d, i) {
      if (!String(d.titulo || '').trim()) e['doc' + i + '.titulo'] = 'Escribe un título.';
      if (!urlSegura(d.url)) e['doc' + i + '.url'] = 'Usa un enlace https:// válido.';
    });
    if (estricto) {
      if (!String(c.objetivo || '').trim()) e.objetivo = 'El objetivo es obligatorio para enviar a revisión.';
      if (!String(c.alcance || '').trim()) e.alcance = 'El alcance es obligatorio para enviar a revisión.';
      if (!(c.pasos || []).length) e.pasos = 'Agrega al menos una actividad.';
    }
    return e;
  }
  /* "Documentado" = versión vigente con objetivo, alcance, responsable del proceso y ≥1 actividad. */
  function esDocumentado(proceso, contenido) {
    return !!(proceso && proceso.responsable && contenido &&
      String(contenido.objetivo || '').trim() && String(contenido.alcance || '').trim() &&
      (contenido.pasos || []).length > 0);
  }

  /* ===== Fechas ===== */
  function hoyISO(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function sumarMeses(iso, n) {
    var p = iso.split('-').map(Number), y = p[0], m = p[1] - 1 + n, dia = p[2];
    var f = new Date(Date.UTC(y, m, 1)), ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    f.setUTCDate(Math.min(dia, ultimo));
    return f.toISOString().slice(0, 10);
  }
  function sumarDias(iso, n) {
    var f = new Date(iso + 'T00:00:00Z'); f.setUTCDate(f.getUTCDate() + n); return f.toISOString().slice(0, 10);
  }

  /* ===== Acciones (máquina de estados) ===== */
  /* Cada acción actúa sobre la versión de trabajo. 'perm' es el permiso de rol; 'editor' exige ser editor del proceso. */
  var ACCIONES = {
    enviar_revision:      { label: 'Enviar a revisión',        desde: ['borrador'],                                   hacia: 'en_revision',           editor: true },
    solicitar_aprobacion: { label: 'Solicitar aprobación',     desde: ['en_revision'],                                hacia: 'pendiente_aprobacion',  editor: true },
    devolver:             { label: 'Devolver a borrador',      desde: ['en_revision'],                                hacia: 'borrador',              editor: true },
    aprobar:              { label: 'Aprobar',                  desde: ['pendiente_aprobacion'],                       hacia: 'aprobado',              perm: 'procesos.aprobar', segregacion: true },
    rechazar:             { label: 'Rechazar (con motivo)',    desde: ['pendiente_aprobacion'],                       hacia: 'borrador',              perm: 'procesos.aprobar', motivo: true },
    publicar:             { label: 'Publicar',                 desde: ['aprobado'],                                   hacia: 'publicado',             perm: 'procesos.publicar' },
    iniciar_revision:     { label: 'Iniciar revisión periódica', desde: ['publicado'],                                hacia: 'en_revision_periodica', editor: true, soloVigente: true },
    ratificar:            { label: 'Ratificar vigencia',       desde: ['en_revision_periodica'],                      hacia: 'publicado',             perm: 'procesos.publicar', soloVigente: true },
    nueva_version:        { label: 'Crear nueva versión',      desde: ['publicado', 'en_revision_periodica'],         hacia: 'borrador',              editor: true, soloVigente: true, crea: true },
    marcar_obsoleto:      { label: 'Marcar obsoleto (con motivo)', desde: ['aprobado', 'publicado', 'en_revision_periodica', 'borrador'], hacia: 'obsoleto', perm: 'procesos.publicar', motivo: true }
  };

  /* ctx: {user:{email,roles}, proceso, version}. Devuelve [{id,label,ok,motivo,requiereMotivo}] solo con las acciones
     que existen para el estado actual; las que el usuario no puede ejecutar vienen con ok:false y la razón. */
  function accionesDisponibles(ctx) {
    var u = ctx.user, p = ctx.proceso, v = ctx.version, out = [];
    if (!p || !v || v.numero !== p.versionTrabajo) return out;
    Object.keys(ACCIONES).forEach(function (id) {
      var a = ACCIONES[id];
      if (a.desde.indexOf(v.estado) < 0) return;
      if (a.soloVigente && p.versionPublicada !== v.numero) return;
      var ok = true, motivo = '';
      if (a.editor && !esEditor(u, p)) { ok = false; motivo = 'Solo quien edita este proceso puede hacerlo.'; }
      if (a.perm && !tiene(u, a.perm)) { ok = false; motivo = a.perm === 'procesos.aprobar' ? 'Solo el Director de TI puede aprobar o rechazar.' : 'Tu rol no tiene permiso para esta acción.'; }
      if (ok && a.segregacion && (v.editores || []).indexOf(u.email) >= 0) { ok = false; motivo = 'Segregación de funciones: quien editó la versión no puede aprobarla.'; }
      out.push({ id: id, label: a.label, ok: ok, motivo: motivo, requiereMotivo: !!a.motivo });
    });
    return out;
  }

  /* Calcula los cambios que produce una acción. No toca ninguna base de datos: devuelve qué escribir.
     Lanza Error si la acción no es válida para el estado dado (revalidación dentro de la transacción). */
  function aplicarAccion(ctx, accionId, opciones) {
    opciones = opciones || {};
    var disp = accionesDisponibles(ctx).filter(function (x) { return x.id === accionId; })[0];
    if (!disp) throw new Error('La acción "' + accionId + '" no es válida para el estado actual.');
    if (!disp.ok) throw new Error(disp.motivo);
    var a = ACCIONES[accionId], p = ctx.proceso, v = ctx.version, u = ctx.user, hoy = opciones.hoy || hoyISO();
    if (a.motivo && !String(opciones.motivo || '').trim()) throw new Error('El motivo es obligatorio.');
    if (accionId === 'enviar_revision') {
      var err = validarContenido(v.contenido, true);
      if (Object.keys(err).length) { var e2 = new Error('El borrador está incompleto.'); e2.detalle = err; throw e2; }
    }
    var cambios = {
      version: { estado: a.hacia },
      proceso: { estado: a.hacia },
      nuevaVersion: null,
      versionAnterior: null,
      motivo: opciones.motivo || ''
    };
    if (accionId === 'aprobar') cambios.version.aprobacion = { por: u.email, fecha: hoy, comentario: opciones.comentario || '' };
    if (accionId === 'rechazar' || accionId === 'devolver') { cambios.version.aprobacion = null; if (accionId === 'rechazar') cambios.version.motivoRechazo = opciones.motivo; }
    if (accionId === 'publicar') {
      cambios.version.publicadoPor = u.email; cambios.version.publicadoEn = hoy;
      cambios.proceso.versionPublicada = v.numero;
      cambios.proceso.proximaRevision = sumarMeses(hoy, p.periodoRevisionMeses || 12);
      cambios.proceso.documentado = esDocumentado(p, v.contenido);
      if (p.versionPublicada && p.versionPublicada !== v.numero) cambios.versionAnterior = { numero: p.versionPublicada, estado: 'reemplazada' };
    }
    if (accionId === 'ratificar') cambios.proceso.proximaRevision = sumarMeses(hoy, p.periodoRevisionMeses || 12);
    if (accionId === 'marcar_obsoleto') { cambios.version.motivoObsolescencia = opciones.motivo; cambios.proceso.versionPublicada = null; cambios.proceso.proximaRevision = null; cambios.proceso.documentado = false; }
    if (a.crea) {
      var nuevo = v.numero + 1;
      cambios.version = {};      /* la versión actual no cambia: se conserva tal cual */
      cambios.proceso = { estado: 'borrador', versionTrabajo: nuevo };
      cambios.nuevaVersion = { numero: nuevo, estado: 'borrador', contenido: JSON.parse(JSON.stringify(v.contenido)), editores: [u.email], creadoPor: u.email, basadaEn: v.numero };
    }
    return cambios;
  }

  /* ===== Indicadores (fórmulas documentadas en docs/PLATAFORMA.md) ===== */
  var MIN_MUESTRA = 5, VENTANA_DIAS = 30;
  function indicadores(procesos, hoy, ventana) {
    hoy = hoy || hoyISO(); ventana = ventana || VENTANA_DIAS;
    var limite = sumarDias(hoy, ventana);
    var activos = procesos.filter(function (p) { return p.estado !== 'obsoleto'; });
    function vig(p) { return vigente(p.estado) || (typeof p.versionPublicada === 'number' && p.versionPublicada > 0); }
    var documentados = activos.filter(function (p) { return vig(p) && p.documentado === true; }).length;
    var n = activos.length;
    return {
      registrados: n,
      documentados: documentados,
      porcentajeDocumentados: n >= MIN_MUESTRA ? Math.round(documentados / n * 100) : null,   // null = muestra insuficiente
      muestraMinima: MIN_MUESTRA,
      enRevision: procesos.filter(function (p) { return p.estado === 'en_revision'; }).length,
      pendientesAprobacion: procesos.filter(function (p) { return p.estado === 'pendiente_aprobacion'; }).length,
      publicados: procesos.filter(vig).length,
      proximosRevision: procesos.filter(function (p) { return vig(p) && p.proximaRevision && p.proximaRevision >= hoy && p.proximaRevision <= limite; }).length,
      revisionVencida: procesos.filter(function (p) { return vig(p) && p.proximaRevision && p.proximaRevision < hoy; }).length,
      sinRespaldo: activos.filter(function (p) { return !(p.participantes || []).length; }).length
    };
  }
  /* Filtro de la tabla correspondiente a cada tarjeta, para "navegar hasta los registros que la componen". */
  function filtroIndicador(clave, hoy, ventana) {
    hoy = hoy || hoyISO(); var limite = sumarDias(hoy, ventana || VENTANA_DIAS);
    function vig(p) { return vigente(p.estado) || (typeof p.versionPublicada === 'number' && p.versionPublicada > 0); }
    var f = {
      registrados: function (p) { return p.estado !== 'obsoleto'; },
      documentados: function (p) { return p.estado !== 'obsoleto' && vig(p) && p.documentado === true; },
      enRevision: function (p) { return p.estado === 'en_revision'; },
      pendientesAprobacion: function (p) { return p.estado === 'pendiente_aprobacion'; },
      publicados: vig,
      proximosRevision: function (p) { return vig(p) && p.proximaRevision && p.proximaRevision >= hoy && p.proximaRevision <= limite; },
      revisionVencida: function (p) { return vig(p) && p.proximaRevision && p.proximaRevision < hoy; },
      sinRespaldo: function (p) { return p.estado !== 'obsoleto' && !(p.participantes || []).length; }
    };
    return f[clave] || null;
  }

  /* ===== Catálogo inicial: solo nombres y categoría. No se inventa ningún procedimiento. ===== */
  var CATEGORIAS = ['Accesos', 'Servicio', 'Cambios', 'SAP', 'Activos', 'Proveedores', 'Proyectos', 'Continuidad', 'Infraestructura', 'Seguridad', 'Datos', 'Documentación', 'Personal', 'Otra'];
  var CATALOGO_INICIAL = [
    ['Administración de usuarios y accesos', 'Accesos'], ['Gestión de incidentes', 'Servicio'], ['Gestión de solicitudes', 'Servicio'],
    ['Gestión de problemas recurrentes', 'Servicio'], ['Gestión de cambios', 'Cambios'], ['Gestión de transportes SAP', 'SAP'],
    ['Administración de activos', 'Activos'], ['Administración de licencias', 'Activos'], ['Gestión de proveedores', 'Proveedores'],
    ['Administración de contratos', 'Proveedores'], ['Gestión de proyectos', 'Proyectos'], ['Gestión de respaldos', 'Continuidad'],
    ['Continuidad operativa', 'Continuidad'], ['Gestión de servidores', 'Infraestructura'], ['Administración de Google Cloud', 'Infraestructura'],
    ['Seguridad informática', 'Seguridad'], ['Administración de bases de datos', 'Datos'], ['Gestión de versiones de software', 'Cambios'],
    ['Documentación técnica', 'Documentación'], ['Altas y bajas de personal de TI', 'Personal'], ['Gestión de servicios tecnológicos', 'Servicio']
  ];

  return {
    ROLES: ROLES, PERMISOS_POR_ROL: PERMISOS_POR_ROL, permisos: permisos, tiene: tiene,
    ESTADOS: ESTADOS, ESTADO_LABEL: ESTADO_LABEL, vigente: vigente,
    esPropietario: esPropietario, puedeVer: puedeVer, esEditor: esEditor,
    CAMPOS_PASO: CAMPOS_PASO, pasoVacio: pasoVacio, contenidoVacio: contenidoVacio, lineas: lineas, urlSegura: urlSegura,
    validarContenido: validarContenido, esDocumentado: esDocumentado,
    hoyISO: hoyISO, sumarMeses: sumarMeses, sumarDias: sumarDias,
    ACCIONES: ACCIONES, accionesDisponibles: accionesDisponibles, aplicarAccion: aplicarAccion,
    indicadores: indicadores, filtroIndicador: filtroIndicador, MIN_MUESTRA: MIN_MUESTRA, VENTANA_DIAS: VENTANA_DIAS,
    CATEGORIAS: CATEGORIAS, CATALOGO_INICIAL: CATALOGO_INICIAL
  };
});
