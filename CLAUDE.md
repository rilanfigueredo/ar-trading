# Ar_Trading — instrucciones para Claude (se cargan solas en cada sesión)

Usuario: hispanohablante, Windows, NO programa. Tú escribes y pruebas todo el código. Responde en español, corto y sin jerga; pasos numerados cuando deba hacer algo.
Programa: app de escritorio personal tipo TradingView (Electron + modo navegador), datos públicos de Binance. Detalle técnico completo en `docs/CONOCIMIENTO.md` (léelo solo si la tarea lo necesita).

## Flujo de trabajo (obligatorio)
1. Una sesión = una versión (la siguiente a la de `package.json`). El usuario pega su lista numerada de cambios. Aplica TODOS, hasta el último; si algo no es factible, dilo y sigue con el resto.
2. NO leas el proyecto entero. Usa el mapa de abajo + `grep` y lee solo los tramos que toques (ahorra tokens del usuario).
3. **Rama de trabajo: `actualizaciones`** (incluye las optimizaciones de GPT, el icono y el aviso de actualizaciones; `main` quedó atrás y NO se toca sin aprobación del usuario). Commits pequeños en español (`v0.7: dibujo de líneas`). No subas zips ni `node_modules`/`data`.
4. Prueba antes de entregar: `npm test` y, con datos simulados, Playwright (`TV_MOCK=1 PORT=3111 node server.js`, arrancado en una llamada aparte; no uses `pkill -f "node server.js"` en el mismo comando; patrón `[n]ode`). Ventana 1600×950, capturas, cero errores de consola. Verifica que una configuración guardada de la versión anterior migra bien (`migrate()` en `renderer/js/app.js`).
5. Cierra cada versión: sube `package.json` (versión), actualiza `LEEME.txt` (primera sección = novedades; es lo que muestra el aviso, termina con línea en blanco) y `docs/CONOCIMIENTO.md`, haz commit y push a `actualizaciones`. GitHub Actions (`publicar.yml`) prueba, compila y publica en `rilanfigueredo/ar-trading-releases`; espera a que termine (una sola espera larga, no sondeos seguidos) y confirma que la versión y `latest.yml` aparecen. El usuario recibe el aviso al abrir su programa (desde la 0.25.6); YA NO se envía zip ni .exe salvo que lo pida.
6. Sé honesto: indica qué se probó solo con datos simulados y qué NO (Binance real, Windows/Electron). Pídele que pruebe eso con pasos cortos.
7. Termina con: resumen breve, qué debe probar, pendientes surgidos.

## Reglas de calidad
- No rompas lo que funciona; cambios mínimos y verificados. Todo es **por gráfico** (`vcfg`: símbolo, tf, tipo, escala, indicadores, medias, velas, fondo, rejilla, marca de agua, orden y alturas de paneles). Global solo: tema, zona horaria, temporizador, paleta, plantillas, sincronización.
- No sustituyas en silencio una fuente de datos que falla: avisa del error.
- Lo que depende del mercado real no se da por bueno con datos simulados (lección de las velas por volumen: `docs/NOTAS_VELAS_VOLUMEN.txt`).
- Archivos grandes: `renderer/js/view.js` (~1300 líneas) y `app.js` (~1000). Si una versión requiere tocar mucho, considera dividirlos en módulos antes (pídelo como versión de mantenimiento).

