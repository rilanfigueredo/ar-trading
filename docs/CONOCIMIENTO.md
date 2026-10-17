# CONOCIMIENTO DEL PROYECTO — Ar_Trading
(Sube este archivo a "Conocimiento del proyecto". Resume todo lo aprendido y decidido hasta la v0.6.)

## 1. Qué es
Programa de escritorio personal tipo TradingView, instalable en Windows (Electron) con modo navegador de respaldo (`server.js`). Datos de Binance (API pública y gratuita, REST con consultas periódicas: 1 s para temporalidades < 1 min, 3 s para el resto). Idioma de la interfaz: español. Usuario: no programador.
Instalación del usuario: instalar Node.js LTS → `instalar.bat` → `iniciar.bat` (o `iniciar_navegador.bat`); `crear_instalador.bat` genera el .exe (electron-builder).

## 2. Estructura del código (carpeta `ar-trading`)
- `main.js`, `preload.js`: Electron; IPC para klines, aggTrades, símbolos y configuración.
- `server.js`: servidor local para el modo navegador (puerto 3000; `TV_MOCK=1` activa datos simulados; `PORT` cambia el puerto). Guarda la config en `data/config.json`.
- `src/core.js`: cliente Binance con respaldo de hosts, `klines`, `symbols`, `aggTrades` (para volumen) y todo el modo de datos simulados.
- `renderer/index.html`, `styles.css`: interfaz. CSP estricta (`default-src 'self'`).
- `renderer/js/lib.js`: lógica pura sin interfaz (temporalidades, agregación de velas, RSI/Estocástico/medias/pivotes, constructores de velas por volumen). Cubierta por `test/`.
- `renderer/js/api.js`: puente Electron/navegador.
- `renderer/js/history.js`: caché local IndexedDB de bloques de 1000 velas cerradas (`TVHistory.fetchBack/warm`).
- `renderer/js/view.js` (grande): un "view" por gráfico: serie principal, paneles, medias, pivotes, leyendas, cruz sincronizada, temporizador, marca de agua, zoom de ejes, menú de eje, maximizar.
- `renderer/js/draw.js`: **dibujos (sin DOM, con tests)**: tipos (`TYPES`), valores por defecto, geometría en píxeles (`geom`: rectas con extensión, rayo, canal, Fibonacci, distancia de toque, duración) y el **almacén** (`createStore`: lista por activo, selección, herramienta activa, deshacer/rehacer, duplicar, estilo recordado por tipo).
- `renderer/js/drawlayer.js`: capa de un gráfico: primitiva de la serie principal (pinta en el panel de precios y etiquetas de precio de las horizontales) + ratón (crear, seleccionar, arrastrar, tiradores, imán, editor de texto interno). `view.js` le pasa un `env` con las conversiones tiempo/precio ↔ píxel.
- `renderer/js/drawui.js`: barra lateral con menús y favoritos, barra del objeto seleccionado, ventana de propiedades (Fibonacci con niveles), panel Objetos, menú de clic derecho y atajos.
- `renderer/js/app.js`: estado global, configuración, barra superior, selector de diseño, panel de indicadores, Ajustes (ventana movible), paleta, plantillas, migración de configuración.
- `renderer/assets/`: logos (horizontal/vertical × oscuro/claro).
- `renderer/vendor/lightweight-charts.js`: TradingView Lightweight Charts **5.2.1** (incluida, no se descarga).
- `LEEME.txt` (novedades + instalación), `docs/NOTAS_VELAS_VOLUMEN.txt`, `test/`.

