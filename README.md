# GameUtil

Launcher para Windows (Electron) que detecta lo que tienes instalado y lo muestra en una biblioteca con dos pestañas independientes: **Juegos** y **Software**. Ningún elemento aparece en las dos a la vez.

## Compilar o ejecutar

GameUtil es de código abierto (MIT). Hay dos formas de usarlo (detalles en [BUILDING.md](BUILDING.md)):

1. **Desde el código**:
   ```powershell
   npm install
   npm start
   ```
   Necesitas Node.js 18 o superior. Si npm bloquea la descarga de Electron, `npm start` la hace solo.
2. **Versión portable**: haz doble clic en `compilar.bat` y obtendrás `dist\GameUtil-Portable-<versión>.exe`, un solo archivo sin instalar. Sus datos (horas, personalización, imágenes) se guardan siempre en `%APPDATA%\GameUtil`, no junto al `.exe`.

El `.exe` no está firmado: Windows SmartScreen puede avisar. Para colaborar, mira [CONTRIBUTING.md](CONTRIBUTING.md).

## Nombre del proceso

Con `npm start`, un paso previo (`scripts/brand.js`) crea una copia de Electron llamada **GameUtil.exe** y le cambia el nombre y la descripción, así que en el Administrador de tareas aparece como GameUtil y no como Electron. Se hace una sola vez y se repite si reinstalas Electron. Si no se puede cambiar la descripción, la app arranca igual y avisa. Con `npm run dist` se genera directamente `GameUtil.exe`.

Si vienes de la versión anterior, tus horas, personalización e imágenes se copian solas de `%APPDATA%\inventario-software` a `%APPDATA%\GameUtil` la primera vez. La carpeta antigua no se borra.

## Qué incluye

- **Biblioteca a la izquierda** con buscador, orden (nombre, más jugados, recientes) y filtro por plataforma o categoría.
- **Portada a la derecha** con banner y logo, título, horas jugadas, última vez, desarrollador, editor, plataforma, género, tamaño y descripción. El color de acento y el fondo se adaptan al banner.
- **Jugar / Abrir**: Steam y Epic se lanzan por su launcher; el resto, por su ejecutable. Si un programa pide permisos de administrador, se reintenta pidiéndolos.
- **Ajustes de cada elemento** (engranaje): argumentos de lanzamiento, abrir archivos locales, personalizar título, descripción, banner y logo (con «Restaurar originales»), cambiar su clasificación o moverlo a la otra pestaña, y desinstalar.
- **Ajustes de la aplicación**: tema automático, claro u oscuro; transiciones y fondos animados activables; seguir contando horas con la ventana cerrada; clave de SteamGridDB; exportar cada pestaña a CSV o JSON; y la lista de archivos guardados, cada uno con un botón para mostrarlo en el Explorador.
- **Pantalla de carga** animada con el logo de GameUtil al abrir (se puede desactivar en Ajustes).
- **Copia de tus datos**: Ajustes > Copia de tus datos exporta a un archivo `.gameutil` las horas, descripciones, títulos, argumentos de lanzamiento, categorías, imágenes propias y datos online, y los importa en otro equipo. Al importar eliges *Combinar* (de las horas se queda el mayor valor, nunca se suman) o *Reemplazar*, y antes se guarda una copia automática en `backups/pre-import`. La clave de SteamGridDB/RAWG no viaja en el archivo.
- **Tutorial de la interfaz** la primera vez que se abre (nueve pasos, con `←` `→` para moverte y `Esc` para salir). Se puede repetir desde Ajustes de la aplicación > Ayuda.
- Ventana propia sin el marco de Windows. Atajos: `Ctrl+F` o `/` para buscar, flechas para moverte por la lista, `Enter` para iniciar.

## Horas jugadas

Windows no guarda horas jugadas, así que se combinan dos fuentes:

1. **Steam**: se leen las horas que Steam ya tiene guardadas en tu equipo (`localconfig.vdf`).
2. **Esta app**: mide cuánto tiempo está abierto el proceso del juego, sea del launcher que sea. Es la única fuente para Ubisoft Connect, EA app, Epic y juegos sueltos, y cuenta desde 0 a partir de la primera vez que los abres con la app en marcha.

En un juego de Steam se muestra el mayor de los dos valores, nunca la suma. Para medir con la ventana cerrada, la app se queda en la bandeja del sistema (se puede desactivar).

**Dónde se guardan**: en `%APPDATA%\GameUtil\data\playtime.json`. Cada archivo se escribe de forma atómica, lleva suma de comprobación SHA-256 y conserva hasta 5 copias en `backups/`. Si un archivo se daña, se recupera la última copia buena y el dañado se aparta con la extensión `.corrupt-…` en vez de borrarse.

