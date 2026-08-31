/* iPhone Culture — interactivity (vanilla JS, no dependencies) */
(function () {
  "use strict";

  var WA_NUMBER = "542994652611";

  function waLink(message) {
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(message);
  }

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Local analytics (fail-safe, sin backend) ---------- */
  var IC_ANALYTICS_KEY = "ic_analytics";
  var IC_ANALYTICS_CAP = 1000;

  /* POST fire-and-forget al backend; fallback silencioso (sitio funciona como estático puro) */
  function icApi(path, payload) {
    try {
      fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () { /* sin backend (estático): noop */ });
    } catch (e) { /* noop */ }
  }

  /* Timestamp de carga de página: anti-spam temporal (el server exige 3s < now-t0 < 1h) */
  var IC_PAGE_T0 = Date.now();

  /* Honeypot: valor de TODOS los campos ocultos "website" (si un bot llena alguno, se detecta) */
  function icHoneypot() {
    var v = "";
    try {
      document.querySelectorAll('.hp input[name="website"]').forEach(function (el) {
        if (el.value) v += el.value;
      });
    } catch (e) { /* noop */ }
    return v;
  }

  /* Envía un lead al backend (cotizador, quiz, formularios, etc.) */
  function icLead(source, opts) {
    opts = opts || {};
    icApi("/api/lead", {
      name: String(opts.name || "Visitante web").slice(0, 80),
      phone: String(opts.phone || "").slice(0, 20),
      message: String(opts.message || "").slice(0, 2000),
      source: source,
      model: opts.model ? String(opts.model).slice(0, 80) : undefined,
      website: icHoneypot(),
      t0: IC_PAGE_T0
    });
  }

  /* Claves de datos personales que NUNCA van por tracking (solo por icLead) */
  var PII_KEYS = ["nombre", "telefono", "tel", "phone", "name", "texto", "mensaje", "message"];
  function stripPii(data) {
    if (!data || typeof data !== "object") return {};
    var out = {};
    Object.keys(data).forEach(function (k) {
      if (PII_KEYS.indexOf(k.toLowerCase()) !== -1) return;
      out[k] = data[k];
    });
    return out;
  }

  function icTrack(type, data) {
    data = stripPii(data); /* sin PII: ni al buffer local ni al server */
    try {
      var raw = localStorage.getItem(IC_ANALYTICS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.push({
        type: type,
        ts: new Date().toISOString(),
        data: data
      });
      if (arr.length > IC_ANALYTICS_CAP) arr = arr.slice(arr.length - IC_ANALYTICS_CAP);
      localStorage.setItem(IC_ANALYTICS_KEY, JSON.stringify(arr));
    } catch (e) { /* analytics nunca bloquea la UI */ }
    icApi("/api/track", {
      type: type,
      page: location.pathname.split("/").pop() || "index.html",
      referrer: document.referrer || "(directo)",
      data: data
    });
  }

  (function icVisit() {
    try {
      icTrack("visita", {
        page: location.pathname.split("/").pop() || "index.html",
        referrer: document.referrer || "(directo)",
        ua: (navigator.userAgent || "").slice(0, 160),
        lang: navigator.language || "",
        screen: window.screen ? window.screen.width + "x" + window.screen.height : ""
      });
      var start = Date.now();
      window.addEventListener("pagehide", function () {
        icTrack("salida", { page: location.pathname.split("/").pop() || "index.html", segundos: Math.round((Date.now() - start) / 1000) });
      });
      /* Clics en CTAs de WhatsApp, con sección de origen */
      document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
        if (!a) return;
        var sec = a.closest("section, header, footer");
        icTrack("cta_whatsapp", {
          seccion: sec ? (sec.id || sec.className || "?") : (a.classList.contains("wa-float") ? "wa-float" : "?")
        });
      });
    } catch (e) { /* noop */ }
  })();

  /* ---------- Sticky nav ---------- */
  var nav = document.getElementById("nav");
  function onScrollNav() {
    if (!nav) return;
    if (window.scrollY > 24) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  }
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById("navBurger");
  var navLinks = document.getElementById("navLinks");
  if (burger && navLinks) {
    burger.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        navLinks.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Scroll reveals (staggered) ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
            el.style.transitionDelay = Math.min(siblings % 4, 3) * 70 + "ms";
            el.classList.add("visible");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Hero parallax (subtle, throttled) ---------- */
  var heroBg = document.getElementById("heroBg");
  if (heroBg && !reducedMotion) {
    var parallaxRaf = null;
    window.addEventListener("scroll", function () {
      if (parallaxRaf) return;
      parallaxRaf = requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y < window.innerHeight) {
          heroBg.style.transform = "translate3d(0," + y * 0.12 + "px,0)";
        }
        parallaxRaf = null;
      });
    }, { passive: true });
  }

  /* ---------- Hero canvas: floating gold particles ---------- */
  (function heroParticles() {
    var canvas = document.getElementById("heroCanvas");
    if (!canvas || reducedMotion) return;
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    var W, H, parts = [], raf = null;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.max(1, W * dpr);
      canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makePart() {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -0.06 - Math.random() * 0.22,
        a: 0.08 + Math.random() * 0.3,
        hue: Math.random() < 0.75 ? "212,175,106" : "120,140,255"
      };
    }

    function tick() {
      if (document.hidden) { raf = null; return; }
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -6 || p.x < -6 || p.x > W + 6) {
          parts[i] = makePart();
          parts[i].y = H + 6;
        }
        var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grad.addColorStop(0, "rgba(" + p.hue + "," + p.a + ")");
        grad.addColorStop(1, "rgba(" + p.hue + ",0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    try {
      resize();
      var count = Math.max(24, Math.min(70, Math.floor(W * H / 26000)));
      for (var i = 0; i < count; i++) parts.push(makePart());
      tick();
      window.addEventListener("resize", function () {
        resize();
      }, { passive: true });
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && raf === null) tick();
      });
    } catch (e) { /* particles optional */ }
  })();

  /* ---------- Card tilt (desktop only) ---------- */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reducedMotion) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.classList.add("tilt");
      var rafT = null;
      card.addEventListener("mousemove", function (e) {
        if (rafT) return;
        rafT = requestAnimationFrame(function () {
          var rect = card.getBoundingClientRect();
          var rx = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
          var ry = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
          card.style.transform = "translateY(-4px) perspective(700px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
          rafT = null;
        });
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- Generic chip-row single-select helper ---------- */
  function bindChipRow(row, onPick) {
    if (!row) return;
    row.addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      row.querySelectorAll(".chip").forEach(function (c) {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      if (onPick) onPick(btn);
    });
  }

  /* ---------- Configurator ---------- */
  var config = { tipo: "iPhone nuevo", gama: "última generación (iPhone 17 / 17 Pro)", trade: "Sí, quiero entregar mi iPhone actual como parte de pago" };
  var configPreview = document.getElementById("configPreview");
  var configWa = document.getElementById("configWa");

  function updateConfigurator() {
    var msg = "Hola iPhone Culture! Estoy buscando un " + config.tipo +
      ", gama: " + config.gama + ". Sobre trade-in: " + config.trade +
      ". ¿Me pasan disponibilidad y precios?";
    if (configPreview) configPreview.textContent = "“" + msg + "”";
    if (configWa) configWa.setAttribute("href", waLink(msg));
  }

  document.querySelectorAll(".chip-row[data-config]").forEach(function (row) {
    bindChipRow(row, function (btn) {
      var key = row.getAttribute("data-config");
      if (key && config.hasOwnProperty(key)) {
        config[key] = btn.getAttribute("data-value");
        updateConfigurator();
      }
    });
  });
  updateConfigurator();

  /* ---------- Trade-in multi-step stepper ---------- */
  (function tradeInStepper() {
    var stepper = document.getElementById("tiStepper");
    if (!stepper) return;

    var CATS = [
      { id: "iphone", label: "iPhone" },
      { id: "mac", label: "Mac" },
      { id: "ipad", label: "iPad" },
      { id: "watch", label: "Apple Watch" },
      { id: "samsung", label: "Samsung (gama alta)" }
    ];
    var MODELS_BY_CAT = {
      iphone: [
        { label: "iPhone 16 Pro / Pro Max", t: 5 },
        { label: "iPhone 16 / 16 Plus", t: 5 },
        { label: "iPhone 15 Pro / Pro Max", t: 5 },
        { label: "iPhone 15 / 15 Plus", t: 4 },
        { label: "iPhone 14 Pro / Pro Max", t: 4 },
        { label: "iPhone 14 / 14 Plus", t: 3 },
        { label: "iPhone 13 Pro / Pro Max", t: 3 },
        { label: "iPhone 13 / 13 mini", t: 2 },
        { label: "iPhone 12 (toda la línea)", t: 2 },
        { label: "iPhone 11 (toda la línea)", t: 1 },
        { label: "iPhone X / XR / XS", t: 1 }
      ],
      mac: [
        { label: "MacBook Pro M4", t: 5 },
        { label: "MacBook Air M4", t: 5 },
        { label: "MacBook Pro M3", t: 4 },
        { label: "MacBook Air M3", t: 4 },
        { label: "MacBook Pro M2", t: 4 },
        { label: "MacBook Air M2", t: 3 },
        { label: "MacBook Air / Pro M1", t: 3 },
        { label: "iMac M3 / M4", t: 4 },
        { label: "iMac M1", t: 2 },
        { label: "Mac mini M2 / M4", t: 3 },
        { label: "Mac Studio", t: 4 }
      ],
      ipad: [
        { label: "iPad Pro M4", t: 5 },
        { label: "iPad Pro M2", t: 4 },
        { label: "iPad Air M2 / M3", t: 4 },
        { label: "iPad Air (gen anterior)", t: 3 },
        { label: "iPad Pro M1", t: 3 },
        { label: "iPad 10ª gen", t: 2 },
        { label: "iPad mini 6 / 7", t: 2 },
        { label: "iPad 9ª gen o anterior", t: 1 }
      ],
      watch: [
        { label: "Apple Watch Ultra 2", t: 5 },
        { label: "Apple Watch Ultra", t: 4 },
        { label: "Apple Watch Series 10", t: 4 },
        { label: "Apple Watch Series 9", t: 3 },
        { label: "Apple Watch Series 8", t: 2 },
        { label: "Apple Watch SE 2", t: 2 },
        { label: "Series 7 o anterior", t: 1 }
      ],
      samsung: [
        { label: "Galaxy S26 Ultra", t: 5 },
        { label: "Galaxy S25 Ultra", t: 5 },
        { label: "Galaxy S24 Ultra", t: 4 },
        { label: "Galaxy S23 Ultra", t: 3 },
        { label: "Galaxy Z Fold 7 / 6", t: 4 },
        { label: "Galaxy Z Fold 5", t: 3 },
        { label: "Galaxy Z Flip 6 / 7", t: 3 },
        { label: "Galaxy Z Flip 5", t: 2 }
      ]
    };
    var BATTERY = [
      { label: "90% o más de salud", m: 1.0 },
      { label: "Entre 80% y 89%", m: 0.9 },
      { label: "Menos de 80%", m: 0.75 }
    ];
    var SCREEN = [
      { label: "Perfecta, sin marcas", m: 1.0 },
      { label: "Rayones leves", m: 0.9 },
      { label: "Vidrio roto / a revisar", m: 0.6 }
    ];
    var BODY = [
      { label: "Impecable", m: 1.0 },
      { label: "Marcas mínimas de uso", m: 0.9 },
      { label: "Marcas visibles / golpes", m: 0.7 }
    ];
    var BOX = [
      { label: "Sí, tengo la caja", m: 1.0 },
      { label: "No tengo la caja", m: 0.95 }
    ];
    var ACCS = ["Cable", "Cargador", "Auriculares", "Fundas", "Factura de compra"];

    var TI_VERDICTS = {
      5: "¡Excelente candidato! Tu equipo está en la gama que más cotiza. Suele representar una parte muy importante del valor de tu próximo iPhone.",
      4: "Muy buen candidato para trade-in. Tu equipo mantiene un valor alto y puede bajar mucho el precio de tu próximo iPhone.",
      3: "Buen candidato para trade-in. Todavía tiene un valor interesante como parte de pago.",
      2: "Tu equipo puede sumar como parte de pago. La cotización depende bastante del estado, así que vale la pena revisarlo.",
      1: "Podemos recibirlo como parte de pago, aunque su valor es más acotado. Lo revisamos y te damos una cotización honesta."
    };

    var state = { cat: null, catId: null, model: null, battery: null, screen: null, body: null, box: null, accs: [], name: "", note: "" };
    var currentStep = 1;

    function buildChips(containerId, items, multi) {
      var c = document.getElementById(containerId);
      if (!c) return;
      items.forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = item.label || item;
        b.setAttribute("aria-pressed", "false");
        if (item.id) b.setAttribute("data-id", item.id);
        if (item.t !== undefined) b.setAttribute("data-t", item.t);
        if (item.m !== undefined) b.setAttribute("data-m", item.m);
        c.appendChild(b);
      });
      if (multi) {
        c.addEventListener("click", function (e) {
          var btn = e.target.closest(".chip");
          if (!btn) return;
          btn.classList.toggle("active");
          btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
          state.accs = [];
          c.querySelectorAll(".chip.active").forEach(function (x) { state.accs.push(x.textContent); });
          updateNext(3);
        });
      }
    }

    buildChips("tiCats", CATS, false);
    buildChips("tiBattery", BATTERY, false);
    buildChips("tiScreen", SCREEN, false);
    buildChips("tiBody", BODY, false);
    buildChips("tiBox", BOX, false);
    buildChips("tiAccs", ACCS, true);

    var tiModelsEl = document.getElementById("tiModels");
    var tiCatHint = document.getElementById("tiCatHint");

    function renderModels(catId) {
      if (!tiModelsEl) return;
      tiModelsEl.innerHTML = "";
      (MODELS_BY_CAT[catId] || []).forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = item.label;
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("data-t", item.t);
        tiModelsEl.appendChild(b);
      });
      if (tiCatHint) tiCatHint.style.display = "none";
    }

    bindChipRow(document.getElementById("tiCats"), function (btn) {
      state.cat = btn.textContent;
      state.catId = btn.getAttribute("data-id") || null;
      state.model = null;
      renderModels(state.catId);
      updateNext(1);
    });
    if (tiModelsEl) {
      tiModelsEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".chip");
        if (!btn) return;
        tiModelsEl.querySelectorAll(".chip").forEach(function (x) {
          x.classList.remove("active");
          x.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        state.model = { label: btn.textContent, t: parseFloat(btn.getAttribute("data-t")) };
        updateNext(1);
      });
    }
    bindChipRow(document.getElementById("tiBattery"), function (btn) {
      state.battery = { label: btn.textContent, m: parseFloat(btn.getAttribute("data-m")) };
      updateNext(2);
    });
    bindChipRow(document.getElementById("tiScreen"), function (btn) {
      state.screen = { label: btn.textContent, m: parseFloat(btn.getAttribute("data-m")) };
      updateNext(2);
    });
    bindChipRow(document.getElementById("tiBody"), function (btn) {
      state.body = { label: btn.textContent, m: parseFloat(btn.getAttribute("data-m")) };
      updateNext(2);
    });
    bindChipRow(document.getElementById("tiBox"), function (btn) {
      state.box = { label: btn.textContent, m: parseFloat(btn.getAttribute("data-m")) };
      updateNext(3);
    });

    var next1 = document.getElementById("tiNext1");
    var next2 = document.getElementById("tiNext2");
    var next3 = document.getElementById("tiNext3");

    function setBtn(btn, enabled) {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    }

    function updateNext(step) {
      if (step === 1) setBtn(next1, !!(state.cat && state.model));
      if (step === 2) setBtn(next2, !!(state.battery && state.screen && state.body));
      if (step === 3) setBtn(next3, !!state.box);
    }

    var tiName = document.getElementById("tiName");
    var tiNote = document.getElementById("tiNote");
    if (tiName) tiName.addEventListener("input", function () { state.name = tiName.value.trim(); });
    if (tiNote) tiNote.addEventListener("input", function () { state.note = tiNote.value.trim(); });

    function goTo(step) {
      currentStep = step;
      stepper.querySelectorAll(".ti-pane").forEach(function (p) {
        p.hidden = p.getAttribute("data-pane") !== String(step);
      });
      stepper.querySelectorAll(".ti-step-dot").forEach(function (d) {
        var n = parseInt(d.getAttribute("data-dot"), 10);
        d.classList.toggle("active", n === step);
        d.classList.toggle("done", n < step);
      });
      if (step === 4) renderResult();
      var firstChip = stepper.querySelector('.ti-pane:not([hidden]) .chip, .ti-pane:not([hidden]) .btn');
      if (firstChip && step > 1) firstChip.focus({ preventScroll: true });
    }

    function tiVerdictFor(score) {
      var tier = score >= 4.25 ? 5 : score >= 3.4 ? 4 : score >= 2.55 ? 3 : score >= 1.7 ? 2 : 1;
      var stars = "★★★★★".slice(0, tier) + "☆☆☆☆☆".slice(0, 5 - tier);
      return { tier: tier, stars: stars };
    }

    function renderResult() {
      if (!state.cat || !state.model || !state.battery || !state.screen || !state.body || !state.box) return;
      var score = state.model.t * state.battery.m * state.screen.m * state.body.m * state.box.m;
      var v = tiVerdictFor(score);
      var tiStars = document.getElementById("tiStars");
      var tiText = document.getElementById("tiText");
      var tiSummary = document.getElementById("tiSummary");
      var tiWa = document.getElementById("tiWa");
      if (tiStars) tiStars.textContent = v.stars;
      if (tiText) tiText.textContent = TI_VERDICTS[v.tier];
      var accsTxt = state.accs.length ? state.accs.join(", ") : "sin accesorios extra";
      var equipoTxt = state.cat + " · " + state.model.label;
      if (tiSummary) {
        tiSummary.textContent = equipoTxt + " · Batería: " + state.battery.label +
          " · Pantalla: " + state.screen.label + " · Cuerpo: " + state.body.label +
          " · " + state.box.label + " · " + accsTxt;
      }
      if (tiWa) {
        var msg = "Hola iPhone Culture!" + (state.name ? " Soy " + state.name + "." : "") +
          " Quiero cotizar mi usado para trade-in:\n" +
          "• Equipo: " + equipoTxt + "\n" +
          "• Batería: " + state.battery.label + "\n" +
          "• Pantalla: " + state.screen.label + "\n" +
          "• Cuerpo: " + state.body.label + "\n" +
          "• Caja: " + state.box.label + "\n" +
          "• Accesorios: " + accsTxt;
        if (state.note) msg += "\n• Comentario: " + state.note;
        msg += "\n¿Me pasan una cotización?";
        state.msg = msg;
        tiWa.setAttribute("href", waLink(msg));
      }
    }

    if (next1) next1.addEventListener("click", function () { if (state.model) goTo(2); });
    if (next2) next2.addEventListener("click", function () { goTo(3); });
    if (next3) next3.addEventListener("click", function () { goTo(4); });
    var back2 = document.getElementById("tiBack2");
    var back3 = document.getElementById("tiBack3");
    if (back2) back2.addEventListener("click", function () { goTo(1); });
    if (back3) back3.addEventListener("click", function () { goTo(2); });
    var restart = document.getElementById("tiRestart");
    if (restart) restart.addEventListener("click", function () {
      state = { cat: null, catId: null, model: null, battery: null, screen: null, body: null, box: null, accs: [], name: "", note: "" };
      stepper.querySelectorAll(".chip").forEach(function (c) {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      if (tiModelsEl) tiModelsEl.innerHTML = "";
      if (tiCatHint) tiCatHint.style.display = "";
      if (tiName) tiName.value = "";
      if (tiNote) tiNote.value = "";
      setBtn(next1, false); setBtn(next2, false); setBtn(next3, false);
      goTo(1);
    });
    var tiWaBtn = document.getElementById("tiWa");
    if (tiWaBtn) tiWaBtn.addEventListener("click", function () {
      icTrack("form_canje", {
        equipo: state.cat && state.model ? state.cat + " · " + state.model.label : "",
        bateria: state.battery ? state.battery.label : "",
        nombre: state.name || ""
      });
      icLead("form_canje", {
        name: state.name || "Visitante web",
        message: state.msg || "Consulta de trade-in desde la web",
        model: state.cat && state.model ? state.cat + " " + state.model.label : undefined
      });
    });
    goTo(1);
  })();

  /* ---------- Model comparador ---------- */
  (function comparador() {
    var selA = document.getElementById("cmpA");
    var selB = document.getElementById("cmpB");
    var cards = document.getElementById("cmpCards");
    var cmpWa = document.getElementById("cmpWa");
    if (!selA || !selB || !cards) return;

    var SPECS = [
      { name: "iPhone 17 Pro Max", screen: 6.9, screenTxt: "6.9″ ProMotion 120 Hz", chip: "A19 Pro", cam: "Triple 48 MP (principal + ultra gran angular + teleobjetivo)", batt: 39, battTxt: "Hasta 39 h de video" },
      { name: "iPhone 17 Pro", screen: 6.3, screenTxt: "6.3″ ProMotion 120 Hz", chip: "A19 Pro", cam: "Triple 48 MP (principal + ultra gran angular + teleobjetivo)", batt: 33, battTxt: "Hasta 33 h de video" },
      { name: "iPhone 17 Air", screen: 6.5, screenTxt: "6.5″ ProMotion 120 Hz · ultrafino", chip: "A19 Pro", cam: "48 MP Fusion", batt: 27, battTxt: "Hasta 27 h de video" },
      { name: "iPhone 17", screen: 6.3, screenTxt: "6.3″ ProMotion 120 Hz", chip: "A19", cam: "48 MP Fusion + ultra gran angular", batt: 30, battTxt: "Hasta 30 h de video" },
      { name: "iPhone 16", screen: 6.1, screenTxt: "6.1″ Super Retina", chip: "A18", cam: "48 MP + ultra gran angular", batt: 22, battTxt: "Hasta 22 h de video" },
      { name: "iPhone 15", screen: 6.1, screenTxt: "6.1″ Super Retina", chip: "A16 Bionic", cam: "48 MP + ultra gran angular", batt: 20, battTxt: "Hasta 20 h de video" },
      { name: "iPhone 14", screen: 6.1, screenTxt: "6.1″ Super Retina", chip: "A15 Bionic", cam: "12 MP dual + ultra gran angular", batt: 20, battTxt: "Hasta 20 h de video" },
      { name: "iPhone 13", screen: 6.1, screenTxt: "6.1″ Super Retina", chip: "A15 Bionic", cam: "12 MP dual + ultra gran angular", batt: 19, battTxt: "Hasta 19 h de video" }
    ];

    SPECS.forEach(function (s, i) {
      [selA, selB].forEach(function (sel) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = s.name;
        sel.appendChild(o);
      });
    });
    selA.value = "3";
    selB.value = "0";

    function cardHtml(s, other) {
      var battBetter = s.batt > other.batt;
      var screenBetter = s.screen > other.screen;
      return '<div class="cmp-card' + (battBetter ? " winner" : "") + '">' +
        "<h3>" + s.name + "</h3>" +
        rowHtml("Pantalla", s.screenTxt, screenBetter) +
        rowHtml("Chip", s.chip, false) +
        rowHtml("Cámaras", s.cam, false) +
        rowHtml("Batería", s.battTxt, battBetter) +
        "</div>";
    }
    function rowHtml(k, v, better) {
      return '<div class="cmp-row"><span class="cmp-k">' + k + '</span><span class="cmp-v' + (better ? " better" : "") + '">' + v + "</span></div>";
    }

    function render() {
      var a = SPECS[parseInt(selA.value, 10)];
      var b = SPECS[parseInt(selB.value, 10)];
      if (!a || !b) return;
      cards.innerHTML = cardHtml(a, b) + cardHtml(b, a);
      if (cmpWa) {
        cmpWa.setAttribute("href", waLink(
          "Hola iPhone Culture! Estoy comparando el " + a.name + " y el " + b.name +
          " y no sé cuál me conviene. ¿Me ayudan a elegir? ¿Qué stock y precio tienen de cada uno?"
        ));
      }
    }
    selA.addEventListener("change", render);
    selB.addEventListener("change", render);
    render();
  })();

  /* ---------- FAQ live search ---------- */
  (function faqSearch() {
    var input = document.getElementById("faqSearch");
    var list = document.getElementById("faqList");
    var empty = document.getElementById("faqNoResults");
    if (!input || !list) return;
    var items = list.querySelectorAll(".faq-item");
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var visible = 0;
      items.forEach(function (item) {
        var match = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
        item.classList.toggle("faq-hidden", !match);
        if (match) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    });
  })();

  /* ---------- Ask module ---------- */
  (function askModule() {
    var topics = document.getElementById("askTopics");
    var text = document.getElementById("askText");
    var preview = document.getElementById("askPreview");
    var wa = document.getElementById("askWa");
    if (!topics || !text || !wa) return;
    var topic = "precios y disponibilidad";

    bindChipRow(topics, function (btn) {
      topic = btn.getAttribute("data-topic") || topic;
      update();
    });
    text.addEventListener("input", update);

    function update() {
      var q = text.value.trim();
      var msg = q
        ? "Hola iPhone Culture! Tengo una consulta sobre " + topic + ": " + q
        : "Hola iPhone Culture! Tengo una consulta sobre " + topic + ". ¿Me pueden ayudar?";
      if (preview) {
        preview.textContent = "“" + (q ? msg : "Hola iPhone Culture! Tengo una consulta sobre " + topic + ": …") + "”";
      }
      wa.setAttribute("href", waLink(msg));
      wa.classList.toggle("ask-empty", !q);
      lastMsg = msg;
    }
    var lastMsg = "";
    wa.addEventListener("click", function () {
      icTrack("form_pregunta", { tema: topic, texto: text.value.trim().slice(0, 200) });
      icLead("form_pregunta", { message: lastMsg || "Consulta desde el módulo de preguntas" });
    });
    update();
  })();

  /* ---------- Turno / reserva de visita ---------- */
  (function turnoPicker() {
    var daysEl = document.getElementById("turnoDays");
    var slotsEl = document.getElementById("turnoSlots");
    var reasonEl = document.getElementById("turnoReason");
    var preview = document.getElementById("turnoPreview");
    var wa = document.getElementById("turnoWa");
    if (!daysEl || !slotsEl || !wa) return;

    var DOWS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    /* Horarios: Lun/Mié/Vie/Sáb 11-18 · Mar/Jue 13-20 · Dom 17-20 */
    var SLOTS_BY_DOW = {
      0: ["17:00", "18:00", "19:00"],
      1: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
      2: ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"],
      3: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
      4: ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"],
      5: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
      6: ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
    };

    var state = { day: null, slot: null, reason: "comprar un iPhone" };

    var days = [];
    var today = new Date();
    for (var i = 0; i < 7; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      days.push(d);
    }

    function isToday(d) {
      var n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    }

    function selectDay(d, btn) {
      daysEl.querySelectorAll(".turno-day").forEach(function (x) {
        x.classList.remove("active");
        x.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      state.day = d;
      state.slot = null;
      renderSlots(d);
      update();
    }

    var dayButtons = [];
    days.forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "turno-day";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", "Elegir día " + DOWS[d.getDay()] + " " + d.getDate() + " de " + MONTHS[d.getMonth()]);
      b.innerHTML = '<span class="td-dow">' + DOWS[d.getDay()] + '</span><span class="td-num">' + d.getDate() + '</span><span class="td-mon">' + MONTHS[d.getMonth()] + "</span>";
      b.addEventListener("click", function () { selectDay(d, b); });
      daysEl.appendChild(b);
      dayButtons.push(b);
    });

    function renderSlots(d) {
      slotsEl.innerHTML = "";
      var slots = (SLOTS_BY_DOW[d.getDay()] || []).slice();
      /* Si el día elegido es hoy, filtrar horarios ya pasados */
      if (isToday(d)) {
        var now = new Date();
        var nowMin = now.getHours() * 60 + now.getMinutes();
        slots = slots.filter(function (s) {
          var parts = s.split(":");
          return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) > nowMin;
        });
      }
      if (!slots.length) {
        var p = document.createElement("p");
        p.className = "ti-hint";
        p.textContent = isToday(d)
          ? "Hoy ya no quedan horarios disponibles — elegí otro día."
          : "No hay horarios para este día.";
        slotsEl.appendChild(p);
        return;
      }
      slots.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = s + " h";
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("data-value", s);
        slotsEl.appendChild(b);
      });
    }

    slotsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      slotsEl.querySelectorAll(".chip").forEach(function (c) {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      state.slot = btn.getAttribute("data-value");
      update();
    });

    if (reasonEl) {
      bindChipRow(reasonEl, function (btn) {
        state.reason = btn.getAttribute("data-value") || state.reason;
        update();
      });
    }

    function update() {
      if (!state.day || !state.slot) {
        if (preview) preview.textContent = "Elegí día y horario y acá aparece tu pedido de turno listo para enviar.";
        wa.setAttribute("href", waLink("Hola iPhone Culture! Quiero pedir un turno para visitar el local. ¿Qué disponibilidad tienen?"));
        return;
      }
      var dayTxt = DOWS[state.day.getDay()] + " " + state.day.getDate() + " de " + MONTHS[state.day.getMonth()];
      var msg = "Hola iPhone Culture! Quiero reservar un turno: " + dayTxt +
        " a las " + state.slot + " h, motivo: " + state.reason +
        ". ¿Me lo confirman? (Sujeto a confirmación)";
      if (preview) preview.textContent = "“" + msg + "”";
      wa.setAttribute("href", waLink(msg));
      lastMsg = msg;
    }
    var lastMsg = "";
    wa.addEventListener("click", function () {
      icTrack("form_turno", {
        dia: state.day ? state.day.toISOString().slice(0, 10) : "",
        horario: state.slot || "",
        motivo: state.reason
      });
      icLead("form_turno", { message: lastMsg || "Pedido de turno desde la web" });
    });
    /* Día por defecto: hoy (con sus horarios filtrados si ya pasaron) */
    selectDay(days[0], dayButtons[0]);
  })();

  /* ---------- Form helpers ---------- */
  function validPhone(p) {
    var digits = (p || "").replace(/\D/g, "");
    return digits.length >= 8;
  }
  function showFeedback(el, msg, isError) {
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
    el.hidden = false;
  }

  /* ---------- Lead form ---------- */
  var leadForm = document.getElementById("leadForm");
  if (leadForm) {
    leadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("ldName").value.trim();
      var phone = document.getElementById("ldPhone").value.trim();
      var interest = document.getElementById("ldInterest").value;
      var fb = document.getElementById("ldFeedback");
      if (!validPhone(phone)) {
        showFeedback(fb, "Revisá el número de WhatsApp: parece incompleto (mínimo 8 dígitos).", true);
        return;
      }
      var msg = "Hola iPhone Culture! Soy " + name +
        ". Estoy buscando: " + interest + ". ¿Me pueden ayudar?";
      icTrack("form_lead", { nombre: name, telefono: phone, interes: interest });
      icLead("form_lead", { name: name, phone: phone, message: msg, model: interest });
      window.open(waLink(msg), "_blank", "noopener");
      showFeedback(fb, "¡Listo, " + name + "! Te abrimos WhatsApp con tu consulta armada. También te vamos a poder responder por ese número.");
      leadForm.reset();
    });
  }

  /* ---------- Review form ---------- */
  var reviewForm = document.getElementById("reviewForm");
  if (reviewForm) {
    reviewForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("rvName").value.trim();
      var phone = document.getElementById("rvPhone").value.trim();
      var stars = document.getElementById("rvStars").value;
      var text = document.getElementById("rvText").value.trim();
      var fb = document.getElementById("rvFeedback");
      if (!validPhone(phone)) {
        showFeedback(fb, "Revisá el número de WhatsApp: parece incompleto (mínimo 8 dígitos).", true);
        return;
      }
      var msg = "Hola iPhone Culture! Soy " + name +
        ". Mi experiencia fue: " + stars + ". Comentario: " + text;
      icTrack("form_resena", { nombre: name, telefono: phone, estrellas: stars, texto: text.slice(0, 300) });
      icLead("form_resena", { name: name, phone: phone, message: msg });
      window.open(waLink(msg), "_blank", "noopener");
      showFeedback(fb, "¡Gracias, " + name + "! Te abrimos WhatsApp con tu reseña lista para enviar.");
      reviewForm.reset();
    });
  }

  /* ---------- Productos: línea iPhone con mockups CSS ---------- */
  (function productos() {
    var grid = document.getElementById("prodGrid");
    var filter = document.getElementById("prodFilter");
    if (!grid) return;

    var MODELS = [
      { name: "iPhone 13", year: 2021, chip: "A15 Bionic", screen: "6.1″ Super Retina", cam: "Dual 12 MP", batt: "Hasta 19 h de video", conn: "Lightning", grad: "linear-gradient(160deg,#2e3b52,#101623 70%)", notch: true, cams: 2, tags: ["economica"] },
      { name: "iPhone 14", year: 2022, chip: "A15 Bionic", screen: "6.1″ Super Retina", cam: "Dual 12 MP (Photonic Engine)", batt: "Hasta 20 h de video", conn: "Lightning", grad: "linear-gradient(160deg,#3a4a6b,#141c2e 70%)", notch: true, cams: 2, tags: ["economica"] },
      { name: "iPhone 15", year: 2023, chip: "A16 Bionic", screen: "6.1″ · Dynamic Island", cam: "48 MP + ultra gran angular", batt: "Hasta 20 h de video", conn: "USB-C", grad: "linear-gradient(160deg,#4d6a8a,#1a2438 70%)", notch: false, cams: 2, tags: ["economica"] },
      { name: "iPhone 16", year: 2024, chip: "A18", screen: "6.1″ Super Retina", cam: "48 MP · Camera Control", batt: "Hasta 22 h de video", conn: "USB-C", grad: "linear-gradient(160deg,#3f7d6b,#12241f 70%)", notch: false, cams: 2, tags: [] },
      { name: "iPhone 17", year: 2025, chip: "A19", screen: "6.3″ ProMotion 120 Hz", cam: "48 MP Fusion + UGA", batt: "Hasta 30 h de video", conn: "USB-C", grad: "linear-gradient(160deg,#8a7ad4,#241c3d 70%)", notch: false, cams: 2, tags: ["ultima"] },
      { name: "iPhone 17 Air", year: 2025, chip: "A19 Pro", screen: "6.5″ ProMotion · 5.6 mm ultrafino", cam: "48 MP Fusion", batt: "Hasta 27 h de video", conn: "USB-C · solo eSIM", grad: "linear-gradient(160deg,#c8ccd4,#3a3f4a 70%)", notch: false, cams: 1, tags: ["ultima"] },
      { name: "iPhone 17 Pro", year: 2025, chip: "A19 Pro", screen: "6.3″ ProMotion 120 Hz", cam: "Triple 48 MP + teleobjetivo", batt: "Hasta 33 h de video", conn: "USB-C", grad: "linear-gradient(160deg,#c47e3d,#3d2312 70%)", notch: false, cams: 3, tags: ["ultima", "pro"] },
      { name: "iPhone 17 Pro Max", year: 2025, chip: "A19 Pro", screen: "6.9″ ProMotion 120 Hz", cam: "Triple 48 MP + teleobjetivo", batt: "Hasta 39 h · la mejor batería", conn: "USB-C", grad: "linear-gradient(160deg,#d4af6a,#3a2c14 70%)", notch: false, cams: 3, tags: ["ultima", "pro"] }
    ];

    function camHtml(cams) {
      if (cams === 1) return "";
      return '<div class="prod-cam' + (cams === 3 ? " cam-triple" : "") + '" aria-hidden="true"></div>';
    }

    function cardHtml(m) {
      return '<article class="prod-card" data-tags="' + m.tags.join(" ") + '">' +
        '<div class="prod-mock">' +
          '<div class="prod-phone" style="background:' + m.grad + '">' +
            (m.notch ? '<div class="prod-notch" aria-hidden="true"></div>' : '<div class="prod-island" aria-hidden="true"></div>') +
            camHtml(m.cams) +
            '<span class="prod-badge">' + m.name.replace("iPhone ", "") + "</span>" +
          "</div>" +
        "</div>" +
        "<h3>" + m.name + '</h3><p class="prod-year">' + m.year + " · " + m.chip + "</p>" +
        '<ul class="prod-specs">' +
          "<li>🖥️ " + m.screen + "</li>" +
          "<li>📷 " + m.cam + "</li>" +
          "<li>🔋 " + m.batt + "</li>" +
          "<li>🔌 " + m.conn + "</li>" +
        "</ul>" +
        '<a class="btn btn-wa" target="_blank" rel="noopener" href="' +
          waLink("Hola! Me interesa el " + m.name + ". ¿Precio y disponibilidad?") +
          '">Consultar precio</a>' +
      "</article>";
    }

    grid.innerHTML = MODELS.map(cardHtml).join("");

    /* Filtro */
    if (filter) {
      filter.addEventListener("click", function (e) {
        var btn = e.target.closest(".chip");
        if (!btn) return;
        filter.querySelectorAll(".chip").forEach(function (c) {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        var f = btn.getAttribute("data-filter");
        grid.querySelectorAll(".prod-card").forEach(function (card) {
          var tags = (card.getAttribute("data-tags") || "").split(" ");
          card.classList.toggle("prod-hidden", f !== "todos" && tags.indexOf(f) === -1);
        });
      });
    }

    /* Tilt 3D con mousemove (solo desktop) */
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reducedMotion) {
      grid.querySelectorAll(".prod-card").forEach(function (card) {
        var rafT = null;
        card.addEventListener("mousemove", function (e) {
          if (rafT) return;
          rafT = requestAnimationFrame(function () {
            var rect = card.getBoundingClientRect();
            var rx = ((e.clientY - rect.top) / rect.height - 0.5) * -8;
            var ry = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
            card.style.transform = "translateY(-4px) perspective(800px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
            rafT = null;
          });
        });
        card.addEventListener("mouseleave", function () { card.style.transform = ""; });
      });
    }
  })();

  /* ---------- Quiz: ¿Qué iPhone es para vos? ---------- */
  (function quizModule() {
    var widget = document.getElementById("quizWidget");
    var body = document.getElementById("quizBody");
    var resultEl = document.getElementById("quizResult");
    var bar = document.getElementById("quizBar");
    var progress = document.getElementById("quizProgress");
    var stepLabel = document.getElementById("quizStepLabel");
    if (!widget || !body || !resultEl) return;

    /* Gradientes reutilizados del catálogo de productos (mockups CSS) */
    var QUIZ_GRADS = {
      "iPhone 13": "linear-gradient(160deg,#2e3b52,#101623 70%)",
      "iPhone 14": "linear-gradient(160deg,#3a4a6b,#141c2e 70%)",
      "iPhone 15": "linear-gradient(160deg,#4d6a8a,#1a2438 70%)",
      "iPhone 16": "linear-gradient(160deg,#3f7d6b,#12241f 70%)",
      "iPhone 17": "linear-gradient(160deg,#8a7ad4,#241c3d 70%)",
      "iPhone 17 Air": "linear-gradient(160deg,#c8ccd4,#3a3f4a 70%)",
      "iPhone 17 Pro": "linear-gradient(160deg,#c47e3d,#3d2312 70%)",
      "iPhone 17 Pro Max": "linear-gradient(160deg,#d4af6a,#3a2c14 70%)"
    };
    var QUIZ_MODELS = Object.keys(QUIZ_GRADS);
    /* Índices en el comparador (SPECS): 0=17PM, 1=17Pro, 2=17Air, 3=17, 4=16, 5=15, 6=14, 7=13 */
    var CMP_INDEX = { "iPhone 17 Pro Max": 0, "iPhone 17 Pro": 1, "iPhone 17 Air": 2, "iPhone 17": 3, "iPhone 16": 4, "iPhone 15": 5, "iPhone 14": 6, "iPhone 13": 7 };

    var QUESTIONS = [
      {
        key: "uso", q: "¿Para qué lo vas a usar principalmente?",
        opts: [
          { label: "Fotos y video", sub: "Redes, contenido, recuerdos en serio", w: { "iPhone 17 Pro Max": 3, "iPhone 17 Pro": 3, "iPhone 17": 1, "iPhone 16": 1 } },
          { label: "Trabajo y estudio", sub: "Mail, documentos, videollamadas", w: { "iPhone 17": 2, "iPhone 16": 2, "iPhone 15": 2, "iPhone 17 Air": 1 } },
          { label: "Gaming y redes", sub: "Juegos pesados y mucha pantalla", w: { "iPhone 17 Pro": 2, "iPhone 17 Pro Max": 2, "iPhone 17": 2, "iPhone 16": 1 } },
          { label: "Uso básico", sub: "WhatsApp, llamadas, redes ligeras", w: { "iPhone 13": 3, "iPhone 14": 3, "iPhone 15": 1 } }
        ]
      },
      {
        key: "presupuesto", q: "¿Qué presupuesto tenés en mente?",
        opts: [
          { label: "Económico", sub: "El mejor iPhone al menor precio", w: { "iPhone 13": 3, "iPhone 14": 2, "iPhone 15": 1 } },
          { label: "Medio", sub: "Equilibrio entre precio y prestaciones", w: { "iPhone 15": 2, "iPhone 16": 2, "iPhone 14": 1 } },
          { label: "Alto", sub: "Última generación sin ir al tope", w: { "iPhone 17": 2, "iPhone 17 Air": 2, "iPhone 16": 1 } },
          { label: "Sin techo", sub: "Quiero lo mejor que exista", w: { "iPhone 17 Pro Max": 3, "iPhone 17 Pro": 3, "iPhone 17 Air": 1 } }
        ]
      },
      {
        key: "tamano", q: "¿Qué tamaño de pantalla preferís?",
        opts: [
          { label: "Compacto", sub: "Cómodo con una mano", w: { "iPhone 13": 1, "iPhone 14": 1, "iPhone 15": 1, "iPhone 16": 1, "iPhone 17": 1, "iPhone 17 Pro": 1, "iPhone 17 Air": -1, "iPhone 17 Pro Max": -2 } },
          { label: "Grande", sub: "Cuanta más pantalla, mejor", w: { "iPhone 17 Pro Max": 3, "iPhone 17 Air": 2 } },
          { label: "Me es indiferente", sub: "Me adapto a cualquiera", w: {} }
        ]
      },
      {
        key: "actual", q: "¿De qué equipo venís?",
        opts: [
          { label: "No tengo iPhone", sub: "Sería mi primero", w: { "iPhone 13": 1, "iPhone 14": 1, "iPhone 15": 1, "iPhone 16": 1 } },
          { label: "iPhone 12 o anterior", sub: "Salto grande de generación", w: { "iPhone 15": 1, "iPhone 16": 1, "iPhone 17": 1 } },
          { label: "iPhone 13 o 14", sub: "Busco un upgrade que se note", w: { "iPhone 16": 2, "iPhone 17": 2, "iPhone 17 Air": 1, "iPhone 17 Pro": 1, "iPhone 13": -2, "iPhone 14": -2 } },
          { label: "iPhone 15 o 16", sub: "Solo me conviene lo último", w: { "iPhone 17": 2, "iPhone 17 Air": 2, "iPhone 17 Pro": 2, "iPhone 17 Pro Max": 2, "iPhone 15": -2, "iPhone 16": -2 } }
        ]
      }
    ];

    var step = 0;
    var answers = {};
    var started = false;

    /* Tracking de inicio cuando el quiz entra en pantalla por primera vez */
    if ("IntersectionObserver" in window) {
      var qio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !started) {
            started = true;
            icTrack("quiz", { accion: "inicio" });
            qio.disconnect();
          }
        });
      }, { threshold: 0.35 });
      qio.observe(widget);
    }

    function renderStep() {
      resultEl.hidden = true;
      body.hidden = false;
      progress.hidden = false;
      stepLabel.hidden = false;
      var q = QUESTIONS[step];
      stepLabel.textContent = "Pregunta " + (step + 1) + " de " + QUESTIONS.length;
      progress.setAttribute("aria-valuenow", String(step + 1));
      bar.style.width = ((step + 1) / QUESTIONS.length * 100) + "%";
      body.innerHTML = '<p class="quiz-q">' + q.q + '</p>' +
        '<div class="quiz-opts" role="radiogroup" aria-label="' + q.q + '">' +
        q.opts.map(function (o, i) {
          return '<button type="button" class="quiz-opt" data-idx="' + i + '" role="radio" aria-checked="false">' +
            o.label + '<span class="quiz-opt-sub">' + o.sub + "</span></button>";
        }).join("") + "</div>";
      var first = body.querySelector(".quiz-opt");
      if (first && step > 0) first.focus({ preventScroll: true });
    }

    var advancing = false;
    body.addEventListener("click", function (e) {
      var btn = e.target.closest(".quiz-opt");
      if (!btn || advancing) return;
      advancing = true;
      setTimeout(function () { advancing = false; }, 350);
      var q = QUESTIONS[step];
      var opt = q.opts[parseInt(btn.getAttribute("data-idx"), 10)];
      answers[q.key] = opt.label;
      if (!started) { started = true; icTrack("quiz", { accion: "inicio" }); }
      if (step < QUESTIONS.length - 1) {
        step++;
        renderStep();
      } else {
        icTrack("quiz", { accion: "completo", respuestas: answers });
        renderResult();
      }
    });

    function computeScores() {
      var scores = {};
      QUIZ_MODELS.forEach(function (m) { scores[m] = 0; });
      QUESTIONS.forEach(function (q) {
        var opt = q.opts.filter(function (o) { return o.label === answers[q.key]; })[0];
        if (!opt) return;
        Object.keys(opt.w).forEach(function (m) { scores[m] += opt.w[m]; });
      });
      return scores;
    }

    function buildReasons(best) {
      var uso = answers.uso || "";
      var presu = answers.presupuesto || "";
      var tam = answers.tamano || "";
      var isPro = best.indexOf("Pro") !== -1;
      var reasons = [];
      if (uso.indexOf("Fotos") === 0) {
        reasons.push(isPro ? "Sistema de cámaras Pro con teleobjetivo: el mejor para fotos y video." : "Cámara de 48 MP más que suficiente para fotos y video de nivel alto.");
      } else if (uso.indexOf("Trabajo") === 0) {
        reasons.push("Chip actual y gran autonomía: rinde parejo para trabajo y estudio todo el día.");
      } else if (uso.indexOf("Gaming") === 0) {
        reasons.push("Pantalla ProMotion de 120 Hz y chip de última generación: ideal para gaming y redes.");
      } else {
        reasons.push("Cumple sobrado para el día a día sin pagar de más por prestaciones que no vas a usar.");
      }
      if (presu === "Económico") reasons.push("Es la opción más accesible del catálogo sin resignar experiencia iPhone.");
      else if (presu === "Medio") reasons.push("Gran equilibrio precio/prestaciones dentro de tu rango.");
      else if (presu === "Alto") reasons.push("Última generación completa, dentro de un presupuesto alto.");
      else reasons.push("Es el tope de gama: acorde a un presupuesto sin techo.");
      if (tam === "Grande") reasons.push("Su pantalla grande es justo lo que buscás.");
      else if (tam === "Compacto") reasons.push("Formato cómodo para usar con una mano.");
      else reasons.push("Tamaño versátil que se adapta a cualquier uso.");
      return reasons.slice(0, 3);
    }

    function mockHtml(name) {
      return '<div class="prod-mock"><div class="prod-phone" style="background:' + QUIZ_GRADS[name] + '">' +
        '<div class="prod-island" aria-hidden="true"></div>' +
        '<span class="prod-badge">' + name.replace("iPhone ", "") + "</span></div></div>";
    }

    function renderResult() {
      var scores = computeScores();
      var ranked = QUIZ_MODELS.slice().sort(function (a, b) { return scores[b] - scores[a]; });
      var best = ranked[0];
      var alt = ranked[1];
      icTrack("quiz", { accion: "resultado", modelo: best, alternativa: alt, respuestas: answers });
      icLead("quiz", {
        message: "Hola iPhone Culture! Hice el quiz de la web y me recomendó el " + best + ". ¿Me pasan precio y disponibilidad?",
        model: best
      });

      body.hidden = true;
      progress.hidden = true;
      stepLabel.hidden = true;
      resultEl.hidden = false;
      resultEl.innerHTML =
        '<span class="quiz-result-tag">Tu iPhone ideal</span>' +
        mockHtml(best) +
        '<p class="quiz-result-name">' + best + "</p>" +
        '<p class="quiz-result-alt">Alternativa: <strong>' + alt + "</strong></p>" +
        '<ul class="quiz-reasons">' + buildReasons(best).map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>" +
        '<div class="quiz-result-ctas">' +
          '<a class="btn btn-wa btn-lg" target="_blank" rel="noopener" href="' +
            waLink("Hola iPhone Culture! Hice el quiz de la web y me recomendó el " + best + ". ¿Me pasan precio y disponibilidad?") +
            '">Consultar precio del ' + best + '</a>' +
          '<button type="button" class="btn btn-outline" id="quizGoCompare">Ver comparación con el ' + alt + "</button>" +
          '<button type="button" class="btn btn-ghost" id="quizGoCalc">Calcular cuotas del ' + best + "</button>" +
        "</div>" +
        '<button type="button" class="quiz-restart" id="quizRestart">↺ Reiniciar quiz</button>';

      document.getElementById("quizRestart").addEventListener("click", function () {
        step = 0;
        answers = {};
        renderStep();
      });
      document.getElementById("quizGoCompare").addEventListener("click", function () {
        var selA = document.getElementById("cmpA");
        var selB = document.getElementById("cmpB");
        if (selA && selB && CMP_INDEX[best] !== undefined && CMP_INDEX[alt] !== undefined) {
          selA.value = String(CMP_INDEX[best]);
          selB.value = String(CMP_INDEX[alt]);
          selA.dispatchEvent(new Event("change"));
        }
        var sec = document.getElementById("comparador");
        if (sec) sec.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      });
      document.getElementById("quizGoCalc").addEventListener("click", function () {
        var sel = document.getElementById("calcModelo");
        if (sel) {
          sel.value = best;
          sel.dispatchEvent(new Event("change"));
        }
        var sec = document.getElementById("calculadora");
        if (sec) sec.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      });
      resultEl.focus && resultEl.setAttribute("tabindex", "-1");
      resultEl.focus({ preventScroll: true });
    }

    renderStep();
  })();

  /* ---------- Calculadora: precio + canje + cuotas ---------- */
  (function calculadoraModule() {
    var selModelo = document.getElementById("calcModelo");
    if (!selModelo) return;
    var capsEl = document.getElementById("calcCaps");
    var toggleEl = document.getElementById("calcTradeToggle");
    var tradeFields = document.getElementById("calcTradeFields");
    var selCat = document.getElementById("calcTradeCat");
    var selTradeModel = document.getElementById("calcTradeModel");
    var estadoEl = document.getElementById("calcEstado");
    var outLista = document.getElementById("calcLista");
    var outCanje = document.getElementById("calcCanje");
    var outFinal = document.getElementById("calcFinal");
    var outCuota = document.getElementById("calcCuota");
    var outAlt = document.getElementById("calcAlt");
    var waBtn = document.getElementById("calcWa");

    /* ==================== ACTUALIZAR PRECIOS ==================== */
    /* Precios base referenciales en ARS (mercado argentino, ago-2026). */
    var PRECIOS_BASE_ARS = {
      "iPhone 13": 550000,
      "iPhone 14": 650000,
      "iPhone 15": 800000,
      "iPhone 16": 1050000,
      "iPhone 17": 1300000,
      "iPhone 17 Air": 1500000,
      "iPhone 17 Pro": 1700000,
      "iPhone 17 Pro Max": 2000000
    };
    /* Capacidad: multiplicador sobre el precio base. 17 Pro Max parte de 256 GB. */
    var CAPACIDADES = [
      { gb: 128, mult: 1 },
      { gb: 256, mult: 1.15 },
      { gb: 512, mult: 1.30 }
    ];
    var MIN_GB = { "iPhone 17 Pro Max": 256 };
    var CUOTAS_CANT = 12;              /* cantidad de cuotas fijas */
    var TC_USD = 1400;                 /* tipo de cambio referencial ARS/USD */
    var ESTADO_MULT = { excelente: 1.15, bueno: 1, regular: 0.7 };
    /* Valores estimados de canje en ARS para estado "bueno". */
    var CANJE_VALORES = {
      iphone: { label: "iPhone", modelos: [
        { label: "iPhone 15 / 16", valor: 400000 },
        { label: "iPhone 14", valor: 300000 },
        { label: "iPhone 13", valor: 250000 },
        { label: "iPhone 12 o anterior", valor: 150000 }
      ] },
      mac: { label: "Mac", modelos: [
        { label: "MacBook M3 / M4", valor: 800000 },
        { label: "MacBook M1 / M2", valor: 500000 }
      ] },
      ipad: { label: "iPad", modelos: [
        { label: "iPad Pro / Air reciente", valor: 350000 },
        { label: "iPad estándar / mini", valor: 200000 }
      ] },
      watch: { label: "Apple Watch", modelos: [
        { label: "Watch Ultra / Ultra 2", valor: 250000 },
        { label: "Watch Series 9 / 10", valor: 150000 }
      ] },
      samsung: { label: "Samsung", modelos: [
        { label: "Galaxy Z Fold / Flip reciente", valor: 400000 },
        { label: "Galaxy S Ultra (S23 o posterior)", valor: 350000 }
      ] }
    };
    /* =========================================================== */

    var fmtARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
    var fmtUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

    var state = { modelo: "iPhone 17", gb: 128, trade: false, cat: "iphone", tradeIdx: 0, estado: "bueno" };

    Object.keys(PRECIOS_BASE_ARS).forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      o.textContent = m + " — desde " + fmtARS.format(PRECIOS_BASE_ARS[m]);
      selModelo.appendChild(o);
    });
    selModelo.value = state.modelo;

    Object.keys(CANJE_VALORES).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = CANJE_VALORES[k].label;
      selCat.appendChild(o);
    });

    function renderCaps() {
      capsEl.innerHTML = "";
      var minGb = MIN_GB[state.modelo] || 128;
      var firstEnabled = null;
      CAPACIDADES.forEach(function (c) {
        if (c.gb < minGb) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = c.gb + " GB";
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("data-gb", String(c.gb));
        capsEl.appendChild(b);
        if (!firstEnabled) firstEnabled = c.gb;
      });
      if (state.gb < minGb || !capsEl.querySelector('[data-gb="' + state.gb + '"]')) {
        state.gb = firstEnabled;
      }
      var active = capsEl.querySelector('[data-gb="' + state.gb + '"]');
      if (active) { active.classList.add("active"); active.setAttribute("aria-pressed", "true"); }
    }

    function renderTradeModels() {
      selTradeModel.innerHTML = "";
      var catObj = CANJE_VALORES[state.cat] || CANJE_VALORES.iphone;
      catObj.modelos.forEach(function (m, i) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = m.label + " (≈ " + fmtARS.format(m.valor) + " en buen estado)";
        selTradeModel.appendChild(o);
      });
      if (state.tradeIdx >= catObj.modelos.length) state.tradeIdx = 0;
      selTradeModel.value = String(state.tradeIdx);
    }

    function bindSingleRow(row, cb) {
      if (!row) return;
      row.addEventListener("click", function (e) {
        var btn = e.target.closest(".chip");
        if (!btn) return;
        row.querySelectorAll(".chip").forEach(function (c) {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        cb(btn);
      });
    }

    function compute() {
      var cap = CAPACIDADES.filter(function (c) { return c.gb === state.gb; })[0] || CAPACIDADES[0];
      var base = PRECIOS_BASE_ARS[state.modelo] || PRECIOS_BASE_ARS["iPhone 17"];
      var lista = Math.round(base * cap.mult / 1000) * 1000;
      var canje = 0;
      var canjeTxt = "Sin canje";
      if (state.trade) {
        var catObj = CANJE_VALORES[state.cat] || CANJE_VALORES.iphone;
        var m = catObj.modelos[state.tradeIdx] || catObj.modelos[0];
        canje = Math.round(m.valor * (ESTADO_MULT[state.estado] || 1) / 1000) * 1000;
        canjeTxt = catObj.label + " " + m.label + " (" + state.estado + ")";
      }
      var finalP = Math.max(lista - canje, 0);
      var cuota = Math.round(finalP / CUOTAS_CANT);
      if (!isFinite(lista) || !isFinite(canje) || !isFinite(finalP) || !isFinite(cuota)) {
        return { lista: base, canje: 0, canjeTxt: "Sin canje", finalP: base, cuota: Math.round(base / CUOTAS_CANT) };
      }
      return { lista: lista, canje: canje, canjeTxt: canjeTxt, finalP: finalP, cuota: cuota };
    }

    function update() {
      var r = compute();
      outLista.textContent = fmtARS.format(r.lista);
      outCanje.textContent = r.canje ? "− " + fmtARS.format(r.canje) : "—";
      outFinal.textContent = fmtARS.format(r.finalP);
      outCuota.textContent = fmtARS.format(r.cuota) + "/mes";
      outAlt.textContent = "Efectivo / transferencia: " + fmtARS.format(r.finalP) +
        " · ≈ " + fmtUSD.format(r.finalP / TC_USD);
      var msg = "Hola iPhone Culture! Usé la calculadora de cuotas de la web y quiero este plan:\n" +
        "• Modelo: " + state.modelo + " " + state.gb + " GB\n" +
        "• Canje: " + r.canjeTxt + "\n" +
        "• Precio final estimado: " + fmtARS.format(r.finalP) + "\n" +
        "• Cuota estimada: " + CUOTAS_CANT + " cuotas fijas de " + fmtARS.format(r.cuota) + "\n" +
        "¿Me confirman precio del día y disponibilidad?";
      waBtn.setAttribute("href", waLink(msg));
      lastMsg = msg;
    }
    var lastMsg = "";

    selModelo.addEventListener("change", function () {
      state.modelo = selModelo.value;
      renderCaps();
      update();
    });
    bindSingleRow(capsEl, function (btn) {
      state.gb = parseInt(btn.getAttribute("data-gb"), 10);
      update();
    });
    bindSingleRow(toggleEl, function (btn) {
      state.trade = btn.getAttribute("data-value") === "si";
      tradeFields.hidden = !state.trade;
      update();
    });
    selCat.addEventListener("change", function () {
      state.cat = selCat.value;
      state.tradeIdx = 0;
      renderTradeModels();
      update();
    });
    selTradeModel.addEventListener("change", function () {
      state.tradeIdx = parseInt(selTradeModel.value, 10) || 0;
      update();
    });
    bindSingleRow(estadoEl, function (btn) {
      state.estado = btn.getAttribute("data-value") || "bueno";
      update();
    });

    waBtn.addEventListener("click", function () {
      var r = compute();
      icTrack("calculadora", {
        modelo: state.modelo, capacidad_gb: state.gb,
        canje: state.trade ? r.canjeTxt : "no",
        precio_lista: r.lista, descuento_canje: r.canje,
        precio_final: r.finalP, cuota: r.cuota, cuotas: CUOTAS_CANT
      });
      icLead("calculadora", { message: lastMsg || "Consulta desde la calculadora de cuotas", model: state.modelo + " " + state.gb + " GB" });
    });

    renderCaps();
    renderTradeModels();
    update();
  })();

  /* ---------- Smooth scroll fallback for older browsers ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (id && id.length > 1) {
        var target = null;
        try { target = document.getElementById(id.slice(1)); } catch (err) { /* selector inválido */ }
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
        }
      }
    });
  });
})();
