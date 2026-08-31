/* Quita la clase no-js lo antes posible (antes era inline en index.html; movido por CSP). */
document.documentElement.className = document.documentElement.className.replace("no-js", "js");