## 3. Funciones actuales (v0.7)
- Símbolos de Binance spot, favoritos, tipos Velas/Línea/Área, escala Normal/Log/%, Auto.
- **Temporalidades personalizables desde 1 segundo** (botón "+", unidades s/m/h/d/w/M); se arman agregando velas base de Binance (1s,1m,…,1w,1M). Ids: `s:N`, `m:N`, `h`→m, `d:N`, `w:N`, `M:N`.
- **Varios gráficos**: diseños 1, 2 lado a lado, 2 apilados, 3, 4. Cada gráfico tiene su propio símbolo, temporalidad, tipo, escala, indicadores, medias, estilo de velas, fondo, rejilla y marca de agua (objeto de configuración `vcfg` por gráfico). Cruz y tiempo sincronizables entre gráficos (cruz exacta en horizontal y vertical, entre temporalidades distintas).
- Doble clic: con varios gráficos maximiza; con uno (o maximizado) oculta/muestra paneles de indicadores (no medias ni pivotes). Botón de maximizar por gráfico; `Esc` restaura.
- Eje de precio: rueda = zoom vertical, clic derecho = Invertir escala / Escala automática. Temporizador de cierre de vela bajo el precio.
- **Indicadores**: solo RSI, Estocástico (paneles aparte, con niveles/colores/estilos/fondo editables, altura persistente, flechas ▲▼ para reordenar, zoom con la rueda), Pivotes (clásicos/Fibonacci) y Medias móviles (grupos EMA y SMA con interruptor; por defecto EMA 59 azul y SMA 249 roja; grosor editable).
- **Ajustes** (ventana movible sin velo): tema claro/oscuro, zona horaria, temporizador; por gráfico: fondo, rejillas, estilo de velas (cuerpo/contorno/mecha), marca de agua (ticker, intervalo, descripción, nombre, logo; color y transparencia), **plantillas** de gráfico, **paleta de colores propia** (botón ▾ junto a cada selector de color).
- **Historial local** (IndexedDB) con descarga en segundo plano.
- **Dibujos (v0.7)**: línea de tendencia (extensión izq./der.), horizontal (etiqueta en el eje de precios), rayo, canal paralelo (3 puntos), polilínea, Fibonacci (niveles editables: valor, color, activo; fondo, precio, extensiones), rectángulo, texto (editor interno, `prompt()` no existe en Electron) y regla (efímera, no se guarda). Imán a A/M/m/C (40 px), modo "mantener herramienta", ocultar todos, bloquear/ocultar/duplicar, deshacer/rehacer (por activo, 60 pasos), árbol de objetos, barra de favoritos, barra del objeto seleccionado, atajos Alt+T/H/F/R. Se guardan **por activo** en `cfg.drawings[símbolo]` (puntos en tiempo y precio reales: valen en cualquier temporalidad y gráfico del mismo activo). Preferencias globales en `cfg.draw` (`favs, magnet, keep, favBar, hideAll, styles`). No se dibuja en velas por volumen.
- Configuración guardada y migrada entre versiones (`migrate()` en app.js, `cfg.version`).

## 4. Decisiones de diseño tomadas
- Un gráfico = un objeto de configuración independiente; nada global salvo tema, zona horaria, temporizador, paleta, plantillas y sincronización.
- Defaults de TradingView en indicadores. Rejilla y marca de agua apagadas por defecto.
- Marca de agua: "descripción" = `BASE / QUOTE · Binance`; el logo conserva colores (solo transparencia).
- Orden de paneles en `vcfg.order` (`main`, `rsi`, `stoch`); alturas en `vcfg.paneH` (factores de estiramiento).
- Alertas: eliminadas del alcance. Velas por volumen: desactivadas.

## 5. Datos técnicos clave (para no redescubrirlos)
- **Dibujos**: cada punto es `{t, p}` con `t` = segundos reales (el centro de la vela al usar imán) y `p` = precio. Conversión a píxeles con `logicalAtTime/xOfLogical` (lineal, extrapola a la derecha de la última vela) y `series.priceToCoordinate` (vale en Normal/Log/%). El pintado es una *primitiva* de la serie principal (se repinta sola con zoom/arrastre/escala); hay que soltarla y volver a engancharla al recrear la serie (`buildMainSeries`). El ratón se captura en `host` en fase de captura (`stopPropagation`) solo cuando hay herramienta o se toca un dibujo; así el gráfico no se desplaza al dibujar. Convención Fibonacci: nivel 0 en el segundo punto, 1 en el primero.
- Lightweight Charts v5: paneles con `addSeries(def, opts, paneIndex)`, `chart.panes()`, `swapPanes`, `removePane`, `pane.setStretchFactor/getStretchFactor`, `pane.getHTMLElement()`; primitivas de serie para rellenos y pivotes; `autoscaleInfoProvider` fijo 0–100 para osciladores.
- `timeScale().logicalToCoordinate()` devuelve 0 con valores fraccionarios → usar referencia entera + `barSpacing`.
- La barra i ocupa el intervalo lógico [i-0.5, i+0.5] ↔ tiempo [t_i, t_i+duración]: se usa para sincronizar la cruz con exactitud entre temporalidades.
- `Object.assign(view,{get x(){}})` congela getters → usar `Object.defineProperties`.
- Al actualizar series en vivo no se puede actualizar una vela anterior a la última ("Cannot update oldest data").
- Klines de 1 s existen en Binance spot, pero faltan los segundos sin operaciones (huecos); por eso el caché por bloques comprueba con `endTime` si realmente hay datos anteriores antes de dar el historial por terminado.
- Binance: tope 1000 velas por petición; límite de peso por minuto → no abusar de peticiones paralelas (el caché y el calentamiento van con pausas).

