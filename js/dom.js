export function el(tag, className, ...children) {
  const element = document.createElement(tag)
  if (className) element.className = className
  element.append(...children)
  return element
}
export function section(title, ...children) {
  return el("section", "section", el("h2", "", title), ...children)
}
export function webURL(value, base) {
  const url = new URL(value, base)
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Ungültige URL im Inhalt.")
  return url.href
}
export function figureImage(figure, source, loading = "eager") {
  const image = el("img")
  image.alt = figure.alt
  image.width = figure.width
  image.height = figure.height
  image.loading = loading
  image.src = webURL(figure.src, source)
  return image
}
