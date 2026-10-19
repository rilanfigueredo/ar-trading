# Ar_Trading — instrucciones para Claude (se cargan solas en cada sesión)

Usuario: hispanohablante, Windows, NO programa. Tú escribes y pruebas todo el código. Responde en español, corto y sin jerga; pasos numerados cuando deba hacer algo.
Programa: app de escritorio personal tipo TradingView (Electron + modo navegador), datos públicos de Binance. Detalle técnico completo en `docs/CONOCIMIENTO.md` (léelo solo si la tarea lo necesita).

## Flujo de trabajo (obligatorio)
1. Una sesión = una versión (la siguiente a la de `package.json`). El usuario pega su lista numerada de cambios. Aplica TODOS, hasta el último; si algo no es factible, dilo y sigue con el resto.
2. NO leas el proyecto entero. Usa el mapa de abajo + `grep` y lee solo los tramos que toques (ahorra tokens del usuario).
3. Trabaja en la rama `main`, con commits pequeños en español (`v0.7: dibujo de líneas`). No subas zips ni `node_modules`/`data`.
4. Prueba antes de entregar: `npm test` y, con datos simulados, Playwright (`TV_MOCK=1 PORT=3111 node server.js`, arrancado en una llamada aparte; no uses `pkill -f "node server.js"` en el mismo comando; patrón `[n]ode`). Ventana 1600×950, capturas, cero errores de consola. Verifica que una configuración guardada de la versión anterior migra bien (`migrate()` en `renderer/js/app.js`).
5. Cierra cada versión: sube `package.json` (versión), actualiza `LEEME.txt` (novedades) y `docs/CONOCIMIENTO.md` (§3 funciones, §8 historial, §9 pendientes si cambian), haz commit y push. Genera el zip de entrega con `bash tools/empaquetar.sh` y envíaselo al usuario (SendUserFile) — es lo que instala en su PC.
6. Sé honesto: indica qué se probó solo con datos simulados y qué NO (Binance real, Windows/Electron). Pídele que pruebe eso con pasos cortos.
7. Termina con: resumen breve, qué debe probar, pendientes surgidos.

## Reglas de calidad
- No rompas lo que funciona; cambios mínimos y verificados. Todo es **por gráfico** (`vcfg`: símbolo, tf, tipo, escala, indicadores, medias, velas, fondo, rejilla, marca de agua, orden y alturas de paneles). Global solo: tema, zona horaria, temporizador, paleta, plantillas, sincronización.
- No sustituyas en silencio una fuente de datos que falla: avisa del error.
- Lo que depende del mercado real no se da por bueno con datos simulados (lección de las velas por volumen: `docs/NOTAS_VELAS_VOLUMEN.txt`).
- Archivos grandes: `renderer/js/view.js` (~1300 líneas) y `app.js` (~1000). Si una versión requiere tocar mucho, considera dividirlos en módulos antes (pídelo como versión de mantenimiento).

## Mapa del código
- `main.js`, `preload.js` (Electron/IPC) · `server.js` (modo navegador, config en `data/config.json`) · `src/core.js` (Binance + modo simulado)
- `renderer/index.html`, `styles.css` · `renderer/vendor/lightweight-charts.js` (v5.2.1, no tocar)
- `renderer/js/lib.js`: lógica pura (temporalidades `makeTf`, `aggregate`, RSI/Estocástico/medias/pivotes) — con tests en `test/`
- `renderer/js/api.js`: puente de datos · `history.js`: caché IndexedDB de velas (`TVHistory`)
- `renderer/js/view.js`: un view por gráfico. Secciones (buscar por nombre): `syncMas`, `SUBS` (paneles RSI/Estocástico), `layoutPanes/orderPanes/snapshotHeights`, `syncIndicators`, `renderLegend`, `fetchBack/load/loadMore/poll`, `zoomAxis/showAxisMenu`, crosshair (`showCrosshairAt`), `renderWatermark`, `applyLook`, API pública `Object.assign(view,{…})` al final.
- `renderer/js/watch.js`: panel de listas de seguimiento (`TVWatch`).
- `renderer/js/app.js`: config (`defaultConfig`, `newChart`, `migrate`), `openModal` (flotante), paleta (`openPalette/decoratePalette`), `openSettings`, plantillas (`snapshotTemplate/applyTemplate`), `renderPanel` (indicadores/medias), `bindUi`.
- Depuración en el navegador: `window.__tv` (`cfg`, `views[i].bars/chart/cfg`).

## Hoja de ruta
Hecho: fases 1–3 (v0.1–v0.10) y de la fase 4: listas de seguimiento y más exchanges (Bybit, KuCoin) en v0.11. **Fase 4 restante**: perfil de volumen, replay, espacios de trabajo, exportar imagen, mercados no cripto. Descartado: alertas. Aplazado: velas por volumen.
