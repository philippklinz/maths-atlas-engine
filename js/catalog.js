import {el} from "./dom.js"

const pageSize = 20
export const entryCount = n => n + (n === 1 ? " Eintrag" : " Einträge")

export function renderCards(items, isArea, link) {
  const list = el("ul", "subject-cards")
  for (const item of items) {
    const target = isArea ? {area:item.id} : {topic:item.id}
    const title = link(item.title, target, {directory:true})
    const card = el("li", "subject-card", el("h2", "", title))
    if (item.summary) card.append(el("p", "", item.summary))
    const count = isArea
      ? item.topics.length + (item.topics.length === 1 ? " Thema" : " Themen") + " · " + entryCount(item.count)
      : entryCount(item.entries.length)
    card.append(el("span", "count", count))
    list.append(card)
  }
  return list
}

export function renderTree(root, atlas, currentArea, currentTopic, openAreas, link) {
  root.replaceChildren()
  for (const area of atlas.areas.values()) {
    const summary = el("summary", "", area.title)
    summary.dataset.key = "directory-area-" + area.id
    const details = el("details", "directory-area", summary)
    details.dataset.area = area.id
    const topics = el("ul", "tree-topics")
    function populate() {
      if (!details.open || topics.childElementCount) return
      for (const topic of area.topics) {
        const item = link(topic.title, {topic:topic.id}, {directory:true})
        item.dataset.key = "directory-topic-" + topic.id
        if (topic === currentTopic) item.setAttribute("aria-current", "location")
        topics.append(el("li", "", item))
      }
    }
    details.append(topics)
    details.open = openAreas ? openAreas.includes(area.id) : area === currentArea
    details.addEventListener("toggle", populate)
    populate()
    root.append(details)
  }
}

// Both a large topic and a broad search render just one page of links at a time.
export function renderEntryList(root, entries, {atlas, route, link}, initialPage = 0, showPath = false) {
  const status = el("p", "list-status")
  status.setAttribute("role", "status")
  const list = el("ul", "entry-list")
  const pager = el("div", "pagination")
  root.replaceChildren(status, list, pager)
  const last = Math.max(0, Math.ceil(entries.length / pageSize) - 1)
  let page = Math.min(Math.max(initialPage, 0), last)
  function draw() {
    const offset = page * pageSize
    const shown = entries.slice(offset, offset + pageSize)
    list.replaceChildren()
    for (const entry of shown) {
      const title = el("span", "result-title", entry.title)
      if (showPath) {
        const topic = atlas.entryTopics.get(entry.id)
        title.append(el("small", "result-path", topic.area.title + " / " + topic.title))
      }
      const row = link(title, {id:entry.id}, {directory:true}, "catalog-row")
      row.dataset.key = (showPath ? "search-entry-" : "topic-entry-") + entry.id
      if (route.id === entry.id) row.setAttribute("aria-current", "page")
      row.append(el("small", "kind", entry.kind))
      list.append(el("li", "", row))
    }
    status.textContent = entries.length ? entryCount(entries.length) : "Keine passenden Einträge."
    if (last) status.textContent = (offset + 1) + "–" + (offset + shown.length) + " von " + entries.length + " Einträgen"
    pager.hidden = !last
    previous.disabled = page === 0
    next.disabled = page === last
  }
  function pageButton(label, delta) {
    const button = el("button", "", label)
    button.onclick = () => {
      page += delta
      draw()
      list.querySelector("a")?.focus()
    }
    return button
  }
  const previous = pageButton("Vorherige", -1)
  const next = pageButton("Weitere", 1)
  pager.append(previous, next)
  draw()
  return () => page
}

export function renderTopic(article, topic, context, initialPage) {
  const {route, go} = context
  const kinds = [...new Set(topic.entries.map(entry => entry.kind))]
  if (route.kind && !kinds.includes(route.kind)) kinds.push(route.kind)
  kinds.sort((a, b) => a.localeCompare(b, "de"))
  const select = el("select")
  select.id = select.dataset.key = "topic-kind"
  select.add(new Option("Alle Eintragsarten", ""))
  for (const kind of kinds) select.add(new Option(kind, kind))
  select.value = route.kind || ""
  select.onchange = () => go({topic:topic.id, kind:select.value}, {directory:true}, select)
  const label = el("label", "", "Eintragsart")
  label.htmlFor = select.id
  const results = el("div", "topic-results")
  article.append(el("div", "topic-filter", label, select), results)
  const entries = route.kind ? topic.entries.filter(entry => entry.kind === route.kind) : topic.entries
  return renderEntryList(results, entries, context, initialPage)
}

export function renderTrail(root, route, area, topic, link) {
  root.replaceChildren()
  if (!route.id && !route.area && !route.topic) return
  const items = [link("Themenauswahl", {}, {directory:true})]
  if (area && !route.area) items.push(link(area.title, {area:area.id}, {directory:true}))
  if (topic && route.id) items.push(link(topic.title, {topic:topic.id}, {directory:true}))
  const list = el("ol")
  for (const item of items) list.append(el("li", "", item))
  root.append(list)
}
