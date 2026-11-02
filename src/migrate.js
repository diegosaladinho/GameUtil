'use strict';
const fs = require('fs');
const path = require('path');

// Al cambiar el nombre de la app cambia su carpeta de datos. Esto copia (nunca mueve ni borra)
// los datos de la carpeta anterior a la nueva, solo si la nueva todavía no tiene datos.
const ITEMS = ['data', 'inventario.json'];

function migrateUserData(oldDir, newDir) {
  try {
    if (!oldDir || !newDir || path.resolve(oldDir) === path.resolve(newDir)) return { migrated: false };
    if (!fs.existsSync(oldDir)) return { migrated: false };
    if (ITEMS.some(i => fs.existsSync(path.join(newDir, i)))) return { migrated: false };
    const found = ITEMS.filter(i => fs.existsSync(path.join(oldDir, i)));
    if (!found.length) return { migrated: false };
    fs.mkdirSync(newDir, { recursive: true });
    for (const i of found) fs.cpSync(path.join(oldDir, i), path.join(newDir, i), { recursive: true });
    return { migrated: true, items: found };
  } catch (error) {
    return { migrated: false, error };
  }
}

module.exports = { migrateUserData };
