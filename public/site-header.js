/* ====================================================================
   OP-1 Field - shared site header + footer
   Single source of truth for the global navigation. Every page (the
   React SPA and the static reference pages) renders the header from
   here, so changing a destination, the firmware tag, or the footer is
   a one-file edit.

   The nav has two groups: REFERENCE (the public format docs) and
   LIBRARY (the community patches, which require sign-in). The Library
   group is injected only when a session exists; logged-out visitors see
   a single "Log in to browse" call-to-action in its place.

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

  // Public format reference. Edit here to change every page.
  var REFERENCE = [
    { label: "LAYOUT",   href: "/params.html",  section: "layout" },
    { label: "MAPPINGS", href: "/display.html", section: "mappings" },
    { label: "PATCH",    href: "/patch.html",   section: "patch" }
  ];
  // Community library - shown only when signed in.
  var LIBRARY = [
    { label: "BROWSE",     href: "/browse", section: "browse" },
    { label: "UPLOAD",     href: "/upload", section: "upload" },
    { label: "MY PATCHES", href: "/me",     section: "mypatches" },
    { label: "PACKS",      href: "/packs",  section: "packs" }
  ];

  var SUBTITLE = {
    home: "preset library", layout: "knob layout", mappings: "value mappings",
    patch: "patch", browse: "library", upload: "upload", mypatches: "my patches",
    packs: "packs", login: "account"
  };

  function sectionFromPath(path) {
    if (path.indexOf("/params.html") === 0) return "layout";
    if (path.indexOf("/display.html") === 0) return "mappings";
    if (path.indexOf("/patch.html") === 0) return "patch";
    if (path.indexOf("/browse") === 0) return "browse";
    if (path.indexOf("/upload") === 0) return "upload";
    if (path.indexOf("/me") === 0) return "mypatches";
    if (path.indexOf("/packs") === 0) return "packs";
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

  function navBtn(item, section) {
    return '<a href="' + item.href + '" class="nav-btn' +
      (item.section === section ? " active" : "") +
      '" data-section="' + item.section + '">' + item.label + "</a>";
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
        '<nav class="page-nav" aria-label="Site navigation">' +
          REFERENCE.map(function (i) { return navBtn(i, section); }).join("") +
          '<span data-nav-library></span>' +
        "</nav>" +
      "</header>"
    );
  }

  function footerHTML() {
    return '<footer class="site">OP-1 Field firmware&nbsp;' + esc(FW) +
      ' &middot; <a href="' + REPO + '">github.com/jstnfst/te-op1</a></footer>';
  }

  // Fill the Library slot based on auth: the group when signed in, otherwise a
  // single call-to-action. Rendered after /api/auth/me so logged-out visitors
  // never see (or flash) gated links.
  function fillLibrary(user, section) {
    var slot = document.querySelector("[data-nav-library]");
    if (!slot) return;
    var sep = '<span class="nav-sep" aria-hidden="true">&middot;</span>';
    slot.innerHTML = user
      ? sep + LIBRARY.map(function (i) { return navBtn(i, section); }).join("")
      : sep + '<a href="/login" class="nav-btn cta" data-section="">Log in to browse &rarr;</a>';
  }

  function applyAuth(user) {
    var section = currentSection();
    var el = document.querySelector("[data-auth]");
    if (el) {
      el.innerHTML = user
        ? (user.avatar ? '<img src="' + esc(user.avatar) + '" alt="">' : "") +
          "<span>" + esc(user.name || user.email || "account") + "</span>" +
          '<a href="/api/auth/logout">log out</a>'
        : '<a href="/login">log in</a>';
    }
    fillLibrary(user, section);
  }

  function loadAuth() {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : { user: null }; })
      .then(function (d) { applyAuth(d && d.user); })
      .catch(function () { applyAuth(null); });
  }

  function mount() {
    var section = currentSection();
    var head = document.querySelector("[data-site-header]");
    if (head) head.innerHTML = headerHTML(section);
    var foot = document.querySelector("[data-site-footer]");
    if (foot) foot.innerHTML = footerHTML();
    loadAuth();
  }

  // Keep the active tab + subtitle correct when the SPA navigates client-side.
  function refreshActive() {
    var section = currentSection();
    var subEl = document.querySelector(".site-sub");
    if (subEl) subEl.textContent = SUBTITLE[section] || SUBTITLE.home;
    var btns = document.querySelectorAll(".page-nav .nav-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.section === section);
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
