'use strict';
const path = require('path');

// Carpeta de datos: siempre %APPDATA%\GameUtil, tanto con `npm start` como en la versión portable.
// Así las horas y la personalización viven en la carpeta privada del usuario de Windows, no junto al .exe
// (que puede estar en una carpeta compartida, un USB o un sitio sin permisos), y sobreviven a borrar o mover el .exe.
function dataDir({ appData, name = 'GameUtil' } = {}) {
  if (!appData || !path.isAbsolute(appData)) throw new Error('No se pudo localizar la carpeta APPDATA.');
  return { dir: path.join(appData, name), portable: false };
}

module.exports = { dataDir };
