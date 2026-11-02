# Contribuir

1. Haz un fork y crea una rama.
2. `npm install` y `npm test` deben pasar antes y después de tus cambios.
3. Añade una prueba en `test/` para cada cambio de comportamiento. Las consultas a internet se prueban con respuestas simuladas, nunca contra servicios reales.
4. Reglas del proyecto:
   - La interfaz no ejecuta nada del sistema: todo pasa por `preload.js` y `main.js`, y se valida en `main.js`.
   - No se aceptan estilos en línea ni scripts en línea (la política de seguridad de contenido los bloquea).
   - Todo lo que viene de internet o de un archivo importado se trata como no fiable: se limita, se sanea y las imágenes solo se descargan de los servidores permitidos en `src/images.js`.
   - Una coincidencia por nombre solo se acepta si el título es el mismo juego (`src/match.js`).
5. Abre una pull request explicando qué cambia y cómo lo probaste.
