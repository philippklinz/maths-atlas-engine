import {el, section, webURL} from "./dom.js"
import {destination} from "./model.js"

export function renderReading({article, entry, atlas, route, link}) {
  if (entry.proofs?.length) {
    const jumps = el("nav", "proof-jumps")
    jumps.setAttribute("aria-label", "Beweise in diesem Eintrag")
    for (const proof of entry.proofs) {
      jumps.append(link(entry.proofs.length === 1 ? "Zum Beweis" : proof.title, {id:entry.id, proof:proof.id}, {self:true}))
    }
    article.append(jumps)
  }
  if (entry.formula || entry.figure) {
    const overview = el("div", entry.formula && entry.figure ? "overview" : "overview single")
    if (entry.formula) {
      const formula = el("p", "formula")
      for (const part of entry.formula) {
        if (typeof part === "string") formula.append(part)
        else {
          const symbol = link(part.text, {id: part.ref})
          symbol.title = part.text + " · " + atlas.entries.get(part.ref).title
          symbol.setAttribute("aria-label", symbol.title)
          formula.append(symbol)
        }
      }
      overview.append(el("div", "formula-box", el("span", "label", "Formel"), formula))
    }
    if (entry.figure) {
      const figure = atlas.data.figures[entry.figure]
      const image = el("img")
      image.width = figure.width
      image.height = figure.height
      image.alt = figure.alt
      image.src = webURL(figure.src, atlas.source)
      overview.append(el("figure", "", image, el("figcaption", "caption", figure.caption)))
    }
    article.append(overview)
  }
  if (entry.notation) {
    const list = el("dl", "notation")
    for (const [symbol, definition] of entry.notation) list.append(el("dt", "", symbol), el("dd", "", definition))
    article.append(section("Zeichen", list))
  }
  const selectedProof = entry.proofs?.find(p => p.id === route.proof)
  if ((route.proof && !selectedProof) || (route.step && !selectedProof?.steps.some(s => s.id === route.step))) {
    article.append(el("p", "note", "Diese Beweisstelle ist unbekannt. Hier findest du den vollständigen Eintrag."))
  }
  for (const proof of entry.proofs || []) {
    const heading = el("h2", "", proof.title)
    const block = el("section", "proof", heading)
    block.id = "beweis-" + proof.id
    block.tabIndex = -1
    const steps = el("ol", "steps")
    proof.steps.forEach((step, i) => {
      const origin = {id: entry.id, proof: proof.id, step: step.id}
      const stamp = link("Schritt " + (i + 1), origin, {self: true}, "step-number")
      stamp.title = "Direktlink zu Schritt " + (i + 1)
      const row = el("li", "step", el("div", "step-header", stamp, el("h3", "", step.title)), el("p", "step-body", step.body))
      row.id = "schritt-" + proof.id + "-" + step.id
      row.tabIndex = -1
      if (route.proof === proof.id && route.step === step.id) row.classList.add("selected")
      if (step.formula) row.append(el("p", "step-formula", step.formula))
      for (const id of step.uses || []) {
        const helper = atlas.entries.get(id)
        const content = el("div", "reference-body", el("p", "", helper.summary))
        const actions = el("div", "actions",
          link(helper.title + " lesen", {id}, {origin}, "control"),
          link("In der Mindmap ansehen", {id, map: true}, {origin}, "control"))
        content.append(actions)
        const uses = atlas.edges.get(id).filter(edge => edge.incoming && edge.type === "use" && edge.to !== entry.id)
        if (uses.length) {
          const related = el("div", "also", el("strong", "", "Auch verwendet in"))
          const list = el("ul", "sources")
          for (const edge of uses.slice(0, 2)) {
            list.append(el("li", "", link(atlas.entries.get(edge.to).title + " · Schritt " + edge.number, destination(edge), {origin})))
          }
          related.append(list)
          if (uses.length > 2) related.append(link("Alle Verwendungen ansehen", {id, map: true}, {origin}))
          content.append(related)
        }
        const summary = el("summary", "", helper.kind + " aufklappen · " + helper.title)
        const detail = el("details", "reference", summary, content)
        detail.id = row.id + "-hilfe-" + id
        summary.dataset.key = detail.id
        row.append(detail)
      }
      steps.append(row)
    })
    block.append(steps)
    article.append(block)
  }
  if (entry.example) article.append(section("Zahlenbeispiel", el("p", "", entry.example)))
  const connections = atlas.edges.get(entry.id)
  if (connections.length) {
    const list = el("ul", "related-list")
    for (const edge of connections.slice(0, 6)) {
      const target = atlas.entries.get(edge.to)
      const context = edge.number ? edge.label + " · Schritt " + edge.number : edge.label
      list.append(el("li", "", link(el("span", "", el("small", "", context), el("span", "row-title", target.title)), destination(edge))))
    }
    const links = section("Verknüpfungen", list)
    if (connections.length > 6) links.append(link("Alle Verknüpfungen in der Mindmap", {...route, map: true}, {switchView: true}, "control"))
    article.append(links)
  }
  if (entry.sources?.length) {
    const list = el("ul", "sources")
    for (const source of entry.sources) {
      const a = el("a", "", source.label)
      a.href = webURL(source.url, atlas.source)
      list.append(el("li", "", a))
    }
    article.append(section("Quellen", list))
  }
}
