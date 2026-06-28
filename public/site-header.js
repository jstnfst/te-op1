/* ====================================================================
   OP-1 Field — shared site header + footer
   Single source of truth for the global navigation. Every page (the
   React SPA and the static reference pages) renders the header from
   here, so changing a destination, the firmware tag, or the footer is
   a one-file edit.

   A page opts in with two placeholders and this script:
     <div data-site-header></div>   ... <div data-site-footer></div>
     <script src="/site-header.js" defer></script>
   Static pages set the active tab via <body data-section="mappings">;
   SPA routes are detected from the URL.
   ==================================================================== */
(function () {
  "use strict";

  var FW = "1.7.3";
  var REPO = "https://github.com/jstnfst/te-op1";

  // The whole site map, in nav order. Edit here to change every page.
  var NAV = [
    { label: "HOME",       href: "/",             section: "home" },
    { label: "LAYOUT",     href: "/params.html",  section: "layout" },
    { label: "MAPPINGS",   href: "/display.html", section: "mappings" },
    { label: "PATCH",      href: "/patch.html",   section: "patch" },
    { label: "BROWSE",     href: "/browse",       section: "browse" },
    { label: "UPLOAD",     href: "/upload",       section: "upload" },
    { label: "MY PATCHES", href: "/me",           section: "mypatches" }
  ];

  var SUBTITLE = {
    home: "preset library", layout: "knob layout", mappings: "value mappings",
    patch: "patch", browse: "library", upload: "upload", mypatches: "my patches",
    login: "account"
  };

  function sectionFromPath(path) {
    if (path.indexOf("/params.html") === 0) return "layout";
    if (path.indexOf("/display.html") === 0) return "mappings";
    if (path.indexOf("/patch.html") === 0) return "patch";
    if (path.indexOf("/browse") === 0) return "browse";
    if (path.indexOf("/upload") === 0) return "upload";
    if (path.indexOf("/me") === 0) return "mypatches";
    if (path.indexOf("/login") === 0) return "login";
    return "home";
  }

  function currentSection() {
    if (document.body && document.body.dataset && document.body.dataset.section) {
      return document.body.dataset.section;
    }
    return sectionFromPath(location.pathname);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function navHTML(section) {
    return NAV.map(function (i) {
      return '<a href="' + i.href + '" class="nav-btn' +
        (i.section === section ? " active" : "") + '">' + i.label + "</a>";
    }).join("");
  }

  function headerHTML(section) {
    return (
      '<header class="site">' +
        '<div class="header-row">' +
          '<a href="/" class="site-title">OP-1 FIELD</a>' +
          '<span class="site-sep">//</span>' +
          '<span class="site-sub">' + esc(SUBTITLE[section] || SUBTITLE.home) + "</span>" +
          '<span class="header-spacer"></span>' +
          '<span class="fw-tag">fw ' + esc(FW) + "</span>" +
          '<span class="auth-mini" data-auth></span>' +
        "</div>" +
        '<nav class="page-nav" aria-label="Site navigation">' + navHTML(section) + "</nav>" +
      "</header>"
    );
  }

  function footerHTML() {
    return '<footer class="site">OP-1 Field firmware&nbsp;' + esc(FW) +
      ' &middot; <a href="' + REPO + '">github.com/jstnfst/te-op1</a></footer>';
  }

  function renderAuth(el) {
    if (!el) return;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : { user: null }; })
      .then(function (d) {
        var u = d && d.user;
        el.innerHTML = u
          ? (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : "") +
            "<span>" + esc(u.name || u.email || "account") + "</span>" +
            '<a href="/api/auth/logout">log out</a>'
          : '<a href="/login">log in</a>';
      })
      .catch(function () { el.innerHTML = '<a href="/login">log in</a>'; });
  }

  function mount() {
    var section = currentSection();
    var head = document.querySelector("[data-site-header]");
    if (head) head.innerHTML = headerHTML(section);
    var foot = document.querySelector("[data-site-footer]");
    if (foot) foot.innerHTML = footerHTML();
    renderAuth(document.querySelector("[data-auth]"));
  }

  // Keep the active tab + subtitle correct when the SPA navigates client-side.
  function refreshActive() {
    var section = currentSection();
    var subEl = document.querySelector(".site-sub");
    if (subEl) subEl.textContent = SUBTITLE[section] || SUBTITLE.home;
    var btns = document.querySelectorAll(".page-nav .nav-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", NAV[i] && NAV[i].section === section);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      window.dispatchEvent(new Event("site:locationchange"));
      return r;
    };
  });
  window.addEventListener("popstate", refreshActive);
  window.addEventListener("site:locationchange", refreshActive);
})();