## Banner, logo y descripción

Orden de prioridad: tu imagen > imagen descargada > caché local de Steam > icono del ejecutable. Sin imagen, se genera un fondo con un color propio del elemento.

El botón **Datos online** consulta la tienda pública de Steam (y SteamGridDB si guardas una clave) para traer descripción, desarrollador, editor, género, banner y logo. Pide confirmación antes y solo envía el nombre del programa o su identificador de Steam. La clave de SteamGridDB se guarda cifrada con tu cuenta de Windows. Solo se descargan imágenes de servidores de Steam, SteamGridDB y Wikimedia, y se comprueba su contenido real antes de guardarlas.

## Relleno automático y «Buscar de nuevo»

Cuando un elemento no tiene **ni banner, ni logo, ni descripción**, la app lo busca sola en segundo plano (tras escanear y al abrirla), por este orden:

1. **Steam** (tienda y CDN, de donde SteamDB saca sus imágenes): descripción, estudio, banner y logo.
2. **GOG** (catálogo público, sin clave): portada, desarrollador y editor.
3. **RAWG** (con tu clave gratuita): descripción, estudio, editor y banner.
4. **SteamGridDB** (con tu clave gratuita): banner y logo.
5. **Wikipedia** (español e inglés): descripción y carátula o logo.

Para que sea fiel al juego, un resultado solo se acepta si su título es el mismo juego: las ediciones («Game of the Year», «Deluxe») no importan, pero un número distinto («Hades II») o un subtítulo distinto sí descartan la coincidencia. Si no hay coincidencia segura, no se muestra nada. Cada descripción indica su fuente. Un elemento sin resultado no se vuelve a buscar hasta pasadas dos semanas, salvo que pulses **Buscar de nuevo** en sus ajustes. Lo que hayas personalizado nunca se toca. Se puede desactivar en Ajustes de la aplicación.

No se consulta SteamDB directamente porque bloquea el acceso automatizado y no ofrece API pública. Solo se envía el nombre del programa y solo se descargan imágenes de los servidores de Steam, GOG, RAWG, SteamGridDB y Wikimedia.

## Límites conocidos

- No detecta apps de la Microsoft Store ni juegos de Game Pass.
- Ubisoft Connect y EA app no exponen sus horas: esos juegos cuentan desde 0.
- Los juegos de Epic no se desinstalan desde aquí, sino desde Epic Games Launcher.
- Los juegos que se abren a través de otro proceso (por ejemplo, un launcher que cierra y deja otro ejecutable) pueden medir solo la parte que corre desde su carpeta de instalación.
- Las consultas a Wikipedia, GOG y RAWG se han probado con respuestas simuladas, no contra los servicios reales. Si alguno cambia su formato, esa fuente dejará de dar resultados (sin errores) y el resto sigue funcionando.
- Los `.exe` de la release no están firmados (SmartScreen puede avisar).
- Esta versión se ha probado con simulaciones y capturas en un navegador, no en un Windows real. Si algo falla, el mensaje de error indica qué paso fue.

## Pruebas

```bash
npm test
```

## Estructura

```
main.js              Ventana, bandeja, lanzamiento, desinstalación y búsqueda online
preload.js           Puente seguro entre la interfaz y el proceso principal
src/scanner.js       Detección (registro de Windows, Steam, Epic)
src/steam.js         Horas y arte local de Steam
src/playtime.js      Seguimiento de procesos y cálculo de horas
src/safejson.js      Guardado seguro con suma de comprobación y copias
src/store.js         Carpeta de datos y migración desde la versión anterior
src/library.js       Fichas de la biblioteca
src/art.js           Resolución de banner, logo e iconos
src/images.js        Descarga e importación de imágenes con validación
src/online.js        Datos de la tienda de Steam
src/wiki.js          Descripción e imagen desde Wikipedia
src/gog.js           Portada y estudio desde GOG
src/rawg.js          Descripción, estudio y banner desde RAWG (con clave)
src/match.js         Cuándo dos títulos son el mismo juego
src/backup.js        Importar y exportar datos (.gameutil)
src/paths.js         Carpeta de datos (%APPDATA%\GameUtil)
src/autofill.js      Qué elementos rellenar automáticamente
src/steamgriddb.js   Imágenes de SteamGridDB (opcional)
src/launch.js        Argumentos, ejecutable principal y desinstalación
src/categorizer.js   Reglas de clasificación
renderer/            Interfaz del launcher y tutorial (tour.js)
scripts/brand.js     Renombra el proceso de desarrollo a GameUtil.exe
scripts/make-icon.js Genera build/icon.ico
scripts/checksums.js Sumas SHA-256 de los .exe
src/migrate.js       Copia los datos de la versión anterior
test/run.js          Pruebas
```
