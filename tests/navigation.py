"""Smoke test for a checkout with maths-atlas-content beside maths-atlas-engine."""
import functools
import json
import os
import threading
import unittest
from copy import deepcopy
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


class QuietServer(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class AtlasNavigation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        engine = Path(__file__).resolve().parents[1]
        content = engine.parent / "maths-atlas-content"
        cls.collection = json.loads((content / "atlas.json").read_text())
        cls.probe_entries = json.loads((content / "navigationsprobe.json").read_text())["entries"]
        handler = functools.partial(QuietServer, directory=str(engine.parent))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/{engine.name}/"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(executable_path=os.environ.get("CHROME_BIN"))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def new_page(self, width, **options):
        context = self.browser.new_context(viewport={"width": width, "height": 780}, **options)
        self.addCleanup(context.close)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.addCleanup(self.assertEqual, errors, [])
        config = {"content": "../maths-atlas-content/atlas.json", "probe": "navigationsprobe.json"}
        page.route("**/atlas.config.json", lambda route: route.fulfill(json=config))
        return page

    def test_round_trip(self):
        for width in [320, 390, 1180]:
            with self.subTest(width=width):
                page = self.new_page(width, has_touch=width < 500)
                requests = []
                page.on("request", lambda r: requests.append(r.url))
                page.goto(self.url)
                expect(page.get_by_role("heading", level=1)).to_have_text("Themenauswahl")
                article = page.locator("article")
                expect(article.locator("h2")).to_have_count(len(self.collection["areas"]))
                expect(article.get_by_role("heading", name="Algebra", exact=True)).to_be_visible()
                self.assertEqual(page.locator("a[href*='eintrag=']").count(), 0)
                article.get_by_role("link", name="Geometrie").click()
                article.get_by_role("link", name="Rechtwinklige Dreiecke").click()
                article.locator("a[href='#eintrag=hoehensatz']").click()
                expect(page.get_by_role("heading", level=1)).to_have_text("Höhensatz")
                expect(article.locator("figure img")).to_be_visible()
                expect(article.get_by_role("heading", name="Zahlenbeispiel")).to_be_visible()
                expect(article.get_by_role("heading", name="Verknüpfungen")).to_be_visible()
                article.get_by_role("link", name="Zum Beweis").click()
                expect(page.locator(".proof h2")).to_be_in_viewport()
                self.assertFalse(any("/vendor/" in url for url in requests))
                step = page.locator("#schritt-aehnlichkeit-dreiecke-vergleichen")
                step.locator("summary").click()
                open_map = step.get_by_role("link", name="In der Mindmap ansehen")
                open_map.focus()
                before = step.evaluate("(node) => node.getBoundingClientRect().top")
                open_map.click()
                expect(page.get_by_role("heading", level=1)).to_have_text("Ähnlichkeitslemma")
                expect(page.locator(".graph canvas")).to_be_visible()
                expect(page.get_by_role("status")).to_have_text("1–3 von 3 Verbindungen")
                link = page.locator(".related-list").get_by_role("link", name="Verwendet in · Schritt 2 Kathetensatz")
                link.click()
                expect(page.get_by_role("heading", level=1)).to_have_text("Kathetensatz")
                expect(page.locator(".step.selected")).to_contain_text("Das große Dreieck")
                page.reload()
                back = page.get_by_role("link", name="Zurück zu Höhensatz · Schritt 2")
                expect(back).to_be_visible()
                self.assertGreaterEqual(back.bounding_box()["y"], 0)
                self.assertLess(back.bounding_box()["y"] + back.bounding_box()["height"], 780)
                back.click()
                expect(page.get_by_role("heading", level=1)).to_have_text("Höhensatz")
                expect(step.locator("details")).to_have_attribute("open", "")
                expect(open_map).to_be_focused()
                self.assertLess(abs(step.evaluate("(node) => node.getBoundingClientRect().top") - before), 5)
                page.go_back()
                expect(page.get_by_role("heading", level=1)).to_have_text("Kathetensatz")
                page.go_forward()
                expect(open_map).to_be_focused()
                self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                page.close()

    def test_dense_map_and_keyboard(self):
        page = self.new_page(360)
        page.goto(self.url + "?probe=30#eintrag=aehnlichkeitslemma&ansicht=mindmap")
        status = page.get_by_role("status")
        expect(status).to_have_text("1–4 von 33 Verbindungen")
        expect(page.locator(".graph canvas")).to_be_visible()
        expected_count = len(self.collection["entries"]) + len(self.probe_entries)
        expect(page.locator("#entry-count")).to_have_text(f"{expected_count} Einträge")
        expect(page.locator("#catalog .catalog-row")).to_have_count(0)
        page.get_by_role("button", name="Weitere").focus()
        page.keyboard.press("Enter")
        expect(status).to_have_text("5–8 von 33 Verbindungen")
        search = page.get_by_role("searchbox", name="Verbindungen filtern")
        search.fill("nicht vorhanden")
        expect(status).to_have_text("Keine passenden Verbindungen.")
        search.fill("30 cm")
        expect(status).to_have_text("1–1 von 1 Verbindungen")
        page.get_by_role("link", name="Umfeld von Ähnliche Dreiecke bei h = 30 cm").click()
        expect(page.get_by_role("heading", level=1)).to_have_text("Ähnliche Dreiecke bei h = 30 cm")
        page.go_back()
        expect(search).to_have_value("30 cm")
        expect(page.get_by_role("status")).to_have_text("1–1 von 1 Verbindungen")

    def test_style_and_entry_points(self):
        page = self.new_page(390, color_scheme="dark", reduced_motion="reduce")
        page.goto(self.url + "#eintrag=kathetensatz&beweis=aehnlichkeit&schritt=dreiecke-vergleichen")
        expect(page.locator(".step.selected")).to_contain_text("Das große Dreieck")
        expect(page.locator("html")).to_have_attribute("data-scheme", "dark")
        page.locator("#theme").select_option("light")
        expect(page.locator("html")).to_have_attribute("data-scheme", "light")
        page.locator("#directory > summary").click()
        page.locator("#catalog-search").fill("Verhältnis")
        expect(page.locator("#catalog")).to_contain_text("Verhältnisgleichung")
        controls = page.locator("#theme, #catalog-search, #directory > summary, .views .control")
        for height, radius in controls.evaluate_all("(els) => els.map(e => [e.getBoundingClientRect().height, getComputedStyle(e).borderRadius])"):
            self.assertEqual(height, 44)
            self.assertEqual(radius, "0px")
        page.locator("#catalog-search").fill("xyzxyz")
        expect(page.locator("#catalog-results").get_by_role("status")).to_have_text("Keine passenden Einträge.")
        page.goto(self.url + "#eintrag=unbekannt")
        expect(page.get_by_role("heading", level=1)).to_have_text("Eintrag nicht gefunden")
        page.get_by_role("link", name="Zur Themenauswahl").click()
        expect(page.get_by_role("heading", level=1)).to_have_text("Themenauswahl")
        page.goto(self.url + "#eintrag=hoehensatz&beweis=aehnlichkeit&schritt=unbekannt")
        expect(page.locator(".note").last).to_contain_text("Diese Beweisstelle ist unbekannt")

    def test_directory_filter_and_global_search(self):
        page = self.new_page(390)
        page.goto(self.url)
        expect(page.get_by_role("heading", level=1)).to_have_text("Themenauswahl")
        directory = page.locator("#directory")
        directory.locator(":scope > summary").click()
        directory.get_by_text("Geometrie", exact=True).focus()
        page.keyboard.press("Enter")
        directory.get_by_role("link", name="Rechtwinklige Dreiecke").click()
        expect(page.get_by_role("heading", level=1)).to_have_text("Rechtwinklige Dreiecke")
        triangles = [entry for entry in self.collection["entries"] if entry["topic"] == "rechtwinklige-dreiecke"]
        expect(page.locator(".topic-results .catalog-row")).to_have_count(min(20, len(triangles)))
        kinds = page.get_by_label("Eintragsart")
        kinds.select_option("Satz")
        expect(page.locator(".topic-results .result-title")).to_have_text(["Höhensatz", "Kathetensatz", "Satz des Pythagoras"])
        page.reload()
        expect(kinds).to_have_value("Satz")
        directory.locator(":scope > summary").click()
        search = directory.get_by_role("searchbox", name="Atlasweit suchen")
        search.fill("verhaltnisgleichung")
        hit = directory.get_by_role("link", name="Verhältnisgleichung", exact=False)
        expect(hit).to_contain_text("Algebra / Verhältnisse und Gleichungen")
        hit.click()
        expect(page.get_by_role("heading", level=1)).to_have_text("Verhältnisgleichung")
        expect(page.locator("#breadcrumbs a")).to_have_text(["Themenauswahl", "Algebra", "Verhältnisse und Gleichungen"])
        page.go_back()
        expect(kinds).to_have_value("Satz")
        expect(search).to_have_value("verhaltnisgleichung")
        expect(hit).to_be_focused()
        search.fill("")
        expect(directory.locator("details[data-area='geometrie']")).to_have_attribute("open", "")
        expect(page.locator("html")).to_have_js_property("scrollWidth", 390)

    def test_large_and_legacy_collection(self):
        page = self.new_page(320)
        fixture = deepcopy(self.collection)
        fixture["areas"].append({"id": "lastprobe", "title": "Lastprobe", "topics": [{"id": "probedaten", "title": "Probedaten"}]})
        fixture["entries"] += [
            {"id": f"probe-{i}", "topic": "probedaten", "kind": "Beispiel",
             "title": f"Probe {i}", "summary": "Zahlenbeispiel"}
            for i in range(1, 2001)
        ]
        page.route("**/atlas.json", lambda route: route.fulfill(json=fixture))
        page.goto(self.url)
        total = len(fixture["entries"])
        expect(page.locator("#entry-count")).to_have_text(f"{total} Einträge")
        expect(page.locator("a[href*='eintrag=']")).to_have_count(0)
        page.goto(self.url + "#thema=probedaten&typ=Beispiel")
        entries = page.locator(".topic-results")
        expect(entries.locator(".catalog-row")).to_have_count(20)
        entries.get_by_role("button", name="Weitere").click()
        expect(entries.get_by_role("status")).to_have_text("21–40 von 2000 Einträgen")
        entries.get_by_role("link", name="Probe 21 Beispiel", exact=True).click()
        page.go_back()
        expect(entries.get_by_role("link", name="Probe 21 Beispiel", exact=True)).to_be_focused()
        page.locator("#directory > summary").click()
        page.get_by_role("searchbox", name="Atlasweit suchen").fill("Probe")
        expect(page.locator("#catalog-results .catalog-row")).to_have_count(20)
        expect(page.locator("#catalog-results").get_by_role("status")).to_have_text("1–20 von 2000 Einträgen")
        del fixture["areas"]
        for entry in fixture["entries"]:
            del entry["topic"]
        page.goto(self.url)
        page.locator("article").get_by_role("link", name=fixture["chapter"]).click()
        page.locator("article").get_by_role("link", name="Grundlagen").click()
        expect(page.locator(".topic-results").get_by_role("status")).to_have_text(f"1–20 von {total} Einträgen")

    def test_constant_map_and_cross_subject_proof(self):
        page = self.new_page(390, has_touch=True)
        page.goto(self.url)
        article = page.locator("article")
        article.get_by_role("link", name="Arithmetik", exact=True).click()
        article.get_by_role("link", name="Zahlen und Konstanten", exact=True).click()
        article.locator("a[href='#eintrag=pi']").click()
        expect(page.get_by_role("heading", level=1)).to_have_text("Kreiszahl Pi (π)")
        page.get_by_role("link", name="Mindmap", exact=True).click()
        expect(page.locator(".graph canvas")).to_be_visible()
        page.get_by_role("button", name="Weitere").click()
        search = page.get_by_role("searchbox", name="Verbindungen filtern")
        search.fill("Zylinder")
        result = article.locator(".related-list a[href='#eintrag=zylindervolumen']")
        expect(result).to_contain_text("Volumen eines Zylinders")
        result.click()
        expect(page.locator("#breadcrumbs a")).to_have_text(["Themenauswahl", "Geometrie", "Zylinder"])
        page.go_back()
        expect(search).to_have_value("Zylinder")
        expect(result).to_be_focused()

        page.goto(self.url + "#eintrag=kreisring&beweis=flaechendifferenz&schritt=faktorisieren")
        step = page.locator(".step.selected")
        step.locator("summary").click()
        helper = step.get_by_role("link", name="Differenz zweier Quadrate lesen")
        helper.click()
        expect(page.locator("#breadcrumbs a")).to_have_text(["Themenauswahl", "Algebra", "Terme und Wurzeln"])
        page.get_by_role("link", name="Zurück zu Fläche eines Kreisrings · Schritt 2").click()
        expect(step.locator("details")).to_have_attribute("open", "")
        expect(helper).to_be_focused()
        expect(page.locator("html")).to_have_js_property("scrollWidth", 390)


if __name__ == "__main__":
    unittest.main()