## Mapa del código
- `main.js`, `preload.js` (Electron/IPC) · `server.js` (modo navegador, config en `data/config.json` + `data/win-<id>.json`) · `src/store.js` (config por ventana, v0.22) · `src/core.js` (Binance + modo simulado)
- `renderer/index.html`, `styles.css` · `renderer/vendor/lightweight-charts.js` (v5.2.1, no tocar)
- `renderer/js/lib.js`: lógica pura (temporalidades `makeTf`, `aggregate`, RSI/Estocástico/medias/pivotes) — con tests en `test/`
- `renderer/js/api.js`: puente de datos · `history.js`: caché IndexedDB de velas (`TVHistory`)
- `renderer/js/view.js`: un view por gráfico. Secciones (buscar por nombre): `syncMas`, `SUBS` (paneles RSI/Estocástico), `layoutPanes/orderPanes/snapshotHeights`, `syncIndicators`, `renderLegend`, `fetchBack/load/loadMore/poll`, `zoomAxis/showAxisMenu`, crosshair (`showCrosshairAt`), `renderWatermark`, `applyLook`, API pública `Object.assign(view,{…})` al final.
- `renderer/js/script*.js` (v0.20): motor, Worker, runner, host por gráfico, ventana (ver CONOCIMIENTO §2). v0.21: `backtest.js` (simulador puro), `btpanel.js` (panel inferior `#btPanel`: informe y operaciones); estrategias = `strategy/onBar/entry/exit` en `scriptcore.js` (CONOCIMIENTO §3).
- `servicio.js`, `src/writer.js`, `src/autostart.js` (v0.23.6, servicio 24/7) · `src/liq/*` + `renderer/js/liqmap.js` (v0.23): mapa de liquidaciones estimado (CONOCIMIENTO §3).
- `renderer/js/futureaxis.js` (v0.22): fechas del eje más allá de la última vela.
- `renderer/js/watch.js`: panel de listas de seguimiento (`TVWatch`).
- `renderer/js/app.js`: config (`defaultConfig`, `newChart`, `migrate`), `openModal` (flotante), paleta (`openPalette/decoratePalette`), `openSettings`, plantillas (`snapshotTemplate/applyTemplate`), `renderPanel` (indicadores/medias), `bindUi`.
- `renderer/funciones/registro.js` (tarjetas), `renderer/js/funciones.js` (pantalla y marcos), `renderer/funciones/<id>/` (interfaz), `renderer/funciones/comun/` (tema.css, puente.js), `renderer/tokens.css` (colores únicos), `src/funciones/puente.js` y `src/funciones/<id>/modulo.js` (v0.24; ver CONOCIMIENTO §3; v0.25 sumó `simulador` y `blockchain`). Sumar función = tarjeta + carpeta de interfaz + modulo.js. Prueba con navegador: `npm run test:e2e`.
- Depuración en el navegador: `window.__tv` (`cfg`, `views[i].bars/chart/cfg`).

