import {el} from "./dom.js"
import {byTitle, formulaText, loadAtlas, normalize, pathFor, readRoute} from "./model.js"
import {renderReading} from "./reader.js"
import {renderMap} from "./map.js"

const $ = id => document.getElementById(id)
const article = $("article")
const directory = $("directory")
const search = $("catalog-search")
const wide = matchMedia("(min-width:52.01rem)")
const dark = matchMedia("(prefers-color-scheme:dark)")
const theme = $("theme")
let atlas, route, mapView, catalogEntries
let rendering = false
let serial = 0
let saveTimer

function paintTheme() {
  document.documentElement.dataset.scheme = (theme.value === "system" ? (dark.matches ? "dark" : "light") : theme.value)
  mapView?.refresh()
}
try { theme.value = localStorage.getItem("maths-atlas-theme") || "system" } catch {}
if (!theme.value) theme.value = "system"
theme.onchange = () => {
  try { localStorage.setItem("maths-atlas-theme", theme.value) } catch {}
  paintTheme()
}
dark.addEventListener("change", paintTheme)
paintTheme()

function link(label, target, options = {}, className = "") {
  const a = el("a", className, label)
  a.href = pathFor(target)
  a.dataset.key = [options.origin ? pathFor(options.origin) : "", a.hash, a.textContent].join("|")
  a.addEventListener("click", event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    go(target, options, a)
  })
  return a
}

function showCatalog() {
  const query = normalize(search.value.trim())
  const filtered = catalogEntries.filter(item => item.search.includes(query))
  const rows = filtered.map(({entry}) => {
    const row = link(el("span", "", entry.title), {id:entry.id}, {directory:true}, "catalog-row")
    row.append(el("small", "", entry.kind))
    if (entry.id === route.id) row.setAttribute("aria-current", "page")
    return row
  })
  if (!rows.length) rows.push(el("p", "note", "Keine passenden Einträge."))
  $("catalog").replaceChildren(...rows)
  $("entry-count").textContent = query ? filtered.length + " / " + catalogEntries.length : String(catalogEntries.length)
}

function findFocus(key) {
  if (!key) return null
  return [...document.querySelectorAll("[data-key]")].find(node => node.dataset.key === key && node.getClientRects().length)
}
function snapshot(active = document.activeElement) {
  const anchor = active?.closest(".step")
  return {
    scroll:window.scrollY, focus:active?.dataset.key, anchor:anchor?.id, offset:anchor?.getBoundingClientRect().top,
    open:[...article.querySelectorAll("details[open]")].map(node => node.id),
    directory:directory.open, search:search.value, graph:mapView?.snapshot()
  }
}
function remember(active) {
  if (rendering || !route) return
  const state = history.state || {}
  if (state.key !== pathFor(route)) return
  history.replaceState({...state, saved:snapshot(active)}, "")
}
function scheduleSave() {
  if (rendering || !route) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => remember(), 140)
}

function go(target, options = {}, active = document.activeElement) {
  const prior = history.state || {}
  const position = snapshot(active)
  remember(active)
  let bookmark = options.directory ? null : prior.bookmark
  let saved = null
  let reader = null
  if (options.back && bookmark) {
    saved = bookmark.saved
    bookmark = null
  } else if (options.origin && !bookmark) {
    bookmark = {target:options.origin, saved:position}
  }
  if (options.switchView && target.id === route.id) {
    if (target.map) reader = position
    else saved = prior.reader || null
  }
  const key = pathFor(target)
  if (key === pathFor(route) && !options.back && !options.self) {
    if (options.directory && !wide.matches) directory.open = false
    return
  }
  const next = {key, bookmark, saved, reader}
  history.pushState(next, "", key)
  render(next, true)
}

function headingForOrigin(mark) {
  const target = atlas.entries.get(mark.target.id)
  if (!target) return ""
  const proof = target.proofs?.find(p => p.id === mark.target.proof)
  const index = proof?.steps.findIndex(s => s.id === mark.target.step) ?? -1
  return "Zurück zu " + target.title + (index >= 0 ? " · Schritt " + (index + 1) : "")
}
function navigation(state, entry) {
  const nav = $("navigation")
  nav.replaceChildren()
  if (entry) {
    const tabs = el("nav", "views")
    tabs.setAttribute("aria-label", "Ansicht des Eintrags")
    for (const [map, title] of [[false,"Lesen"], [true,"Mindmap"]]) {
      const tab = link(title, {...route, map}, {switchView:true}, "control")
      if (route.map === map) tab.setAttribute("aria-current", "page")
      tabs.append(tab)
    }
    nav.append(tabs)
  }
  const mark = state.bookmark
  if (mark && headingForOrigin(mark)) {
    nav.append(link(headingForOrigin(mark), mark.target, {back:true}, "control return"))
  }
  document.documentElement.style.setProperty("--nav-height", nav.offsetHeight + "px")
}
new ResizeObserver(([current]) => {
  document.documentElement.style.setProperty("--nav-height", current.target.offsetHeight + "px")
}).observe($("navigation"))

