# HANDOVER – SOLAERO 3D-Viewer in den Shopify-Shop einbauen

**Auftrag für die Co-Work-Session:** Die fertig gebaute 3D-Ansicht (Button in der Verkaufsbox → Pillen-Fenster mit drehbarem 3D-Modell) im Shopify-Theme einbauen, auf der Produktseite des Modells CAPTAEN testen und nach Freigabe die übrigen Modelle nach dem gleichen Muster ergänzen.

## 1. Wo liegt alles
* Repo `dominic530/solaerogmbh`, Branch `claude/funny-mccarthy-nvn197` (kein PR angelegt), Ordner `shopify-3d/`.
* Quell-3D-Dateien (GLB, wasserdicht, 1:1 mm) liegen im Repo-Root: `captaen_aviator|black|silver.glb`, `haelo.glb|haelo_black|haelo_gold`, `straetos_black|silver`, `vaector_clear|marble|black`, `skymaester.glb|skymaester_black`, `nomaed.glb|nomaed_black|nomaed_clear`.

## 2. Was gebaut ist (Zustand: CAPTAEN fertig und getestet, Rest offen)
Dateien in `shopify-3d/` (Shopify-Theme-Struktur):
| Datei | Zweck |
|---|---|
| `assets/solaero-3d.js` (15 KB) | eigene WebGL-1.0-Engine, keine Fremdbibliothek. Orbit/Zoom (Maus, Trackpad, Touch/Pinch, Tastatur), prozedurales Studio-Licht, transparente Gläser, gespiegelte Teile |
| `assets/solaero-3d-ui.js` (6 KB) | Öffnen/Schließen, Fokus-Falle, Esc, Scroll-Lock, Swatch-Wechsel, Lazy-Loading (Engine + Modell erst bei Hover/Tippen/Klick) |
| `assets/solaero-3d.css` (6 KB) | Button, Pillen-Fenster, Blur-Scrim, Swatches, Mobil-Layout |
| `assets/solaero3d-captaen-aviator.js`, `-black.js`, `-silver.js` (je ca. 600 KB roh / 340 KB gzip) | gepackte Modelle als JS (`window.SOLAERO3D.models["<key>"]="<base64>"`) |
| `snippets/solaero-3d-viewer.liquid` | gemeinsamer Baustein (Button + Fenster-Markup) |
| `sections/solaero-3d-captaen.liquid` | Section, Farben als Blöcke (Name, Swatch-Farbe, Modell-Datei) |
| `blocks/solaero-3d-captaen.liquid` | Theme-Block-Variante für die Verkaufsbox (bis 4 Farben, nur in Themes mit Theme Blocks) |
| `tools/pack_model.py` | GLB → komprimiertes Web-Modell (`.js`) |
| `preview/render_preview.py`, `preview/index.html` | lokaler Test (Liquid-Ersatzrenderer + Testseite) |

Verhalten (Wunsch des Kunden): Button in der Verkaufsbox → Klick öffnet zentriertes Fenster im Pillen-Design, Hintergrund unscharf-transparent (`backdrop-filter`), Modell zentriert, drehbar + zoombar, **Modellname unten links**, **Farb-Swatches unten rechts**, jedes Modell eine eigene Section. Datenmenge minimal: beim Seitenaufruf nur ca. 4 KB (CSS + UI), alles Weitere erst nach Interaktion.

