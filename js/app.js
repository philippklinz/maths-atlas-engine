import {el} from "./dom.js"
import {loadAtlas, normalize, pathFor, readRoute} from "./model.js"
import {entryCount, renderCards, renderEntryList, renderIntro, renderTopic, renderTrail, renderTree} from "./catalog.js"
import {renderReading} from "./reader.js"
import {renderMap} from "./map.js"

const $ = id => document.getElementById(id)
const article = $("article")
const directory = $("directory")
const search = $("catalog-search")
const narrow = matchMedia("(max-width:56.25rem)")
const dark = matchMedia("(prefers-color-scheme:dark)")
const theme = $("theme")
let atlas, route, mapView, searchPage, topicPage
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

function showSearch(page = 0) {
  const query = normalize(search.value.trim())
  const results = $("catalog-results")
  $("catalog-tree").hidden = Boolean(query)
  results.hidden = !query
  searchPage = null
  if (!query) {
    results.replaceChildren()
    return
  }
  const matches = atlas.catalog.filter(item => item.search.includes(query)).map(item => item.entry)
  searchPage = renderEntryList(results, matches, {atlas, route, link}, page, true)
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
    directory:directory.open, search:search.value, graph:mapView?.snapshot(),
    openAreas:[...$("catalog-tree").querySelectorAll("details[open]")].map(node => node.dataset.area),
    searchPage:searchPage?.(), topicPage:topicPage?.()
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
  if (target.topic && route.topic === target.topic && active?.id === "topic-kind") {
    saved = {...position, topicPage:0}
  }
  const key = pathFor(target)
  if (key === pathFor(route) && !options.back && !options.self) {
    if (options.directory && narrow.matches) {
      directory.open = false
      $("entry-title")?.focus({preventScroll:true})
    }
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
  topicPage = null
  route = readRoute(atlas.data.start)
  const entry = atlas.entries.get(route.id)
  const topic = route.id ? atlas.entryTopics.get(route.id) : atlas.topics.get(route.topic)
  const area = topic?.area || atlas.areas.get(route.area)
  const home = !route.id && !route.area && !route.topic
  const saved = state.saved
  directory.open = saved?.directory ?? !narrow.matches
  search.value = saved?.search || ""
  renderTree($("catalog-tree"), atlas, area, topic, saved?.openAreas, link)
  showSearch(saved?.searchPage)
  renderTrail($("breadcrumbs"), route, area, topic, link)
  navigation(state, entry)
  article.replaceChildren()
  const missing = route.id ? "Eintrag nicht gefunden" : (route.area ? "Gebiet nicht gefunden" : "Thema nicht gefunden")
  const title = entry?.title || topic?.title || area?.title || (home ? "Formeln und ihre Verbindungen." : missing)
  const heading = el("h1", "", title)
  heading.id = "entry-title"
  heading.tabIndex = -1
  const homeLink = $("home-link")
  if (home) homeLink.setAttribute("aria-current", "page")
  else homeLink.removeAttribute("aria-current")
  article.className = entry ? "entry-page" : "catalog-page"
  const context = {article, entry, atlas, route, link, go, saved:saved?.graph}
  if (entry) {
    article.append(el("p", "context", area.title + " / " + entry.kind), heading, el("p", "lead", entry.summary))
    if (route.map) mapView = renderMap(context)
    else renderReading(context)
  } else if (home || area) {
    if (home) article.append(renderIntro(heading, atlas, link))
    else {
      const intro = el("header", "subject-intro", el("p", "eyebrow", topic ? area.title : "Gebiet"), heading)
      const summary = (topic || area).summary
      if (summary) intro.append(el("p", "lead", summary))
      article.append(intro)
    }
    if (topic) topicPage = renderTopic(article, topic, context, saved?.topicPage)
    else article.append(el("section", "subjects", el("h2", "", home ? "Gebiet auswählen" : "Thema auswählen"),
      renderCards(home ? atlas.areas.values() : area.topics, home, link)))
  } else {
    article.append(heading, link("Zur Themenauswahl", {}, {directory:true}, "control"))
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
    $("entry-count").textContent = entryCount(atlas.entries.size)
    document.querySelector(".brand").href = pathFor({})
    const grid = el("span", "grid-icon")
    grid.setAttribute("aria-hidden", "true")
    const homeLink = link("Themenauswahl", {}, {directory:true}, "rail-home")
    homeLink.prepend(grid)
    homeLink.id = "home-link"
    $("rail-nav").append(homeLink)
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
search.oninput = () => { if (atlas) showSearch(); scheduleSave() }
search.dataset.key = "catalog-search"
narrow.addEventListener("change", () => { directory.open = !narrow.matches })
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
