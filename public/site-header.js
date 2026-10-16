/* ====================================================================
   OP-1 Field - shared site header + footer
   Single source of truth for the global navigation. Every page (the
   React SPA and the static reference pages) renders the header from
   here, so changing a destination, the firmware tag, or the footer is
   a one-file edit.

   The site has two paths, and the header is built around them:
     LIBRARY - the community patch library (browse, packs, upload...)
     LAB     - the preset-format reference (layout, mappings, inspector)
   The header row carries a LIBRARY | LAB switch; the second row is the
   sub-nav for whichever group the current page belongs to. The landing
   page (/) belongs to neither, so it shows the switch only.

   A page opts in with two placeholders and this script:
     <div data-site-header></div>   ... <div data-site-footer></div>
     <script src="/site-header.js" defer></script>
   Static pages set their section via <body data-section="mappings">;
   SPA routes are detected from the URL.
   ==================================================================== */
(function () {
  "use strict";

  var FW = "1.7.3";
  var REPO = "https://github.com/jstnfst/te-op1";

  var GROUPS = {
    library: { label: "LIBRARY", href: "/library" },
    lab:     { label: "LAB",     href: "/lab" }
  };

  // Sub-nav per group. `auth: true` items need a session; `github: true`
  // items need a GitHub-provider session (issues are filed as the viewer's
  // own GitHub account, see functions/api/issues).
  var SUBNAV = {
    library: [
      { label: "BROWSE",  href: "/library",        section: "browse" },
      { label: "PACKS",   href: "/library/packs",  section: "packs" },
      { label: "FAVES",   href: "/library/faves",  section: "faves", auth: true },
      { label: "MINE",    href: "/library/mine",   section: "mine",  auth: true },
      { label: "UPLOAD",  href: "/library/upload", section: "upload" }
    ],
    lab: [
      { label: "LAYOUT",    href: "/lab/layout",    section: "layout" },
      { label: "MAPPINGS",  href: "/lab/mappings",  section: "mappings" },
      { label: "INSPECTOR", href: "/lab/inspector", section: "inspector" },
      { label: "ISSUES",    href: "/issues",        section: "issues", github: true }
    ]
  };

  // Static pages declare body[data-section]; map those onto the groups.
  // The patch viewer serves both paths: opened on a library patch (?id=)
  // it belongs to LIBRARY, opened bare it is the LAB inspector.
  function fromStatic(section) {
    if (section === "layout") return { group: "lab", section: "layout" };
    if (section === "mappings") return { group: "lab", section: "mappings" };
    if (section === "patch") {
      return /[?&]id=/.test(location.search)
        ? { group: "library", section: "patch" }
        : { group: "lab", section: "inspector" };
    }
    return null;
  }

  function fromPath(path) {
    if (path.indexOf("/library/packs") === 0 || path.indexOf("/packs") === 0) return { group: "library", section: "packs" };
    if (path.indexOf("/library/faves") === 0 || path.indexOf("/favorites") === 0) return { group: "library", section: "faves" };
    if (path.indexOf("/library/mine") === 0 || path.indexOf("/me") === 0) return { group: "library", section: "mine" };
    if (path.indexOf("/library/upload") === 0 || path.indexOf("/upload") === 0) return { group: "library", section: "upload" };
    // Old /patches + /browse URLs redirect client-side to /library (src/App.tsx);
    // map them here too so the header doesn't flash the wrong state first.
    if (path.indexOf("/library") === 0 || path.indexOf("/patches") === 0 || path.indexOf("/browse") === 0) return { group: "library", section: "browse" };
    if (path.indexOf("/lab/layout") === 0 || path.indexOf("/params") === 0) return { group: "lab", section: "layout" };
    if (path.indexOf("/lab/mappings") === 0 || path.indexOf("/display") === 0) return { group: "lab", section: "mappings" };
    if (path.indexOf("/lab/inspector") === 0) return fromStatic("patch");
    if (path.indexOf("/lab") === 0) return { group: "lab", section: "lab" };
    if (path.indexOf("/issues") === 0) return { group: "lab", section: "issues" };
    if (path.indexOf("/mod") === 0) return { group: null, section: "mod" };
    if (path.indexOf("/login") === 0) return { group: null, section: "login" };
    return { group: null, section: "home" };
  }

  function current() {
    var ds = document.body && document.body.dataset && document.body.dataset.section;
    return (ds && fromStatic(ds)) || fromPath(location.pathname);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function loginHref() {
    var here = location.pathname + location.search;
    return here === "/" || here.indexOf("/login") === 0 ? "/login" : "/login?next=" + encodeURIComponent(here);
  }

  function groupSwitchHTML(loc) {
    return '<nav class="group-switch" aria-label="Site sections">' +
      Object.keys(GROUPS).map(function (k) {
        var g = GROUPS[k];
        return '<a href="' + g.href + '" class="group-btn group-' + k + (loc.group === k ? " active" : "") +
          '" data-group="' + k + '"' + (loc.group === k ? ' aria-current="true"' : "") + ">" + g.label + "</a>";
      }).join("") +
    "</nav>";
  }

  function subnavHTML(loc, user) {
    if (!loc.group) return "";
    var items = SUBNAV[loc.group].filter(function (i) {
      if (i.auth && !user) return false;
      if (i.github && !(user && user.provider === "github")) return false;
      return true;
    });
    return items.map(function (i) {
      var active = i.section === loc.section;
      return '<a href="' + i.href + '" class="nav-btn' + (active ? " active" : "") +
        '" data-section="' + i.section + '"' + (active ? ' aria-current="page"' : "") + ">" + i.label + "</a>";
    }).join("");
  }

  function headerHTML(loc) {
    return (
      '<header class="site">' +
        '<div class="header-row">' +
          '<a href="/" class="site-title">OP-1 FIELD</a>' +
          '<span class="site-sep">//</span>' +
          '<span data-group-switch>' + groupSwitchHTML(loc) + "</span>" +
          '<span class="header-spacer"></span>' +
          '<span class="fw-tag">fw ' + esc(FW) + "</span>" +
          '<span class="auth-mini" data-auth></span>' +
        "</div>" +
        '<nav class="page-nav" aria-label="Section navigation" data-subnav' + (loc.group ? "" : " hidden") + "></nav>" +
      "</header>"
    );
  }

  function footerHTML() {
    return '<footer class="site">OP-1 Field firmware&nbsp;' + esc(FW) +
      ' &middot; <a href="' + REPO + '">github.com/jstnfst/te-op1</a></footer>';
  }

  // undefined until /api/auth/me answers, so the first paint shows only the
  // public sub-nav items and never flashes gated links.
  var authUser;

  function render() {
    var loc = current();
    var sw = document.querySelector("[data-group-switch]");
    if (sw) sw.innerHTML = groupSwitchHTML(loc);
    var sub = document.querySelector("[data-subnav]");
    if (sub) {
      sub.innerHTML = subnavHTML(loc, authUser || null);
      sub.hidden = !loc.group;
    }
    var el = document.querySelector("[data-auth]");
    if (el && authUser !== undefined) {
      el.innerHTML = authUser
        ? (authUser.isAdmin ? '<a href="/mod" class="mod-link' + (loc.section === "mod" ? " active" : "") + '">mod</a>' : "") +
          (authUser.avatar ? '<img src="' + esc(authUser.avatar) + '" alt="">' : "") +
          "<span>" + esc(authUser.name || authUser.email || "account") + "</span>" +
          '<a href="/api/auth/logout">log out</a>'
        : '<a href="' + esc(loginHref()) + '">log in</a>';
    }
  }

  function loadAuth() {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : { user: null }; })
      .then(function (d) { authUser = (d && d.user) || null; render(); })
      .catch(function () { authUser = null; render(); });
  }

  function mount() {
    var head = document.querySelector("[data-site-header]");
    if (head) head.innerHTML = headerHTML(current());
    var foot = document.querySelector("[data-site-footer]");
    if (foot) foot.innerHTML = footerHTML();
    render();
    loadAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // Keep the active group + tab correct when the SPA navigates client-side.
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      window.dispatchEvent(new Event("site:locationchange"));
      return r;
    };
  });
  window.addEventListener("popstate", render);
  window.addEventListener("site:locationchange", render);
})();
