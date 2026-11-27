const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" })
export const byTitle = (a, b) => collator.compare(a.title, b.title)
export const normalize = value => value.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("ß", "ss")
export const formulaText = formula => typeof formula === "string" ? formula : (formula || []).map(part => typeof part === "string" ? part : part.text).join("")

export async function readJSON(url) {
  const response = await fetch(url, {credentials: "omit"})
  if (!response.ok) throw new Error("Die Inhaltsdatei ist nicht erreichbar (HTTP " + response.status + ").")
  return response.json()
}

export async function loadAtlas() {
  const config = await readJSON(new URL("../atlas.config.json", import.meta.url))
  const source = new URL(config.content, document.baseURI)
  const data = await readJSON(source)
  if (new URLSearchParams(location.search).get("probe") === "30" && config.probe) {
    const probe = await readJSON(new URL(config.probe, source))
    if (probe.version !== 1) throw new Error("Unbekannte Version des Testbestands.")
    data.entries = [...data.entries, ...probe.entries.map(entry => ({topic:probe.topic, ...entry}))]
  }
  return indexAtlas(data, source)
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function checkId(id, seen) {
  if (!idPattern.test(id || "") || seen.has(id)) throw new Error("Ungültige oder doppelte ID im Inhalt: " + id)
}

function indexSubjects(data, entries) {
  const areas = new Map()
  const topics = new Map()
  const entryTopics = new Map()
  // Version 1 collections originally described their subject with a single chapter.
  const definitions = data.areas ?? [{
    id:"bestand", title:data.chapter || "Mathematik", topics:[{id:"grundlagen", title:"Grundlagen"}]
  }]
  for (const definition of [...definitions].sort(byTitle)) {
    checkId(definition.id, areas)
    const area = {...definition, topics:[], count:0}
    areas.set(area.id, area)
    for (const item of [...definition.topics].sort(byTitle)) {
      checkId(item.id, topics)
      const topic = {...item, area, entries:[]}
      topics.set(topic.id, topic)
      area.topics.push(topic)
    }
  }
  const catalog = [...entries.values()].sort(byTitle).map(entry => {
    const topic = topics.get(data.areas ? entry.topic : "grundlagen")
    if (!topic) throw new Error("Unbekanntes Thema für den Eintrag " + entry.id)
    topic.entries.push(entry)
    topic.area.count++
    entryTopics.set(entry.id, topic)
    const terms = [entry.title, entry.kind, entry.summary, formulaText(entry.formula), topic.title, topic.area.title]
    return {entry, search:normalize(terms.join(" "))}
  })
  return {areas, topics, entryTopics, catalog}
}

export function indexAtlas(data, source) {
  if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error("Unbekanntes Inhaltsformat.")
  const entries = new Map()
  const edges = new Map()
  function register(id, seen) {
    checkId(id, seen)
    seen.add(id)
  }
  for (const entry of data.entries) {
    checkId(entry.id, entries)
    entries.set(entry.id, entry)
    edges.set(entry.id, [])
  }
  function connect(from, to, type, proof = "", step = "", number = 0) {
    if (!entries.has(to)) throw new Error("Unbekannter Verweis im Inhalt: " + to)
    const labels = {
      use: ["Verwendet", "Verwendet in"],
      notation: ["Zeichen erklärt in", "Zeichen verwendet in"],
      example: ["Beispiel zu", "Anwendungsbeispiel"]
    }
    if (!labels[type]) throw new Error("Unbekannte Beziehung: " + type)
    const common = {type, proof, step, number}
    edges.get(from).push({...common, to, incoming: false, label: labels[type][0]})
    edges.get(to).push({...common, to: from, incoming: true, label: labels[type][1]})
  }
  for (const entry of entries.values()) {
    const proofIds = new Set()
    for (const proof of entry.proofs || []) {
      register(proof.id, proofIds)
      const stepIds = new Set()
      proof.steps.forEach((step, i) => {
        register(step.id, stepIds)
        for (const target of new Set(step.uses || [])) connect(entry.id, target, "use", proof.id, step.id, i + 1)
      })
    }
    const symbols = Array.isArray(entry.formula) ? entry.formula.filter(part => part.ref).map(part => part.ref) : []
    for (const target of new Set(symbols)) connect(entry.id, target, "notation")
    for (const link of entry.links || []) connect(entry.id, link.to, link.relation)
    if (entry.figure && !data.figures?.[entry.figure]) throw new Error("Unbekannte Abbildung: " + entry.figure)
  }
  if (data.start && !entries.has(data.start)) throw new Error("Der Starteintrag fehlt.")
  for (const list of edges.values()) {
    const ranks = {use: 0, notation: 1, example: 2}
    list.sort((a, b) => ranks[a.type] - ranks[b.type] || byTitle(entries.get(a.to), entries.get(b.to)) || a.number - b.number)
  }
  return {data, source, entries, edges, ...indexSubjects(data, entries)}
}

export function readRoute(start) {
  const p = new URLSearchParams(location.hash.slice(1))
  const id = p.get("eintrag")
  if (!id) {
    if (p.get("thema")) return {topic:p.get("thema"), kind:p.get("typ") || ""}
    if (p.get("gebiet")) return {area:p.get("gebiet")}
    if (!start || !(p.has("beweis") || p.has("schritt") || p.get("ansicht") === "mindmap")) return {}
  }
  return {id:id || start, proof:p.get("beweis") || "", step:p.get("schritt") || "", map:p.get("ansicht") === "mindmap"}
}
export function pathFor({id, proof, step, map, area, topic, kind}) {
  const p = new URLSearchParams()
  if (id) {
    p.set("eintrag", id)
    if (proof) p.set("beweis", proof)
    if (step) p.set("schritt", step)
    if (map) p.set("ansicht", "mindmap")
  } else if (topic) {
    p.set("thema", topic)
    if (kind) p.set("typ", kind)
  } else if (area) {
    p.set("gebiet", area)
  } else {
    return location.pathname + location.search
  }
  return "#" + p
}
export function destination(edge, map = false) {
  return {id: edge.to, proof: edge.incoming ? edge.proof : "", step: edge.incoming ? edge.step : "", map}
}
