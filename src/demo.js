'use strict';

// Datos de demostración: se usan solo cuando la app no se ejecuta en Windows.
const GB = 1024 ** 3;
const MB = 1024 ** 2;

function demoItems() {
  const t = (name, publisher, version, sizeMB, date, location = '') => ({
    id: 'demo:' + name, name, publisher, version, location,
    installDate: date, sizeBytes: Math.round(sizeMB * MB), source: 'registry'
  });
  const steam = (name, appId, sizeGB, date) => ({
    id: 'steam:' + appId, name, publisher: '', version: '',
    location: `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${name}`,
    installDate: date, sizeBytes: Math.round(sizeGB * GB), source: 'steam', appId
  });
  return [
    steam('Cyberpunk 2077', 1091500, 70.2, '2026-09-12'),
    steam('Hades', 1145360, 15.3, '2026-03-02'),
    steam('Stardew Valley', 413150, 0.6, '2025-12-24'),
    steam('Counter-Strike 2', 730, 33.5, '2026-10-30'),
    steam('Blender', 365670, 0.9, '2026-05-08'),
    { id: 'epic:Fortnite', name: 'Fortnite', publisher: '', version: '', location: 'D:\\Epic Games\\Fortnite',
      installDate: '2026-06-18', sizeBytes: Math.round(31 * GB), source: 'epic' },
    t('Minecraft Launcher', 'Mojang', '2.2.2909', 480, '2026-01-10', 'C:\\Program Files (x86)\\Minecraft Launcher'),
    t('Valorant', 'Riot Games, Inc.', '', 28000, '2026-02-14', 'C:\\Riot Games\\VALORANT'),
    t('Juego Raro Indie', 'Estudio Pequeño', '1.0', 900, '2026-08-01', 'D:\\Games\\JuegoRaro'),
    t('Steam', 'Valve Corporation', '2.10.91.91', 5, '2025-10-01'),
    t('Epic Games Launcher', 'Epic Games, Inc.', '1.3.0', 1200, '2025-10-02'),
    t('Visual Studio Code', 'Microsoft Corporation', '1.95.0', 380, '2026-10-20'),
    t('Python 3.12.1 (64-bit)', 'Python Software Foundation', '3.12.1', 110, '2026-04-05'),
    t('Git', 'The Git Development Community', '2.47.0', 310, '2026-07-11'),
    t('Google Chrome', 'Google LLC', '130.0.6723', 620, '2026-10-28'),
    t('Mozilla Firefox (x64 es-ES)', 'Mozilla', '132.0', 270, '2026-10-22'),
    t('Discord', 'Discord Inc.', '1.0.9172', 420, '2026-09-30'),
    t('VLC media player', 'VideoLAN', '3.0.21', 180, '2026-03-15'),
    t('OBS Studio', 'OBS Project', '30.2.3', 410, '2026-06-01'),
    t('Adobe Acrobat', 'Adobe', '24.003', 1500, '2026-02-02'),
    t('7-Zip 24.08 (x64)', 'Igor Pavlov', '24.08', 5, '2026-01-20'),
    t('Bitwarden', 'Bitwarden Inc.', '2024.10.0', 300, '2026-05-30'),
    t('Microsoft Visual C++ 2015-2022 Redistributable (x64)', 'Microsoft Corporation', '14.38.33135', 20, '2025-11-04'),
    t('NVIDIA Graphics Driver 560.94', 'NVIDIA Corporation', '560.94', 1100, '2026-09-02'),
    t('Utilidad Misteriosa 3', 'Desconocido SL', '3.1', 45, '2026-04-04'),
    t('Logitech G HUB', 'Logitech', '2024.9.3', 720, '2026-03-03')
  ];
}

module.exports = { demoItems };
