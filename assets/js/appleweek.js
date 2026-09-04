/* iPhone Culture — Apple Week (7-12 sept 2026): banner countdown + modal + carruseles */
(function () {
  "use strict";

  var AW_END = new Date("2026-09-12T23:59:59-03:00").getTime();

  /* ---------- Countdown ---------- */
  var d = document.getElementById("awD"),
      h = document.getElementById("awH"),
      m = document.getElementById("awM"),
      s = document.getElementById("awS");

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function tick() {
    var left = AW_END - Date.now();
    if (left <= 0) {
      if (d) { d.textContent = "0"; h.textContent = "00"; m.textContent = "00"; s.textContent = "00"; }
      clearInterval(timer);
      return;
    }
    var sec = Math.floor(left / 1000);
    if (d) {
      d.textContent = Math.floor(sec / 86400);
      h.textContent = pad(Math.floor((sec % 86400) / 3600));
      m.textContent = pad(Math.floor((sec % 3600) / 60));
      s.textContent = pad(sec % 60);
    }
  }
  var timer = setInterval(tick, 1000);
  tick();

  /* ---------- Carrusel (sirve para banner y modal) ---------- */
  function initCarousel(root) {
    if (!root) return;
    var slides = root.querySelectorAll(".aw-slide");
    if (slides.length < 2) return;
    var i = 0;
    setInterval(function () {
      slides[i].classList.remove("active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("active");
      var dots = root.querySelectorAll(".aw-dot");
      dots.forEach(function (dot, j) { dot.classList.toggle("active", j === i); });
    }, 4000);
  }

  /* Dots del carrusel del banner */
  var bannerCar = document.getElementById("awCarousel");
  var dotsBox = document.getElementById("awDots");
  if (bannerCar && dotsBox) {
    var slides = bannerCar.querySelectorAll(".aw-slide");
    slides.forEach(function (slide, j) {
      var dot = document.createElement("button");
      dot.className = "aw-dot" + (j === 0 ? " active" : "");
      dot.setAttribute("aria-label", "Ver imagen " + (j + 1));
      dot.addEventListener("click", function () {
        bannerCar.querySelectorAll(".aw-slide").forEach(function (sl, k) {
          sl.classList.toggle("active", k === j);
        });
        dotsBox.querySelectorAll(".aw-dot").forEach(function (dt, k) {
          dt.classList.toggle("active", k === j);
        });
      });
      dotsBox.appendChild(dot);
    });
  }
  initCarousel(bannerCar);
  initCarousel(document.getElementById("awModalCarousel"));

  /* ---------- Modal primera visita de la sesión ---------- */
  var modal = document.getElementById("awModal");
  var closeBtn = document.getElementById("awClose");
  if (!modal) return;

  /* Evento vencido: no mostrar más */
  if (Date.now() > AW_END) return;

  var seen = false;
  try { seen = sessionStorage.getItem("aw_seen") === "1"; } catch (e) { /* noop */ }

  function close() {
    modal.classList.remove("open");
    setTimeout(function () { modal.hidden = true; }, 250);
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e) { if (e.key === "Escape") close(); }

  if (!seen) {
    setTimeout(function () {
      modal.hidden = false;
      /* fuerza reflow para la transición */
      void modal.offsetWidth;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onEsc);
      try { sessionStorage.setItem("aw_seen", "1"); } catch (e) { /* noop */ }
    }, 1200);
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) close();
  });
})();
