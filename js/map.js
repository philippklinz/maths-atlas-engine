import {el} from "./dom.js"
import {destination, normalize} from "./model.js"

const pageSize = 4
const media = matchMedia("(forced-colors: active)")

function drawGraph(Network, graph, entry, groups, choose) {
  const css = getComputedStyle(document.documentElement)
  const color = key => css.getPropertyValue("--mo-" + key).trim()
  const makeNodes = () => {
    const dx = Math.max(58, Math.min(graph.clientWidth * .255, 185))
    const dy = Math.min(graph.clientHeight * .32, 100)
    const spots = groups.length === 1 ? [[0, -dy]] : groups.length === 2 ? [[0, -dy], [0, dy]] :
      [[-dx, -dy], [dx, -dy], ...(groups.length === 3 ? [[0, dy]] : [[-dx, dy], [dx, dy]])]
    const max = Math.max(85, Math.min(dx * 1.75 - 12, 200))
    const nodes = [{id:entry.id, label:entry.title, x:0, y:0, color:{background:color("accent-light"), border:color("accent")}, borderWidth:3}]
    groups.forEach((group, i) => nodes.push({id:group.entry.id, label:group.entry.title, x:spots[i][0], y:spots[i][1]}))
    for (const node of nodes) node.widthConstraint = {maximum:max}
    return nodes
  }
  const makeEdges = () => groups.map(({entry:other, edge}) => ({
    from:edge.incoming ? other.id : entry.id, to:edge.incoming ? entry.id : other.id,
    label:graph.clientWidth >= 500 ? {use:"verwendet", notation:"erklärt in", example:"Beispiel zu"}[edge.type] : undefined
  }))
  const network = new Network(graph, {nodes:makeNodes(), edges:makeEdges()}, {
    autoResize:false, physics:false, layout:{improvedLayout:false},
    nodes:{shape:"box", shapeProperties:{borderRadius:0}, margin:9, fixed:true,
      color:{background:color("surface"), border:color("control-border")},
      font:{face:"Liberation Sans Web, Arial, sans-serif", size:15, color:color("text")}},
    edges:{arrows:{to:{enabled:true, scaleFactor:.65}}, smooth:false, width:1.6,
      font:{face:"Liberation Sans Web, Arial, sans-serif", size:14, color:color("text"), strokeWidth:4, strokeColor:color("surface-2")},
      color:{color:color("control-border"), inherit:false}},
    interaction:{selectable:true, selectConnectedEdges:false, dragNodes:false, dragView:false, zoomView:false, hover:false, keyboard:false}
  })
  const observer = new ResizeObserver(() => {
    network.setSize(graph.clientWidth + "px", graph.clientHeight + "px")
    network.setData({nodes:makeNodes(), edges:makeEdges()})
    network.moveTo({position:{x:0, y:0}, scale:1, animation:false})
  })
  observer.observe(graph)
  network.on("click", event => { if (event.nodes.length) choose(event.nodes[0]) })
  return () => { observer.disconnect(); network.destroy() }
}

export function renderMap({article, entry, atlas, route, link, go, saved}) {
  const pairs = new Map()
  for (const edge of atlas.edges.get(entry.id)) {
    if (!pairs.has(edge.to)) pairs.set(edge.to, {entry:atlas.entries.get(edge.to), edge})
  }
  const groups = [...pairs.values()]
  const input = el("input")
  input.type = "search"
  input.id = "map-search"
  input.dataset.key = "map-search"
  input.placeholder = "Verknüpften Eintrag suchen"
  input.value = saved?.filter || ""
  const label = el("label", "", "Verbindungen filtern")
  label.htmlFor = input.id
  const graph = el("div", "graph")
  graph.setAttribute("aria-hidden", "true")
  const status = el("p", "map-status")
  status.setAttribute("role", "status")
  const list = el("ul", "related-list")
  const pager = el("div", "pagination")
  const heading = el("h2", "", "Direkte Verbindungen")
  const note = el("p", "caption", "Ein Knoten öffnet sein Umfeld. Die Titel in der Liste führen zur Textstelle.")
  article.append(el("section", "section", heading, el("div", "map-filter", label, input), status, graph, note, list, pager))
  let page = saved?.page || 0
  let generation = 0
  let disposeGraph
  function update() {
    const token = ++generation
    disposeGraph?.()
    disposeGraph = null
    const query = normalize(input.value.trim())
    const matches = groups.filter(g => normalize(g.entry.title + " " + g.edge.label + " " + g.entry.kind).includes(query))
    page = Math.max(0, Math.min(page, Math.ceil(matches.length / pageSize) - 1))
    const offset = page * pageSize
    const shown = matches.slice(offset, offset + pageSize)
    const count = matches.length
    status.textContent = count ? (offset + 1) + "–" + (offset + shown.length) + " von " + count + " Verbindungen" : "Keine passenden Verbindungen."
    list.replaceChildren()
    pager.replaceChildren()
    for (const {entry:other, edge} of shown) {
      const context = edge.label + (edge.number ? " · Schritt " + edge.number : "")
      const read = link(el("span", "", el("small", "", context), el("span", "row-title", other.title)), destination(edge))
      const center = link("Umfeld", destination(edge, true), {}, "control")
      center.setAttribute("aria-label", "Umfeld von " + other.title)
      list.append(el("li", "", read, center))
    }
    if (count > pageSize) {
      for (const [delta, caption] of [[-1,"Vorherige"], [1,"Weitere"]]) {
        const button = el("button", "", caption)
        button.disabled = delta < 0 ? page === 0 : offset + pageSize >= count
        button.dataset.key = "map-pager-" + delta
        button.onclick = () => {
          page += delta
          update()
          const next = [...pager.children].find(b => b.dataset.key === button.dataset.key && !b.disabled) || pager.querySelector("button:enabled")
          next?.focus({preventScroll:true})
        }
        pager.append(button)
      }
    }
    graph.hidden = !shown.length || media.matches
    note.hidden = graph.hidden
    if (graph.hidden) return
    import("../vendor/vis-network.mjs").then(({Network}) => {
      if (token !== generation || !graph.isConnected) return
      disposeGraph = drawGraph(Network, graph, entry, shown, id => {
        const group = pairs.get(id)
        if (group) go(destination(group.edge, true))
        else go({...route, map:false}, {switchView:true})
      })
    }).catch(() => {
      if (token !== generation) return
      graph.hidden = true
      note.hidden = false
      note.textContent = "Die Grafik konnte nicht geladen werden. Alle Verbindungen stehen in der Liste."
    })
  }
  input.oninput = () => { page = 0; update() }
  media.addEventListener("change", update)
  update()
  return {
    snapshot: () => ({filter:input.value, page}), refresh:update,
    destroy() { generation++; disposeGraph?.(); media.removeEventListener("change", update) }
  }
}
