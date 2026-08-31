/* iPhone Culture — admin (extraído de admin.html por CSP; con hardening XSS/robustez) */
(function () {
  "use strict";
  var KEY = "ic_analytics";
  var TOKEN_KEY = "ic_admin_token";
  var DOWS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  var convTypes = ["cta_whatsapp", "form_canje", "form_turno", "form_lead", "form_resena", "form_pregunta", "quiz", "calculadora"];
  var labels = {
    cta_whatsapp: "Clics en WhatsApp",
    form_canje: "Cotizaciones trade-in",
    form_turno: "Pedidos de turno",
    form_lead: "Leads (consulta)",
    form_resena: "Reseñas",
    form_pregunta: "Preguntas (FAQ)",
    quiz: "Quiz (eventos)",
    calculadora: "Planes calculados (cuotas)"
  };
  var tipoTxt = { form_lead: "Lead", form_resena: "Reseña", form_turno: "Turno", form_canje: "Trade-in", form_pregunta: "Pregunta", quiz: "Quiz", calculadora: "Calculadora", lead: "Lead" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }
  function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  /* --- Auth: token Bearer ingresado por prompt, guardado en sessionStorage --- */
  var token = sessionStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    token = prompt("Clave de administrador (token API):") || "";
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  }
  function denied(msg) {
    document.body.innerHTML = '<main class="admin-main"><p class="admin-note">' + esc(msg || "Acceso denegado.") +
      ' <a href="index.html" style="color:var(--accent)">Volver al sitio</a></p></main>';
  }

  /* --- Render helpers compartidos --- */
  function renderChart(countsByDay) {
    var chart = document.getElementById("chart");
    if (!chart) return;
    countsByDay = (countsByDay && typeof countsByDay === "object") ? countsByDay : {};
    var max = 1, daysArr = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = dayKey(d);
      var c = num(countsByDay[k]);
      if (c > max) max = c;
      daysArr.push({ c: c, label: DOWS[d.getDay()] + " " + d.getDate() });
    }
    chart.innerHTML = daysArr.map(function (x) {
      var h = Math.round((x.c / max) * 140);
      return '<div class="chart-bar"><span class="bar-val">' + x.c + '</span>' +
        '<div class="bar" style="height:' + Math.max(h, 3) + 'px"></div>' +
        '<span class="bar-label">' + x.label + "</span></div>";
    }).join("");
  }
  function renderRefs(pairs) {
    var el = document.getElementById("refs");
    if (!el) return;
    pairs = Array.isArray(pairs) ? pairs : [];
    el.innerHTML = pairs.length
      ? pairs.map(function (r) { return '<div class="ref-row"><span class="ref-name">' + esc(r[0]) + '</span><span class="ref-count">' + num(r[1]) + "</span></div>"; }).join("")
      : '<p class="admin-empty">Sin visitas registradas todavía.</p>';
  }
  function renderConvs(counts) {
    var el = document.getElementById("convs");
    if (!el) return;
    counts = (counts && typeof counts === "object") ? counts : {};
    el.innerHTML = convTypes.map(function (t) {
      return '<div class="ref-row"><span class="ref-name">' + labels[t] + '</span><span class="ref-count">' + num(counts[t]) + "</span></div>";
    }).join("");
  }
  function renderLeadsRows(rows) {
    var body = document.getElementById("leadsBody");
    var empty = document.getElementById("leadsEmpty");
    if (!body || !empty) return;
    body.innerHTML = rows.join("");
    empty.hidden = rows.length > 0;
  }

  /* --- Modo API (backend server.js) --- */
  function apiGet(path) {
    return fetch(path, { headers: { "Authorization": "Bearer " + token } }).then(function (r) {
      if (r.status === 401) { sessionStorage.removeItem(TOKEN_KEY); throw Object.assign(new Error("unauthorized"), { code: 401 }); }
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }
  function renderApi(stats, leadsRes) {
    stats = (stats && typeof stats === "object") ? stats : {};
    var visits = (stats.visits && typeof stats.visits === "object") ? stats.visits : {};
    var conversions = (stats.conversions && typeof stats.conversions === "object") ? stats.conversions : {};
    document.getElementById("stTotal").textContent = num(visits.total);
    document.getElementById("stHoy").textContent = num(visits.today);
    document.getElementById("st7d").textContent = num(visits.last7d);
    document.getElementById("stConv").textContent = num(conversions.total);
    renderChart(visits.byDay || {});
    renderRefs((Array.isArray(stats.topReferrers) ? stats.topReferrers : []).map(function (r) {
      return [String((r && r.referrer) || ""), num(r && r.count)];
    }));
    renderConvs(conversions.byType || {});
    var leads = (leadsRes && Array.isArray(leadsRes.leads)) ? leadsRes.leads : [];
    renderLeadsRows(leads.map(function (l) {
      l = (l && typeof l === "object") ? l : {};
      var fecha = l.ts ? new Date(l.ts).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "";
      var detalle = (String(l.model || "") ? String(l.model || "") + " · " : "") + String(l.message || "").slice(0, 120);
      return "<tr><td>" + esc(l.name || "—") + "</td><td>" + esc(l.phone || "—") + "</td><td>" +
        esc(tipoTxt[l.source] || l.source || "Lead") + "</td><td>" + esc(detalle) + "</td><td>" + fecha + "</td></tr>";
    }));
    var note = document.querySelector(".admin-note");
    if (note) note.textContent = "✅ Datos del servidor (backend API) — " + (stats.generatedAt ? new Date(stats.generatedAt).toLocaleString("es-AR") : "");
  }

  /* --- Modo local (fallback si no hay backend) --- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  var localData = null;
  function renderLocal() {
    localData = loadLocal();
    var data = localData;
    var visitas = data.filter(function (e) { return e && e.type === "visita"; });
    var hoy = dayKey(new Date());
    var hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);
    document.getElementById("stTotal").textContent = visitas.length;
    document.getElementById("stHoy").textContent = visitas.filter(function (e) { return (e.ts || "").slice(0, 10) === hoy; }).length;
    document.getElementById("st7d").textContent = visitas.filter(function (e) { return new Date(e.ts) >= hace7; }).length;
    var convs = data.filter(function (e) { return e && convTypes.indexOf(e.type) !== -1; });
    document.getElementById("stConv").textContent = convs.length;
    var counts = {};
    visitas.forEach(function (e) { var k = (e.ts || "").slice(0, 10); counts[k] = (counts[k] || 0) + 1; });
    renderChart(counts);
    var refCounts = {};
    visitas.forEach(function (e) {
      var r = (e.data && e.data.referrer) || "(directo)";
      try { if (r !== "(directo)") r = new URL(r).hostname; } catch (err) {}
      refCounts[r] = (refCounts[r] || 0) + 1;
    });
    renderRefs(Object.keys(refCounts).map(function (k) { return [k, refCounts[k]]; }).sort(function (a, b) { return b[1] - a[1]; }));
    var countsByType = {};
    convTypes.forEach(function (t) { countsByType[t] = data.filter(function (e) { return e && e.type === t; }).length; });
    renderConvs(countsByType);
    var leads = data.filter(function (e) {
      return e && ["form_lead", "form_resena", "form_turno", "form_canje", "form_pregunta", "quiz", "calculadora"].indexOf(e.type) !== -1;
    }).slice(-25).reverse();
    renderLeadsRows(leads.map(function (e) {
      var d = (e.data && typeof e.data === "object") ? e.data : {};
      var detalle = d.interes || d.estrellas || d.motivo || d.equipo || d.tema ||
        (e.type === "quiz" ? (d.accion || "") + (d.modelo ? " → " + d.modelo : "") : "") ||
        (e.type === "calculadora" ? (d.modelo || "") + " " + (d.capacidad_gb || "") + "GB · cuota $" + num(d.cuota) : "") || "";
      var fecha = e.ts ? new Date(e.ts).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "";
      return "<tr><td>" + esc(d.nombre || "—") + "</td><td>" + esc(d.telefono || "—") + "</td><td>" +
        esc(tipoTxt[e.type] || e.type || "?") + "</td><td>" + esc(detalle) + "</td><td>" + fecha + "</td></tr>";
    }));
    var note = document.querySelector(".admin-note");
    if (note) note.textContent = "⚠️ Backend no disponible — mostrando datos locales de este navegador.";
  }

  /* --- Carga principal: API primero, fallback local --- */
  if (token) {
    Promise.all([apiGet("/api/admin/stats"), apiGet("/api/admin/leads")])
      .then(function (rs) { renderApi(rs[0], rs[1]); })
      .catch(function (err) {
        if (err && err.code === 401) { denied("Token inválido. Recargá la página para reingresarlo."); return; }
        renderLocal();
      });
  } else {
    renderLocal();
  }

  /* --- Exportar --- */
  function download(name, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function exportViaApi(format) {
    return fetch("/api/admin/export?format=" + format, { headers: { "Authorization": "Bearer " + token } })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.blob();
      })
      .then(function (b) { download("iphoneculture-analytics." + format, b); });
  }
  function exportLocal(format) {
    var data = localData || loadLocal();
    if (format === "json") {
      download("iphoneculture-analytics.json", JSON.stringify(data, null, 2), "application/json");
    } else {
      var rows = [["type", "ts", "data"]];
      data.forEach(function (e) { rows.push([e.type, e.ts, JSON.stringify(e.data || {})]); });
      var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
      download("iphoneculture-analytics.csv", csv, "text/csv");
    }
  }
  document.getElementById("btnJson").addEventListener("click", function () {
    if (token) exportViaApi("json").catch(function () { exportLocal("json"); });
    else exportLocal("json");
  });
  document.getElementById("btnCsv").addEventListener("click", function () {
    if (token) exportViaApi("csv").catch(function () { exportLocal("csv"); });
    else exportLocal("csv");
  });
  document.getElementById("btnClear").addEventListener("click", function () {
    if (confirm("¿Borrar todos los datos locales de analytics? (no afecta al servidor)")) {
      localStorage.removeItem(KEY);
      location.reload();
    }
  });
})();
