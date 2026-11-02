'use strict';
// Genera build/icon.png y build/icon.ico a partir del icono dibujado por código.
const fs = require('fs');
const path = require('path');
const { makeIconPng, makeIco } = require('../src/appicon');

const dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), makeIconPng(256));
fs.writeFileSync(path.join(dir, 'icon.ico'), makeIco());
console.log('Iconos generados en', dir);
