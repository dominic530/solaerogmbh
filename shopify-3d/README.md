# SOLAERO · 3D-Ansicht für Shopify

Ein Button (in der Verkaufsbox) öffnet ein zentriertes Pillen-Fenster mit unscharfem, halbtransparentem Hintergrund.
Im Fenster: Modell frei drehbar + zoombar, **Modellname unten links**, **Farb-Swatches unten rechts**. Ein Modell = eine Section.

## Datenmenge (CAPTAEN, gemessen)
| wann | was | übertragen (gzip) |
|---|---|---|
| beim Seitenaufruf | CSS + UI-Skript | ca. **4 KB** |
| erst bei Hover/Tipp/Klick auf den Button | 3D-Engine | ca. 6 KB |
| dito, nur die gewählte Farbe | Modell | ca. **340 KB** (wird beim Wechsel pro Farbe nachgeladen, danach gecacht) |

Keine Fremdbibliothek (kein three.js/model-viewer), kein externer Server. Die Engine ist ein eigenes, 15 KB kleines WebGL-Skript.
Spiegel-symmetrische Teile (Bügel, Gläser, Pads) werden nur einmal gespeichert; Modelle sind reduziert (CAPTAEN: 71 000 → ca. 25 000 Dreiecke) und 16-bit-quantisiert.

## Kompatibilität
WebGL 1.0 (Chrome, Safari inkl. iOS, Firefox, Edge, Samsung Internet; Windows, macOS, Linux, Android, iOS). Maus, Trackpad (Pinch), Touch (Ein-Finger-Drehen, Zwei-Finger-Zoom), Tastatur (Pfeile, + / −, Esc).
Ohne WebGL: freundliche Meldung (optional Ersatzbild aus den Section-Einstellungen). Barrierefrei: Dialog-Rolle, Fokus-Falle, Esc, `prefers-reduced-motion`.

## Dateien → ins Theme kopieren (Online Store → Themes → … → Code bearbeiten)
```
assets/solaero-3d.js                      Engine
assets/solaero-3d-ui.js                   Button/Fenster-Logik
assets/solaero-3d.css                     Styling
assets/solaero3d-captaen-aviator.js       Modell Gold
assets/solaero3d-captaen-black.js         Modell Black
assets/solaero3d-captaen-silver.js        Modell Silver
snippets/solaero-3d-viewer.liquid         gemeinsamer Baustein
sections/solaero-3d-captaen.liquid        Section (frei platzierbar)
blocks/solaero-3d-captaen.liquid          optional: Theme-Block für die Verkaufsbox (nur Themes mit Theme Blocks)
```
Die `.js`-Modelldateien einfach als Assets hochladen („Neue Datei hinzufügen“ → Dateien oder Code-Editor „Neue Asset“).

## Button in die Verkaufsbox setzen
* **Theme mit Theme-Blocks** (z. B. Shopify-Horizon-Themes): im Produkt-Template in der Verkaufsbox „Block hinzufügen → SOLAERO 3D · CAPTAEN“.
* **Klassische Themes (Dawn & Co.)**: Section „SOLAERO 3D · CAPTAEN“ direkt unter/über der Verkaufsbox hinzufügen **oder** in `sections/main-product.liquid` an der gewünschten Stelle (z. B. vor den Kaufbuttons) einfügen:
```liquid
{% render 'solaero-3d-viewer',
  uid: 'captaen', model_name: 'CAPTAEN', button_style: 'outline', full_width: true,
  colors: 'Gold|#d9b25f|solaero3d-captaen-aviator,Black|#161618|solaero3d-captaen-black,Silver|#c4c6cc|solaero3d-captaen-silver' %}
```
`colors` = `Name|Swatch-Hex|Modelldatei (ohne .js)`, kommagetrennt. Die erste Farbe ist die Startfarbe.

## Neues Modell bauen
```bash
pip install trimesh numpy scipy fast-simplification
python3 tools/pack_model.py ../haelo_black.glb assets/solaero3d-haelo-black.js solaero3d-haelo-black
```
Optional `--faces temple=30000,frame=6000,lens=900,pad=500` (Qualität ↔ Größe). Dann Section kopieren (`solaero-3d-captaen.liquid` → `solaero-3d-haelo.liquid`, Name/Standardfarben anpassen).

## Lokal testen
`python3 preview/render_preview.py && python3 -m http.server 8765` → http://localhost:8765/preview/index.html
