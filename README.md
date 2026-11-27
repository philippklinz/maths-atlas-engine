# Maths Atlas Engine

Statische Leseansicht und interaktive Mindmap für den [Maths Atlas Content](https://github.com/philippklinz/maths-atlas-content). Die erste Navigationsprobe verbindet zwei Geometriebeweise über ein gemeinsam verwendetes Lemma.

## Starten

Im Verzeichnis der Engine `python3 -m http.server 8000` ausführen und `http://localhost:8000/` öffnen. Die Dateien lassen sich auch direkt aus dem Stammverzeichnis mit GitHub Pages ausliefern. Der Browser lädt den Content über die in `atlas.config.json` festgelegte URL.

Für vollständig lokale Arbeit beide Repos nebeneinander auschecken, im gemeinsamen Elternverzeichnis den HTTP-Server starten und `/maths-atlas-engine/` öffnen. Als Content-URL in `atlas.config.json` dann `../maths-atlas-content/atlas.json` eintragen. Relative Bild- und Ergänzungspfade werden gegen die Content-URL aufgelöst.

## Am Handy ausprobieren

Die Startseite zeigt die Themenauswahl. Wähle **Geometrie → Rechtwinklige Dreiecke → Höhensatz**. Im aufklappbaren Verzeichnis findest du dieselben Gebiete und Themen sowie die atlasweite Suche nach Titeln, Begriffen und Formeln. Im Thema kannst du die Einträge nach ihrer Art filtern.

Öffne den Beweis des Höhensatzes. Finde heraus, warum die Dreiecke im zweiten Schritt ähnlich sind, in welchem weiteren Beweis dieselbe Begründung auftaucht und wie du zu deiner Lesestelle zurückkommst. Mit `?probe=30` nimmt das Verzeichnis zusätzliche Zahlenbeispiele auf.

Gebiete, Themen und Eintragsartfilter haben eigene Adressen, zum Beispiel `#thema=rechtwinklige-dreiecke&typ=Satz`. Einträge, Beweise, Beweisschritte und die gewählte Ansicht sind direkt verlinkbar. Zum Beispiel führt `#eintrag=hoehensatz&beweis=aehnlichkeit&schritt=dreiecke-vergleichen` zum Vergleich der beiden Teildreiecke.

## Browser-Ressourcen

Die Engine besteht aus HTML, CSS und JavaScript-Modulen. Die Mindmap lädt das lokale vis-network 10.1.5 erst beim ersten Öffnen. Herkunft und Lizenztexte stehen in `vendor/NOTICES.txt`. Die Schriftdateien stammen aus [LiberationFontsWeb](https://github.com/philippklinz/LiberationFontsWeb), ihre Lizenz liegt in `assets/fonts/LICENSE`.

## Gestaltung und Prüfung

Die Oberfläche folgt der [praktischen Modern-Objectivity-Vorlage](https://github.com/philippklinz/modern-objectivity-style). Leseansicht und Mindmap teilen Verzeichnis, Ansichtswechsel und Rücksprung. Die Komponenten verwenden die semantischen Hell-/Dunkel-Farben, eckige Konturen und dieselbe Mindesthöhe von 2,75 rem. Links sind unterstrichen, der Fokus erhält eine eigene Kontur. Unter jeder Karte bietet eine Tastaturliste dieselben Ziele und Fundstellen an. Der Pilotbestand und die Bedienoberfläche sind deutschsprachig.

Mit benachbartem Content-Checkout, Python, Playwright und Chromium läuft der Navigationstest über `python3 tests/navigation.py`. Für ein vorhandenes Chromium kann `CHROME_BIN` auf die ausführbare Datei zeigen. Der Test schaltet die Content-Quelle auf den lokalen HTTP-Server um.