## Hoja de ruta
**Número de versión: la última publicada es la 0.26.5 (perfil de usuario). La siguiente versión es la 0.26.6 (leer `package.json`).**
**Estado (v0.25.1, cerrada; el usuario descartó las v0.26.x y volvió a la v0.25.0 como oficial): pantalla de tarjetas + Noticias macro + Simulador de posiciones + Monitor de blockchain (CONOCIMIENTO §3). Siguiente chat: v0.26 = backtest con apalancamiento (antes planeado como v0.24/v0.25).** Antes (v0.23.6, cerrada): mapa de liquidaciones estimado + ajustes por pestañas + datos propios SOLO de lo irrecuperable (liquidaciones reales e interés abierto; `src/liq/store.js`, `events.js` con gzip, `writer.js`, `servicio.js` 24/7, ETH). Regla del usuario: no guardar ni mantener código de lo que se puede bajar de servidores públicos. **Siguiente chat: v0.24** (backtest con varias posiciones y apalancamiento).
Hecho: fases 1–3 (v0.1–v0.10), listas y exchanges (v0.11–v0.12), mejoras de dibujo (v0.13–v0.14), v0.17 (delta/CVD, Probar conexión, polilínea, plantillas). **Objetivo actual**: gráfico de velas de BTC de alta resolución, poco ruido y datos creíbles (operaciones reales, compra/venta, liquidaciones, OI/funding, libro de órdenes, comparación entre exchanges). NO automatizar análisis técnico (sin etiquetas BOS/CHoCH, etc.) y no preguntar definiciones de AT: el usuario lo hace. Prefiere un programa enfocado, sin funciones que no use.
Ruta acordada con el usuario (confirmada): **v0.21** núcleo del backtest (estrategias en el editor de scripts con entry('long'/'short')/exit/stop/take profit; simulador vela a vela largo y corto sin usar datos del futuro, la orden se ejecuta en la vela siguiente; tamaño editable (% capital, monto fijo o contratos); comisión por defecto basada en Binance Futuros USDT (maker 0,02 %, taker 0,05 %, a verificar en la cuenta del usuario) y deslizamiento estimado 0,01 % editable; Worker con límite de tiempo y errores con línea; marcas de entrada/salida y curva de capital en panel aparte; informe y lista de operaciones en PANEL FIJO ABAJO (clic en fila centra el gráfico); parámetros editables, replay, guardado por gráfico; 2 ejemplos). **v0.22** (hecho, pedido por el usuario, adelantado) ventanas nuevas (ahora pestañas en una sola ventana, hasta 10, config propia), Cargar diseño, desplegables, contornos, fondo #0a102a y fechas al futuro. **v0.23** (hecho, pedido por el usuario, adelantado) mapa de liquidaciones estimado (Binance + Bybit + OKX, pestaña desde el «+» y capa sobre el gráfico; `src/liq/`, `renderer/js/liqmap.js`). **v0.24** varias posiciones a la vez + apalancamiento y liquidación (margen y precio de liquidación de Binance; avisar lo no verificable con datos reales). **v0.25** optimización automática de parámetros (con prueba fuera de muestra contra sobreajuste) + misma estrategia en varios activos + exportar resultados a Excel. Cada una en su propio chat/versión.
Hecho v0.20: scripts propios (JavaScript) para indicadores (`scriptcore/worker/runner/host/ui`); Hecho v0.21: núcleo del backtest (`backtest.js`, `btpanel.js`); la ruta de v0.22–v0.23 está arriba. Hecho v0.18: velas desde operaciones reales (Binance Futuros BTCUSDT, `src/trades.js`) + filtro por tamaño. Hecho v0.19: captura de imagen y replay. Cambio de rumbo pedido por el usuario: siguiente v0.20 scripts propios (JavaScript) para indicadores y v0.21 estrategias/backtest; la huella/perfil (v0.18.1) y v0.19–v0.21 de datos quedan en pausa. Antes: v0.19 liquidaciones/OI/funding/base; v0.20 libro de órdenes + mapa de calor; v0.21 comparación multi-exchange. Antes, ver los resultados de "Probar conexión" del PC del usuario. Descartado: alertas, velas por bloque (retiradas en v0.17). Aplazado: velas por volumen, replay, espacios de trabajo, mercados no cripto.


## Control de consumo del chat (tokens gratis del usuario)
Cada respuesta vuelve a leer TODO el chat, así que un chat largo cuesta mucho más por mensaje. Claude lleva una cuenta aproximada de puntos de peso del chat (no se muestra cada vez):
- Intercambio normal: 1 · Turno con ediciones/pruebas/muchos comandos: 3
- Leer un archivo grande (>200 líneas) o un documento del proyecto: 2 (CONOCIMIENTO completo: 3)
- Ver una imagen/captura: 3 cada una · Salida larga de logs o pruebas: 2
- Reintento de arreglar el mismo error, desde el segundo: 2 · Espera de CI (cada consulta): 1
- Entregar 3 o más archivos o un instalador: 3
Reglas:
1. Al empezar una versión, si el chat ya pesa 10 puntos o más: recomendar abrir un chat nuevo ANTES de empezar.
2. A 15 puntos: una línea al final de la respuesta («Este chat ya es largo; conviene terminar la versión y seguir en uno nuevo»).
3. A 25 puntos, versión terminada, o el mismo error 3 veces: aviso GRANDE y urgente al inicio de la respuesta (con ⚠️), cerrar todo (commit, push, docs al día) y dar el mensaje listo para pegar en el chat nuevo (versión actual, rama `actualizaciones`, qué sigue).
4. Ahorrar: no releer archivos ya vistos; capturas solo si hacen falta (recortadas); una espera larga en vez de varias cortas; no repetir resúmenes; delegar lecturas masivas a un agente solo si ahorra contexto.
5. Ser honesto: son puntos estimados, Claude no ve el consumo real; si duda, avisar antes de pasarse.
