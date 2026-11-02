# Compilar GameUtil

GameUtil se ofrece como código abierto y como un `.exe` portable que compilas tú.

| Forma | Cómo se obtiene | Datos |
|---|---|---|
| **Código abierto** | Descargar el repositorio y ejecutar `npm start` | `%APPDATA%\GameUtil` |
| **Portable** | `compilar.bat` genera `GameUtil-Portable-<versión>.exe` (un solo archivo, sin instalar) | `%APPDATA%\GameUtil` |

Los datos (horas, personalización, imágenes, copias de seguridad) viven siempre en `%APPDATA%\GameUtil`, la carpeta privada de tu usuario de Windows, también con el portable. Así no se pierden al mover o borrar el `.exe`. Para llevarlos a otro equipo, usa Ajustes > Copia de tus datos.

## Requisitos

- Windows 10 u 11 (x64).
- [Node.js](https://nodejs.org) 18 o superior.

## Ejecutar desde el código

```powershell
npm install
npm start
```

Si npm bloquea la descarga de Electron, `npm start` la hace solo (`scripts/setup.js`).

## Compilar el portable

Atajo: doble clic en `compilar.bat` (instala, prueba, compila y genera las sumas). O a mano:

```powershell
npm install
npm test               # opcional pero recomendable
npm run dist           # portable en dist\
npm run checksums      # crea dist\SHA256SUMS.txt
```

Resultado en `dist\`: `GameUtil-Portable-<versión>.exe` y `SHA256SUMS.txt`.

## Compilar sin Windows: GitHub Actions

El flujo `.github/workflows/build.yml` compila en un equipo Windows de GitHub. Sube el proyecto a un repositorio, abre **Actions > Compilar GameUtil > Run workflow** (o crea una etiqueta `v0.4.0`) y descarga el `.exe` y `SHA256SUMS.txt`.

## Firma y avisos de Windows

El `.exe` **no está firmado** (firmar exige un certificado de pago), así que SmartScreen puede avisar: **Más información > Ejecutar de todas formas**. Para comprobar la descarga:

```powershell
Get-FileHash .\GameUtil-Portable-0.4.0.exe -Algorithm SHA256
```

Para firmar tus propias versiones, define `CSC_LINK` y `CSC_KEY_PASSWORD` antes de `npm run dist`.

## Problemas frecuentes

- **`electron` no se reconoce**: falta `npm install`, o npm bloqueó la descarga. Ejecuta `node node_modules/electron/install.js`.
- **No se puede escribir el `.exe`**: cierra GameUtil antes de recompilar.