function positionPage(saved, moveFocus) {
  const selected = !route.map && ((route.step && $("schritt-" + route.proof + "-" + route.step)) || (route.proof && $("beweis-" + route.proof)))
  if (saved) {
    const anchor = saved.anchor && $(saved.anchor)
    const top = anchor && Number.isFinite(saved.offset) ? window.scrollY + anchor.getBoundingClientRect().top - saved.offset : saved.scroll
    window.scrollTo(0, top || 0)
    if (moveFocus) (findFocus(saved.focus) || selected || $("entry-title"))?.focus({preventScroll:true})
  } else if (selected) {
    selected.scrollIntoView({block:"start"})
    if (moveFocus) selected.focus({preventScroll:true})
  } else {
    window.scrollTo(0, 0)
    if (moveFocus) $("entry-title")?.focus({preventScroll:true})
  }
}

function render(state, moveFocus) {
  clearTimeout(saveTimer)
  rendering = true
  const run = ++serial
  mapView?.destroy()
  mapView = null
  route = readRoute(atlas.data.start)
  const entry = atlas.entries.get(route.id)
  const saved = state.saved
  directory.open = saved?.directory ?? wide.matches
  if (saved) search.value = saved.search || ""
  showCatalog()
  navigation(state, entry)
  article.replaceChildren()
  const heading = el("h1", "", entry?.title || "Eintrag nicht gefunden")
  heading.id = "entry-title"
  heading.tabIndex = -1
  if (entry) {
    article.append(el("p", "context", atlas.data.chapter + " / " + entry.kind), heading, el("p", "lead", entry.summary))
    const context = {article, entry, atlas, route, link, go, saved:saved?.graph}
    if (route.map) mapView = renderMap(context)
    else renderReading(context)
  } else {
    article.append(heading, el("p", "note", "Dieser Eintrag gehört nicht zum geladenen Bestand."), link("Zum Starteintrag", {id:atlas.data.start}, {directory:true}, "control"))
  }
  document.title = heading.textContent + (route.map ? " · Mindmap" : "") + " · Maths Atlas"
  for (const id of saved?.open || []) {
    const detail = $(id)
    if (detail?.tagName === "DETAILS") detail.open = true
  }
  article.setAttribute("aria-busy", "false")
  positionPage(saved, moveFocus)
  requestAnimationFrame(() => {
    if (serial !== run) return
    positionPage(saved, false)
    rendering = false
  })
}

async function start() {
  try {
    atlas = await loadAtlas()
    catalogEntries = [...atlas.entries.values()].sort(byTitle).map(entry => ({
      entry, search:normalize([entry.title, entry.kind, entry.summary, formulaText(entry.formula)].join(" "))
    }))
    $("chapter").textContent = atlas.data.chapter
    const initial = readRoute(atlas.data.start)
    const key = pathFor(initial)
    const state = history.state?.key === key ? history.state : {key}
    history.scrollRestoration = "manual"
    history.replaceState(state, "")
    render(state, Boolean(initial.step || initial.proof))
  } catch (error) {
    article.setAttribute("aria-busy", "false")
    const retry = el("button", "", "Erneut versuchen")
    retry.onclick = () => location.reload()
    article.replaceChildren(el("h1", "", "Atlas konnte nicht geöffnet werden"), el("p", "note", error.message), retry)
  }
}
search.oninput = () => { if (atlas) showCatalog(); scheduleSave() }
search.dataset.key = "catalog-search"
wide.addEventListener("change", () => { directory.open = wide.matches })
document.querySelector(".skip").onclick = event => {
  event.preventDefault()
  $("lesebereich").focus()
  $("lesebereich").scrollIntoView({block:"start"})
}
window.addEventListener("popstate", () => {
  if (!atlas) return
  const key = pathFor(readRoute(atlas.data.start))
  if (history.state?.key !== key) history.replaceState({key}, "")
  render(history.state, true)
})
window.addEventListener("pagehide", () => remember())
window.addEventListener("scroll", scheduleSave, {passive:true})
document.addEventListener("toggle", scheduleSave, true)
document.addEventListener("focusin", scheduleSave)
start()
