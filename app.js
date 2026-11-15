/* Government Documents citing Social Science Data Infrastructure.
   Static page: loads data/*.json, searches in memory, keeps all state in the URL.
   All text is inserted with textContent / text nodes, never as HTML. */
(function () {
  "use strict";

  var PER_PAGE = 25, SHOW_CITES = 3;
  var SOURCES = ["CBS microdata", "LISS panel", "ODISSEI Grants"];
  var DOCS = [], PUBS = {}, ABOUT = {};
  var state = {};
  var $ = function (id) { return document.getElementById(id); };

  // ---------- helpers ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "on") for (var ev in v) el.addEventListener(ev, v[ev]);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function norm(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/ß/g, "ss").replace(/[’']/g, "");
  }
  function toks(s) { return norm(s).match(/[a-z0-9]+/g) || []; }
  function fmt(n) { return n.toLocaleString("en-GB"); }
  function fmtDate(d) {
    if (!d) return "date unknown";
    var p = d.split("-"), m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return p.length === 3 ? (+p[2]) + " " + m[+p[1] - 1] + " " + p[0] : d;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function link(href, text, newTab) {
    return h("a", newTab ? { href: href, target: "_blank", rel: "noopener noreferrer" } : { href: href }, [text]);
  }
  function pubLink(p) { return p.doi ? "https://doi.org/" + p.doi : (p.u || ""); }

  // ---------- index ----------
  function addTok(map, s, w) {
    toks(s).forEach(function (t) { if (!map.has(t) || map.get(t) < w) map.set(t, w); });
  }
  function prepare() {
    DOCS.forEach(function (d) {
      var m = new Map();
      addTok(m, d.t, 3); addTok(m, d.o, 1); addTok(m, d.ds, 2); addTok(m, d.i, 2); addTok(m, d.ty, 1);
      (d.aka || []).forEach(function (a) { addTok(m, a[0], 1); });
      (d.c || []).forEach(function (c) {
        var p = PUBS[c.id] || {};
        addTok(m, p.t, 2); addTok(m, p.a, 2); addTok(m, p.doi, 2);
        (p.s || []).forEach(function (s) { addTok(m, s, 2); });   // data source labels, e.g. "LISS panel"
      });
      (d.m || []).forEach(function (s) { addTok(m, s, 1); });
      d.m = d.m || []; d.v = d.v || [];
      d._tok = m; d._keys = Array.from(m.keys());
    });
    PUBS_INDEX = {};
    Object.keys(PUBS).forEach(function (id) {
      var p = PUBS[id], m = new Map();
      addTok(m, p.t, 3); addTok(m, p.a, 2); addTok(m, p.doi, 2); addTok(m, p.ve, 1);
      (p.s || []).forEach(function (s) { addTok(m, s, 1); });
      PUBS_INDEX[id] = { tok: m, keys: Array.from(m.keys()) };
    });
  }
  var PUBS_INDEX = {};
  function score(tokMap, keys, qt) {
    // every query token must match a record token exactly or as a prefix; exact counts double
    var total = 0;
    for (var i = 0; i < qt.length; i++) {
      var t = qt[i], best = 0;
      if (tokMap.has(t)) best = tokMap.get(t) * 2;
      else if (t.length >= 2) {
        for (var j = 0; j < keys.length; j++) {
          if (keys[j].length > t.length && keys[j].lastIndexOf(t, 0) === 0) {
            var w = tokMap.get(keys[j]); if (w > best) best = w;
          }
        }
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  // ---------- state <-> URL ----------
  var DEFAULTS = { v: "docs", q: "", src: [], conf: "all", m: true, type: "", org: "", y1: "", y2: "", sort: "new", p: 1 };
  function readURL() {
    var u = new URLSearchParams(location.search);
    state = {
      v: u.get("v") === "pubs" ? "pubs" : "docs",
      q: u.get("q") || "",
      src: (u.get("src") || "").split(",").filter(function (s) { return SOURCES.indexOf(s) >= 0; }),
      conf: u.get("conf") === "strong" ? "strong" : "all",
      m: u.get("m") !== "0",   // data-only mentions are shown unless switched off
      type: u.get("type") || "", org: u.get("org") || "",
      y1: /^\d{4}$/.test(u.get("y1") || "") ? u.get("y1") : "",
      y2: /^\d{4}$/.test(u.get("y2") || "") ? u.get("y2") : "",
      sort: ["new", "old", "cites", "rel"].indexOf(u.get("sort")) >= 0 ? u.get("sort") : "new",
      p: Math.max(1, parseInt(u.get("p") || "1", 10) || 1)
    };
  }
  function writeURL() {
    var u = new URLSearchParams();
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = state[k], d = DEFAULTS[k];
      if (k === "src") { if (v.length) u.set(k, v.join(",")); }
      else if (k === "m") { if (!v) u.set(k, "0"); }
      else if (v !== d && v !== "") u.set(k, v);
    });
    var s = u.toString();
    history.replaceState(null, "", s ? "?" + s : location.pathname);
  }
  function syncControls() {
    $("q").value = state.q;
    document.querySelectorAll("input[name=conf]").forEach(function (r) { r.checked = r.value === state.conf; });
    $("f-mentions").checked = state.m;
    $("f-y1").value = state.y1; $("f-y2").value = state.y2;
    $("sort").value = state.sort;
    ["docs", "pubs"].forEach(function (v) {
      $("tab-" + v).setAttribute("aria-selected", state.v === v ? "true" : "false");
    });
    $("sort").disabled = state.v === "pubs";
  }

  // ---------- filtering ----------
  function visibleCites(d) {
    if (!d.c) return [];
    return state.conf === "strong" ? d.c.filter(function (c) { return c.cf === "s"; }) : d.c;
  }
  function sourcesOf(d, cites) {
    var s = {};
    cites.forEach(function (c) { ((PUBS[c.id] || {}).s || []).forEach(function (x) { s[x] = 1; }); });
    d.m.forEach(function (x) { s[x] = 1; });
    return s;
  }
  // returns null if excluded, else {d, cites, score}
  function evaluate(d, qt, skip) {
    var cites = visibleCites(d);
    if (d.c && !cites.length) return null;               // only probable citations, "strong only" chosen
    if (!d.c && skip !== "m" && !state.m) return null;   // data-only, switch off
    if (skip !== "type" && state.type && d.ty !== state.type) return null;
    if (skip !== "org" && state.org && d.o !== state.org) return null;
    if (state.y1 && (!d.y || d.y < +state.y1)) return null;
    if (state.y2 && (!d.y || d.y > +state.y2)) return null;
    if (skip !== "src" && state.src.length) {
      var s = sourcesOf(d, cites);
      if (!state.src.some(function (x) { return s[x]; })) return null;
    }
    var sc = 1;
    if (qt.length) { sc = score(d._tok, d._keys, qt); if (!sc) return null; }
    return { d: d, cites: cites, score: sc };
  }
  function run() {
    var qt = toks(state.q);
    var hits = [], facet = { src: {}, type: {}, org: {}, m: 0, confStrong: 0, confAll: 0 };
    DOCS.forEach(function (d) {
      var r = evaluate(d, qt, null);
      if (r) hits.push(r);
      // live counts: each facet counted with every other filter applied
      var rs = evaluate(d, qt, "src");
      if (rs) { var s = sourcesOf(d, rs.cites); for (var k in s) facet.src[k] = (facet.src[k] || 0) + 1; }
      var rt = evaluate(d, qt, "type"); if (rt) facet.type[d.ty] = (facet.type[d.ty] || 0) + 1;
      var ro = evaluate(d, qt, "org"); if (ro) facet.org[d.o] = (facet.org[d.o] || 0) + 1;
      if (!d.c) { var rm = evaluate(d, qt, "m"); if (rm) facet.m++; }
    });
    var saved = state.conf;
    state.conf = "all"; DOCS.forEach(function (d) { if (d.c && evaluate(d, qt, null)) facet.confAll++; });
    state.conf = "strong"; DOCS.forEach(function (d) { if (d.c && evaluate(d, qt, null)) facet.confStrong++; });
    state.conf = saved;
    return { hits: hits, facet: facet, qt: qt };
  }
  function sortHits(hits) {
    var by = state.sort;
    var date = function (r) { return r.d.d || ""; };
    var ncit = function (r) { return r.cites.filter(function (c) { return c.r === "c"; }).length; };
    hits.sort(function (a, b) {
      if (by === "old") { var da = date(a) || "9999", db = date(b) || "9999"; return da < db ? -1 : da > db ? 1 : 0; }
      if (by === "cites") { var n = ncit(b) - ncit(a); if (n) return n; }
      if (by === "rel" && state.q) { var s = b.score - a.score; if (s) return s; }
      return date(a) < date(b) ? 1 : date(a) > date(b) ? -1 : 0;
    });
    return hits;
  }

  // ---------- facets UI ----------
  var allTypes = [], allOrgs = [];
  function buildFacetOptions() {
    var t = {}, o = {};
    DOCS.forEach(function (d) { t[d.ty] = (t[d.ty] || 0) + 1; o[d.o] = (o[d.o] || 0) + 1; });
    allTypes = Object.keys(t).sort(function (a, b) { return t[b] - t[a] || a.localeCompare(b); });
    allOrgs = Object.keys(o).sort(function (a, b) { return o[b] - o[a] || a.localeCompare(b); });
    var ys = DOCS.map(function (d) { return d.y; }).filter(Boolean);
    var y0 = Math.min.apply(null, ys), y9 = Math.max.apply(null, ys);
    ["f-y1", "f-y2"].forEach(function (id) { $(id).min = y0; $(id).max = y9; });
    $("f-y1").placeholder = y0; $("f-y2").placeholder = y9;
  }
  function renderFacets(f) {
    var box = $("f-source"); box.textContent = "";
    SOURCES.forEach(function (s) {
      var id = "src-" + s.replace(/\W/g, "");
      box.appendChild(h("label", { "for": id }, [
        h("input", { type: "checkbox", id: id, value: s, checked: state.src.indexOf(s) >= 0,
          on: { change: function (e) {
            state.src = SOURCES.filter(function (x) { return x === s ? e.target.checked : state.src.indexOf(x) >= 0; });
            state.p = 1; update();
          } } }),
        s, h("span", { "class": "n", text: fmt(f.src[s] || 0) })
      ]));
    });
    var conf = document.querySelectorAll("input[name=conf]");
    conf[0].parentNode.lastChild.textContent = " Strong and probable (" + fmt(f.confAll) + ")";
    conf[1].parentNode.lastChild.textContent = " Strong only (" + fmt(f.confStrong) + ")";
    $("f-mentions").parentNode.lastChild.textContent = " Include documents that only mention data (" + fmt(f.m) + ")";
    fillSelect($("f-type"), allTypes, f.type, state.type, "All document types", cap);
    fillSelect($("f-org"), allOrgs, f.org, state.org, "All organisations", function (x) { return x; });
  }
  function fillSelect(sel, opts, counts, cur, allLabel, label) {
    sel.textContent = "";
    var total = 0; for (var k in counts) total += counts[k];
    sel.appendChild(h("option", { value: "", text: allLabel + " (" + fmt(total) + ")" }));
    opts.forEach(function (o) {
      sel.appendChild(h("option", { value: o, selected: o === cur, text: label(o) + " (" + fmt(counts[o] || 0) + ")" }));
    });
    sel.value = cur;
  }

  // ---------- cards ----------
  function highlight(text, titleTokens) {
    var frag = document.createDocumentFragment();
    var parts = text.split(/([\p{L}\p{N}]+)/u);
    parts.forEach(function (p, i) {
      if (i % 2 === 1 && titleTokens[norm(p)]) frag.appendChild(h("mark", null, [p]));
      else if (p) frag.appendChild(document.createTextNode(p));
    });
    return frag;
  }
  var STOP = { the: 1, and: 1, for: 1, van: 1, het: 1, een: 1, met: 1, voor: 1, den: 1, der: 1, des: 1, with: 1, from: 1, into: 1 };
  function snippetBlock(c, p) {
    var tt = {};
    toks(p.t).forEach(function (t) { if (t.length >= 3 && !STOP[t]) tt[t] = 1; });
    var q = h("blockquote", { "class": "snip", hidden: true });
    q.appendChild(document.createTextNode("…"));
    q.appendChild(highlight(c.sn || "", tt));
    q.appendChild(document.createTextNode("…"));
    var btn = h("button", { type: "button", "class": "toggle", "aria-expanded": "false", text: "Show citing text",
      on: { click: function () {
        var open = q.hidden; q.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "Hide citing text" : "Show citing text";
      } } });
    return c.sn ? [btn, q] : [h("span", { "class": "pmeta", text: "No citing text recorded." })];
  }
  function pubLine(c) {
    var p = PUBS[c.id] || { t: c.id };
    var bits = [];
    if (p.a) bits.push(p.a + " ");
    if (p.y) bits.push("(" + p.y + "). ");
    bits.push(h("span", { "class": "ptitle", text: p.t }));
    if (p.ve) bits.push(h("span", { "class": "pmeta", text: ". " + p.ve }));
    var href = pubLink(p);
    if (href) { bits.push(" "); bits.push(link(href, p.doi ? "doi:" + p.doi : "link", true)); }
    if (c.pg) bits.push(h("span", { "class": "pmeta", text: " · page " + c.pg }));
    if (c.cf === "p") bits.push(h("span", { "class": "prob", title: "Probable match: main title found with author or year nearby", text: "probable" }));
    return bits;
  }
  function citeItem(c) {
    var p = PUBS[c.id] || {};
    return h("li", { "class": "cite" }, [h("div", null, pubLine(c))].concat(snippetBlock(c, p)));
  }
  function refLine(d) {
    return [d.i, cap(d.ty), d.o, d.d || "date unknown", d.ds ? "dossier " + d.ds : ""].filter(Boolean).join(", ");
  }
  function card(r) {
    var d = r.d, cites = r.cites;
    var title = d.u ? link(d.u, d.t || d.i, true) : document.createTextNode(d.t || d.i);
    var meta = [cap(d.ty), d.o, fmtDate(d.d)];
    var metaEls = meta.map(function (m) { return h("span", { text: m }); });
    if (d.ds) metaEls.push(h("span", { text: "dossier " + d.ds }));
    metaEls.push(h("span", { text: d.i }));
    if (d.pa) metaEls.push(h("span", null, ["part of ", d.pu ? link(d.pu, d.pa, true) : d.pa]));
    var kids = [h("h3", null, [title]), h("p", { "class": "meta" }, metaEls)];
    if (!d.u) kids.push(h("p", { "class": "ref", text: refLine(d) }));

    var verified = {};
    cites.forEach(function (c) { ((PUBS[c.id] || {}).s || []).forEach(function (s) { verified[s] = 1; }); });
    var tags = h("ul", { "class": "tags", "aria-label": "Data sources" });
    Object.keys(verified).sort().forEach(function (s) { tags.appendChild(h("li", { "class": "tag", text: s })); });
    d.m.forEach(function (s) {
      tags.appendChild(h("li", { "class": "tag mention", title: "Phrase found in the document; not checked by reading", text: "mentions " + s }));
    });
    if (tags.childNodes.length) kids.push(tags);

    cites.filter(function (c) { return c.r !== "c"; }).forEach(function (c) {
      var label = c.r === "ip" ? "This document is the publication" : "Sent to parliament as attachment";
      kids.push(h("div", { "class": "notice" }, [h("strong", { text: label + ": " })].concat(pubLine(c)).concat([h("div", null, snippetBlock(c, PUBS[c.id] || {}))])));
    });
    var real = cites.filter(function (c) { return c.r === "c"; });
    if (real.length) {
      kids.push(h("p", { "class": "cites-h", text: "Cites " + real.length + (real.length === 1 ? " publication" : " publications") }));
      var ul = h("ul", { "class": "cites" });
      real.forEach(function (c, i) { var li = citeItem(c); if (i >= SHOW_CITES) li.hidden = true; ul.appendChild(li); });
      kids.push(ul);
      if (real.length > SHOW_CITES) {
        var more = h("button", { type: "button", "class": "toggle", "aria-expanded": "false", text: "Show all " + real.length,
          on: { click: function () {
            var open = more.getAttribute("aria-expanded") !== "true";
            Array.prototype.forEach.call(ul.children, function (li, i) { if (i >= SHOW_CITES) li.hidden = !open; });
            more.setAttribute("aria-expanded", open ? "true" : "false");
            more.textContent = open ? "Show fewer" : "Show all " + real.length;
          } } });
        kids.push(more);
      }
    } else if (!d.c) {
      kids.push(h("p", { "class": "notice", text: "Cites no listed publication. Mentions the data by name (phrase match, not checked by reading)." }));
    }
    var links = [];
    if (d.u) links.push(link(d.u, "Open original", true));
    if (d.p) links.push(link(d.p, "PDF", true));
    if (links.length) kids.push(h("p", { "class": "links" }, links));
    if (d.aka && d.aka.length) {
      var aka = [h("span", { text: "Also registered as: " })];
      d.aka.forEach(function (a, i) { if (i) aka.push(", "); aka.push(link(a[1], a[0], true)); });
      kids.push(h("p", { "class": "aka" }, aka));
    }
    return h("li", { "class": "card" }, kids);
  }

  // ---------- by publication ----------
  function pubRows(hits, qt) {
    var agg = {};
    hits.forEach(function (r) {
      r.cites.forEach(function (c) {
        var a = agg[c.id] || (agg[c.id] = { id: c.id, docs: [], cites: 0, self: 0 });
        a.docs.push({ d: r.d, c: c });
        if (c.r === "c") a.cites++; else a.self++;
      });
    });
    var rows = Object.keys(agg).map(function (k) { return agg[k]; });
    if (qt.length) {   // a query that names publications narrows to those publications
      var own = rows.filter(function (a) { var ix = PUBS_INDEX[a.id]; return ix && score(ix.tok, ix.keys, qt); });
      if (own.length) rows = own;
    }
    rows.sort(function (a, b) { return b.cites - a.cites || b.self - a.self || (PUBS[a.id].t || "").localeCompare(PUBS[b.id].t || ""); });
    return rows;
  }
  function pubRow(a) {
    var p = PUBS[a.id] || { t: a.id };
    var head = [p.a, p.y, p.ve].filter(Boolean).join(" · ");
    var href = pubLink(p);
    var n = a.cites + " citing " + (a.cites === 1 ? "document" : "documents") + (a.self ? ", plus " + a.self + " where the document is the publication" : "");
    a.docs.sort(function (x, y) { return (y.d.d || "") < (x.d.d || "") ? -1 : 1; });
    var list = h("ul", { "class": "doclist" });
    a.docs.forEach(function (x) {
      var rel = x.c.r === "ip" ? " (is the publication)" : x.c.r === "at" ? " (sent as attachment)" : "";
      list.appendChild(h("li", null, [x.d.u ? link(x.d.u, x.d.t || x.d.i, true) : x.d.t || x.d.i,
        h("span", { "class": "pmeta", text: " · " + cap(x.d.ty) + " · " + fmtDate(x.d.d) + rel + (x.c.cf === "p" ? " · probable" : "") })]));
    });
    var det = h("details", null, [h("summary", { text: n })]);
    det.appendChild(list);
    return h("li", { "class": "prow" }, [
      h("h3", null, [href ? link(href, p.t, true) : p.t]),
      h("p", { "class": "pmeta" }, [head + (p.s && p.s.length ? " · " + p.s.join(", ") : "")]),
      det
    ]);
  }

  // ---------- render ----------
  function pager(total) {
    var nav = $("pager"); nav.textContent = "";
    var pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) return;
    var go = function (p) { return function () { state.p = p; update(true); $("count").focus(); }; };
    nav.appendChild(h("button", { type: "button", disabled: state.p <= 1, text: "Previous", on: { click: go(state.p - 1) } }));
    var shown = {};
    [1, 2, state.p - 1, state.p, state.p + 1, pages - 1, pages].forEach(function (p) { if (p >= 1 && p <= pages) shown[p] = 1; });
    var last = 0;
    Object.keys(shown).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) {
      if (p - last > 1) nav.appendChild(h("span", { "class": "gap", text: "…" }));
      nav.appendChild(h("button", { type: "button", "aria-current": p === state.p ? "page" : null, "aria-label": "Page " + p,
        text: String(p), on: { click: go(p) } }));
      last = p;
    });
    nav.appendChild(h("button", { type: "button", disabled: state.p >= pages, text: "Next", on: { click: go(state.p + 1) } }));
  }
  var lastHits = [];
  function update(keepPage) {
    var res = run();
    lastHits = sortHits(res.hits);
    renderFacets(res.facet);
    var list = $("list"); list.textContent = "";
    var total, items;
    if (state.v === "docs") {
      total = lastHits.length;
      var nc = lastHits.filter(function (r) { return r.d.c; }).length;
      $("count").textContent = fmt(total) + (total === 1 ? " document" : " documents") +
        (state.m ? " (" + fmt(nc) + " citing a listed publication, " + fmt(total - nc) + " mentioning data only)" : " citing a listed publication");
      items = lastHits;
    } else {
      items = pubRows(lastHits, res.qt);
      total = items.length;
      $("count").textContent = fmt(total) + (total === 1 ? " publication" : " publications") + " cited by " + fmt(lastHits.length) + " documents";
    }
    var pages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (state.p > pages) state.p = pages;
    var slice = items.slice((state.p - 1) * PER_PAGE, state.p * PER_PAGE);
    if (!slice.length) list.appendChild(h("li", { "class": "empty", text: "No documents match. Try fewer words or clear a filter." }));
    slice.forEach(function (r) { list.appendChild(state.v === "docs" ? card(r) : pubRow(r)); });
    pager(total);
    syncControls();
    writeURL();
  }

  // ---------- CSV ----------
  function csvCell(v) {
    v = v === null || v === undefined ? "" : String(v);
    if (/^[=+@\t\r]/.test(v) || /^-[^\d]/.test(v)) v = "'" + v;  // keep spreadsheet formulas inert
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function downloadCSV() {
    var cols = ["doc_id", "doc_title", "doc_type", "organisation", "date", "dossier", "url", "pdf_url", "parent_id",
      "also_registered_as", "source", "kind", "relation", "confidence", "pub_id", "pub_title", "pub_authors", "pub_year",
      "pub_venue", "pub_doi_or_url", "page", "snippet", "data_sources_cited", "data_mentioned"];
    var REL = { c: "cites", ip: "is_publication", at: "attachment_of_citing" };
    var rows = [cols];
    lastHits.forEach(function (r) {
      var d = r.d;
      var base = [d.i, d.t, d.ty, d.o, d.d, d.ds, d.u, d.p, d.pa, (d.aka || []).map(function (a) { return a[0]; }).join(" | "), d.src];
      var verified = {};
      r.cites.forEach(function (c) { ((PUBS[c.id] || {}).s || []).forEach(function (s) { verified[s] = 1; }); });
      var tail = [Object.keys(verified).sort().join(" | "), d.m.join(" | ")];
      if (!r.cites.length) rows.push(base.concat(["data mention", "", "", "", "", "", "", "", "", "", ""]).concat(tail));
      r.cites.forEach(function (c) {
        var p = PUBS[c.id] || {};
        rows.push(base.concat(["publication", REL[c.r], c.cf === "s" ? "strong" : "probable", c.id, p.t, p.a, p.y, p.ve,
          pubLink(p), c.pg, c.sn]).concat(tail));
      });
    });
    var text = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    var a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })),
      download: "odissei-government-citations-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------- about ----------
  function renderAbout() {
    var A = ABOUT, b = $("about-body"); b.textContent = "";
    var lists = A.publications_by_list || {};
    b.appendChild(h("p", null, ["The page lists Dutch government documents that cite a publication from four ODISSEI " +
      "publication lists: research using CBS microdata (" + fmt(lists.CBS || 0) + "), research using the LISS panel (" +
      fmt(lists.LISS || 0) + "), and the CBS publications (" + fmt(lists["KG-cbs"] || 0) + ") and papers from ODISSEI Grants (" +
      fmt(lists["KG-funded"] || 0) + ") from the ODISSEI knowledge graph that were not already in those lists, " +
      fmt(A.publications_searched || 0) + " publications in all."]));
    b.appendChild(h("h3", { text: "What was searched" }));
    b.appendChild(h("p", null, ["Official publications on officielebekendmakingen.nl, through the repository.overheid.nl search " +
      "service: Kamerstukken, bijlagen (attachments), Handelingen, Kamervragen and the Staatscourant, with other official " +
      "publications in the same collection. "]));
    b.appendChild(h("p", null, [h("strong", { text: "Not searched: " }), "documents released under the Open Government Act (Woo) " +
      "on open.overheid.nl, because that search service was down for the whole run. They will be added when it is back."]));
    b.appendChild(h("h3", { text: "How matching works" }));
    b.appendChild(h("p", { text: "Every publication was searched in the full text of the government documents by its DOI and its " +
      "title, and documents mentioning the data by name were read for DOIs and titles from the lists. " +
      "Each candidate was then checked against the document text: a strong match has the DOI, or the full title together " +
      "with the first author or the year close by; a probable match has the main title with the author or year close by. " +
      "Weaker candidates are left out, and a hand check of " + A.precision_n + " random matches found " + A.precision_ok +
      " correct." }));
    b.appendChild(h("p", { text: "Documents marked “mentions” name CBS microdata, the LISS panel or ODISSEI but cite none of the " +
      "listed publications. They come from a phrase search only and were not checked by reading. They are shown by " +
      "default and can be switched off." }));
    b.appendChild(h("h3", { text: "Numbers" }));
    var dl = h("dl");
    [["Run", (A.run_start || "") + (A.run_end && A.run_end !== A.run_start ? " to " + A.run_end : "")],
     ["Publications searched", fmt(A.publications_searched || 0)],
     ["Publications referenced", fmt(A.pubs_referenced || 0) + " (" + fmt(A.pubs_cited || 0) + " cited)"],
     ["Documents with a citation", fmt(A.documents_any || 0) + " document ids; " + fmt(A.records_with_citations || 0) +
       " after merging ids with identical text"],
     ["Data-only documents", fmt(A.records_data_only || 0) + " (after merging)"],
     ["Hand-checked precision", A.precision_ok + " of " + A.precision_n]
    ].forEach(function (x) { dl.appendChild(h("dt", { text: x[0] })); dl.appendChild(h("dd", { text: x[1] })); });
    b.appendChild(dl);
    b.appendChild(h("p", null, ["The page shows document metadata and, for each citation, a short passage (at most 300 characters) " +
      "from the document as evidence. The documents themselves are not stored here; every record links to the original."]));
    b.appendChild(h("p", null, ["Corrections and missing references: please contact the ODISSEI team via ",
      link("https://odissei-data.nl", "odissei-data.nl", false), "."]));
    $("footer").textContent = "ODISSEI · Data built " + (A.built || "") + " from officielebekendmakingen.nl · ";
    $("footer").appendChild(link("#about", "About this data"));
  }

  // ---------- wiring ----------
  var timer = null;
  function bind() {
    $("q").addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = $("q").value; state.p = 1; update(); }, 120);
    });
    document.querySelectorAll("input[name=conf]").forEach(function (r) {
      r.addEventListener("change", function () { state.conf = r.value; state.p = 1; update(); });
    });
    $("f-mentions").addEventListener("change", function (e) { state.m = e.target.checked; state.p = 1; update(); });
    $("f-type").addEventListener("change", function (e) { state.type = e.target.value; state.p = 1; update(); });
    $("f-org").addEventListener("change", function (e) { state.org = e.target.value; state.p = 1; update(); });
    ["f-y1", "f-y2"].forEach(function (id) {
      $(id).addEventListener("change", function (e) {
        var v = e.target.value; state[id === "f-y1" ? "y1" : "y2"] = /^\d{4}$/.test(v) ? v : ""; state.p = 1; update();
      });
    });
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; state.p = 1; update(); });
    document.querySelectorAll(".tabs button").forEach(function (b) {
      b.addEventListener("click", function () { state.v = b.dataset.view; state.p = 1; update(); });
    });
    $("reset").addEventListener("click", function () {
      var v = state.v; state = JSON.parse(JSON.stringify(DEFAULTS)); state.v = v; update();
    });
    $("csv").addEventListener("click", downloadCSV);
    window.addEventListener("popstate", function () { readURL(); update(true); });
    if (window.matchMedia("(max-width: 820px)").matches) $("filter-panel").open = false;
  }

  function load(u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + ": " + r.status); return r.json(); });
  }
  Promise.all([load("data/documents.json"), load("data/publications.json"), load("data/about.json")])
    .then(function (x) {
      DOCS = x[0]; PUBS = x[1]; ABOUT = x[2];
      prepare(); buildFacetOptions(); readURL(); bind(); renderAbout(); update(true);
    })
    .catch(function (e) {
      $("count").textContent = "The data could not be loaded. Open this page through a web server " +
        "(for example: python3 -m http.server in this folder), not as a local file.";
      if (window.console) console.error(e);
    });
})();