## 6. Cómo se prueba (receta)
1. `cd ar-trading && TV_MOCK=1 PORT=3111 node server.js` (arrancar el servidor en una llamada aparte; no matarlo con `pkill -f "node server.js"` en el mismo comando — usar patrón `[n]ode`).
2. Playwright (Chromium ya instalado, no ejecutar `playwright install`), ventana 1600×950; capturar pantallas; escuchar `console` y `pageerror`.
3. Depuración: `window.__tv` expone `cfg`, `views` (cada view tiene `bars`, `chart`, `cfg`).
4. Tras probar con un diseño de 3 o 4 gráficos, volver al diseño 1 antes de las pruebas de coordenadas del eje (la ventana guarda el diseño).
5. `npm test` (lib + indicadores + dibujos). Dibujos con Playwright: `python3 tools/prueba_dibujos.py` y `python3 tools/prueba_dibujos_extra.py` (con el servidor simulado en marcha; usan `bypass_csp` porque la CSP prohíbe `eval`). Entregar sin `data/` ni `node_modules`.
6. Esperar que la barra superior pase a dos filas en pantallas < ~1600 px con varios gráficos (aceptado).

## 7. Lecciones del historial del proyecto
- **Velas por volumen (v0.4) fracasaron en datos reales**: poco historial, lentitud (miles de operaciones por vela), cambio silencioso Spot/Futuros, y se probó solo con simulación. Plan correcto en `docs/NOTAS_VELAS_VOLUMEN.txt` (archivos diarios de data.binance.vision, WebSocket aggTrade, mercado fijo, botón de prueba de conexión). Aprendizaje: **probar primero con datos reales lo que depende del mercado**, y avisar al usuario cuando no se pueda.
- El usuario valora: exactitud ("milimétrica"), independencia por gráfico, control total de colores/estilos, rapidez al mover el gráfico, y que se apliquen TODOS sus cambios.
- El usuario escribe en mayúsculas y por listas numeradas: cada punto es un requisito; hay que cubrirlos todos y reportar uno por uno.

## 8. Historial de versiones
- v0.1/0.2 Fase 1 (base): gráfico, símbolos, temporalidades personalizadas, tipos, escalas, estilo de velas.
- v0.3 Fase 2: indicadores y multigráfico.
- v0.4/0.4.1 velas por volumen (retiradas).
- v0.5 correcciones: solo RSI/Estocástico/Pivotes/Medias, maximizar, invertir escala, temporizador, 1 segundo, cruz exacta, todo por gráfico, fondo/rejilla/marca de agua.
- v0.6 alturas fijas y flechas de paneles, grupos EMA/SMA, historial local, ajustes movibles, paleta y plantillas, logos.
- v0.7 Fase 3: herramientas de dibujo (ver §3), guardado por activo, árbol de objetos, favoritos. `cfg.version` = 5.

## 9. Pendientes conocidos
- Probar en Windows/Electron y con Binance real: 1 s (profundidad e límites), caché IndexedDB en Electron, rendimiento.
- Posible mejora: indicador de progreso del historial local; botón "borrar historial guardado" (existe `TVHistory.clear()`, sin botón).
- Dibujos: probados solo en el navegador con datos simulados (Chromium); falta probar en Electron/Windows y con Binance real (precisión del imán con datos reales, rendimiento con muchos dibujos).
- Dibujos no incluidos aún (ideas): flechas/etiquetas con fondo, extensiones de Fibonacci con 3 puntos, copiar/pegar entre activos, dibujos en paneles de indicadores, mover la barra de favoritos, sincronizar dibujos entre activos distintos.
- Fase 4: ver instrucciones maestras.