## 3. Einbau im Shopify-Theme (Schritte)
1. Theme duplizieren (Sicherheitskopie), dann **Code bearbeiten** (oder Shopify CLI `shopify theme push` mit dem Ordner `shopify-3d/` als Theme-Teilstruktur).
2. In **assets/** hochladen: `solaero-3d.js`, `solaero-3d-ui.js`, `solaero-3d.css` und die drei `solaero3d-captaen-*.js`.
3. In **snippets/**: `solaero-3d-viewer.liquid`. In **sections/**: `solaero-3d-captaen.liquid`. Optional in **blocks/**: `solaero-3d-captaen.liquid`.
4. **Welches Theme?** Das ist noch nicht geklärt – zuerst prüfen (Theme-Name/Version, ob `blocks/`-Ordner und Theme Blocks unterstützt werden):
   * **Theme mit Theme Blocks:** im Produkt-Template in der Verkaufsbox „Block hinzufügen → SOLAERO 3D · CAPTAEN“.
   * **Klassisches Theme (Dawn & Co.):** Section „SOLAERO 3D · CAPTAEN“ unter/über der Verkaufsbox im Produkt-Template hinzufügen, **oder** in `sections/main-product.liquid` an der Wunschstelle (z. B. vor den Kaufbuttons) einfügen:
     ```liquid
     {% render 'solaero-3d-viewer', uid: 'captaen', model_name: 'CAPTAEN', button_style: 'outline', full_width: true,
       colors: 'Gold|#d9b25f|solaero3d-captaen-aviator,Black|#161618|solaero3d-captaen-black,Silver|#c4c6cc|solaero3d-captaen-silver' %}
     ```
     `colors` = `Name|Swatch-Hex|Modelldatei ohne .js`, kommagetrennt; erste Farbe = Startfarbe.
5. Nur auf dem Produkt „CAPTAEN“ anzeigen (Section im Produkt-Template bzw. Template-Variante nur für dieses Produkt; oder per Liquid `{% if product.handle == 'captaen' %}`).

## 4. Abnahme-Checkliste (bitte alles im echten Shop prüfen)
* Seite lädt ohne Konsolenfehler; im Netzwerk-Tab werden vor dem Klick **nur** `solaero-3d.css` und `solaero-3d-ui.js` geladen.
* Klick öffnet das Fenster, Modell erscheint (Ladespinner kurz), Auto-Drehung stoppt bei Interaktion.
* Drehen per Maus/Finger, Zoom per Rad/Pinch, Doppelklick = Reset, Esc/×/Klick daneben schließt, Seite scrollt hinter dem Fenster nicht.
* Swatch-Wechsel Gold/Black/Silver lädt das jeweilige Modell; Name unten links, Swatches unten rechts.
* Mobil (iOS Safari, Android Chrome): Layout, Swatches unten links in einer Reihe, Touch-Hinweis „Zwei Finger zum Zoomen“.
* Getestet wurde bisher nur in Chromium (Desktop + iPhone-Emulation, Software-WebGL) mit Ersatz-Renderer; **Safari/Firefox, echte Geräte und das echte Shopify-Liquid sind ungetestet.**
* Wenn der Theme-Editor die Section nicht annimmt: Schema-JSON ist gültig (geprüft), `render`-Tag/`asset_url` sind Standard – Fehlermeldung des Editors auslesen.
* Asset-Größe: größte Datei ca. 600 KB; falls das Theme ein Limit meldet, `--faces` im Packer verkleinern (siehe unten).

## 5. Weitere Modelle ergänzen (nach Freigabe von CAPTAEN)
Pro Modell: Farbvarianten packen, pro Modell eine Section kopieren (`solaero-3d-captaen.liquid` → `solaero-3d-<modell>.liquid`, Name, Standardfarben, Asset-Keys ändern).
```bash
pip install trimesh numpy scipy fast-simplification
python3 tools/pack_model.py ../<datei>.glb assets/solaero3d-<modell>-<farbe>.js solaero3d-<modell>-<farbe>
# optional Qualität/Größe: --faces temple=30000,frame=6000,lens=900,pad=500
```
Geplante Sections und Farben (Swatch-Hex frei wählbar):
| Modell | Farben / GLB |
|---|---|
| CAPTAEN | Gold `captaen_aviator`, Black `captaen_black`, Silver `captaen_silver` (**fertig**) |
| HAELO | Silver `haelo`, Black `haelo_black`, Gold `haelo_gold` |
| STRAETOS | Black `straetos_black`, Silver `straetos_silver` |
| VAECTOR | Clear `vaector_clear`, Marble `vaector_marble`, Black `vaector_black` |
| SKYMAESTER | Marble/Gold `skymaester`, Black `skymaester_black` |
| NOMAED | Marble `nomaed`, Black `nomaed_black`, Clear `nomaed_clear` |

**Wichtig – noch nicht in der Engine:** die Marmor-Modelle (`vaector_marble`, `skymaester`, `nomaed`) nutzen eine Havanna-Textur (2048², UV pro Vertex). `pack_model.py` und `solaero-3d.js` unterstützen bisher nur Vollfarben. Vor diesen drei Modellen: Textur (z. B. 1024² JPEG/WebP als Data-URI im Modell-JS, UVs als Uint16) ergänzen und im Fragment-Shader als `uCol` mitsampeln. Transparente Klar-Varianten (Alpha, doppelseitig) sind bereits unterstützt.

## 6. Bekannte Grenzen / offene Punkte
* Modelle sind für das Web reduziert (CAPTAEN ca. 71 000 → 25 000 Dreiecke); Streifen/Logo am Bügel bleiben lesbar, extremes Heranzoomen zeigt leicht gröbere Kanten.
* Beleuchtung ist prozedural (kein HDRI) – Look bei Bedarf in `solaero-3d.js` (Funktion `env` im Fragment-Shader) anpassen.
* Texte (DE) stehen in den Section-Einstellungen: Button-Text „In 3D ansehen“, Hinweis „Ziehen zum Drehen · Scrollen zum Zoomen“, Touch-Hinweis „… Zwei Finger zum Zoomen“, Fehlermeldungen im Snippet (`data-nowebgl`, `data-error`).
* Kein Ersatzbild hinterlegt: für Geräte ohne WebGL optional ein Produktfoto in der Section („Ersatzbild“) setzen.
* Das Fenster hängt beim Öffnen an `<body>` (z-index 2147483000), damit Themes mit `transform`/`overflow` es nicht abschneiden.
* Offene Rückfragen an den Kunden: Theme-Name, Gefällt das Design/Texte, Freigabe für die übrigen Sections.

## 7. Schnelltest lokal
```bash
cd shopify-3d && python3 preview/render_preview.py && python3 -m http.server 8765
# http://localhost:8765/preview/index.html
```
