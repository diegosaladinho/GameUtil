'use strict';
const { norm, hasAny, startsWithKw, normPath } = require('./util');

const TOOL_CATEGORIES = [
  'Desarrollo',
  'Navegadores',
  'Multimedia y diseño',
  'Comunicación',
  'Productividad',
  'Seguridad y privacidad',
  'Sistema y utilidades',
  'Runtimes y controladores',
  'Launchers de juegos',
  'Sin clasificar'
];

const GAME_GENRES = [
  'Acción', 'Aventura', 'RPG', 'Estrategia', 'Simulación', 'Deportes', 'Carreras',
  'Shooter', 'Plataformas', 'Lucha', 'Terror', 'Puzles', 'Casual', 'MMO', 'Sandbox',
  'Indie', 'Sin género'
];

const PLATFORMS = ['Steam', 'Epic Games', 'GOG', 'EA', 'Ubisoft', 'Battle.net', 'Riot', 'Xbox', 'Otra'];

// ---------------------------------------------------------------- reglas ----
// Todas las palabras clave están ya normalizadas (minúsculas, sin símbolos).

const LAUNCHERS = [
  'steam', 'epic games launcher', 'gog galaxy', 'battle net', 'ea app', 'ea desktop', 'origin',
  'ubisoft connect', 'uplay', 'xbox', 'riot client', 'itch', 'playnite', 'amazon games',
  'rockstar games launcher', 'heroic games launcher'
];

const DEV = [
  'visual studio', 'visual studio code', 'vs code', 'vscode', 'git', 'github', 'gitlab', 'node js', 'nodejs',
  'python', 'docker', 'jetbrains', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'clion', 'rider',
  'android studio', 'postman', 'insomnia', 'sublime text', 'notepad', 'jdk', 'development kit', 'cmake',
  'mingw', 'wsl', 'windows subsystem for linux', 'sdk', 'unity hub', 'unity editor', 'unreal engine',
  'godot', 'gitkraken', 'sourcetree', 'tortoisegit', 'dbeaver', 'mysql', 'postgresql', 'mongodb',
  'sql server', 'xampp', 'laragon', 'filezilla', 'putty', 'winscp', 'wireshark', 'vagrant', 'virtualbox',
  'vmware', 'cursor', 'claude code', 'golang', 'rustup', 'cargo', 'npm', 'yarn', 'arduino', 'platformio',
  'eclipse', 'netbeans', 'powershell', 'windows terminal', 'cygwin', 'msys2', 'anaconda', 'miniconda',
  'jupyter', 'rstudio'
];

const RUNTIME = [
  'visual c', 'redistributable', 'redist', 'net runtime', 'net framework', 'net desktop runtime', 'net core',
  'aspnet core', 'directx', 'vulkan', 'physx', 'openal', 'java', 'jre', 'webview2', 'runtime', 'driver',
  'drivers', 'controlador', 'chipset', 'realtek', 'intel r', 'amd software', 'amd chipset',
  'nvidia graphics driver', 'nvidia physx', 'nvidia hd audio'
];

const GAME_PATH = /\\(steamapps\\common|epic games|gog galaxy\\games|gog games|ubisoft game launcher\\games|ea games|origin games|riot games|xboxgames|games)\\/;

const KNOWN_GAMES = [
  'minecraft', 'fortnite', 'league of legends', 'valorant', 'counter strike', 'dota 2', 'grand theft auto', 'gta',
  'the witcher', 'cyberpunk 2077', 'elden ring', 'call of duty', 'apex legends', 'overwatch', 'world of warcraft',
  'diablo', 'starcraft', 'hearthstone', 'fifa', 'ea sports fc', 'the sims', 'battlefield', 'rocket league',
  'fall guys', 'genshin impact', 'honkai', 'among us', 'stardew valley', 'terraria', 'skyrim', 'fallout',
  'red dead', 'assassin s creed', 'far cry', 'rainbow six', 'the elder scrolls', 'cities skylines',
  'euro truck simulator', 'farming simulator', 'hades', 'hollow knight', 'celeste', 'portal 2', 'half life',
  'left 4 dead', 'team fortress', 'borderlands', 'mass effect', 'dragon age', 'civilization', 'age of empires',
  'total war', 'football manager', 'efootball', 'roblox', 'osu', 'lethal company', 'baldur s gate', 'palworld',
  'helldivers'
];

const GAME_PUBLISHERS = [
  'ubisoft', 'electronic arts', 'activision', 'blizzard entertainment', 'rockstar games', 'bethesda',
  'square enix', 'bandai namco', 'capcom', 'sega', 'riot games', 'mojang', '2k', 'take two', 'cd projekt',
  'paradox interactive', 'devolver digital', 'team17', 'konami', 'valve', 'warner bros games', 'thq nordic',
  'deep silver', 'focus entertainment', 'krafton', 'hoyoverse', 'mihoyo', 'nexon', 'netease', 'gearbox',
  'id software', 'techland', '505 games', 'supergiant', 'annapurna interactive', 'humble games'
];

// Orden = prioridad.
const TOOL_RULES = [
  ['Navegadores', ['google chrome', 'chrome', 'firefox', 'mozilla firefox', 'microsoft edge', 'brave', 'opera',
    'opera gx', 'vivaldi', 'tor browser', 'waterfox', 'librewolf', 'chromium']],
  ['Productividad', ['microsoft office', 'office', 'microsoft 365', 'libreoffice', 'openoffice', 'onlyoffice',
    'notion', 'obsidian', 'onenote', 'adobe acrobat', 'acrobat', 'foxit', 'evernote', 'onedrive', 'dropbox',
    'google drive', 'todoist', 'trello', 'calibre', 'sumatra pdf', 'sumatrapdf', 'pdf', 'xmind', 'joplin',
    'logseq', 'zotero', 'anki', 'typora', 'marktext']],
  ['Comunicación', ['discord', 'microsoft teams', 'teams', 'zoom', 'zoom workplace', 'slack', 'telegram',
    'telegram desktop', 'whatsapp', 'skype', 'thunderbird', 'outlook', 'signal', 'webex', 'viber',
    'mailspring', 'mailbird', 'teamspeak', 'mumble']],
  ['Seguridad y privacidad', ['antivirus', 'defender', 'malwarebytes', 'kaspersky', 'norton', 'avast', 'avg',
    'bitdefender', 'eset', 'mcafee', 'bitwarden', 'keepass', 'keepassxc', '1password', 'lastpass', 'nordvpn',
    'protonvpn', 'proton vpn', 'expressvpn', 'openvpn', 'wireguard', 'vpn', 'veracrypt', 'windows security',
    'windscribe', 'mullvad', 'tailscale']],
  ['Multimedia y diseño', ['vlc', 'vlc media player', 'spotify', 'obs studio', 'audacity', 'gimp', 'blender',
    'photoshop', 'premiere', 'after effects', 'illustrator', 'lightroom', 'indesign', 'davinci resolve',
    'handbrake', 'k lite', 'codec', 'itunes', 'foobar2000', 'foobar', 'krita', 'inkscape', 'paint net', 'adobe',
    'figma', 'canva', 'sketchup', 'autocad', 'autodesk fusion', 'affinity', 'capcut', 'shotcut', 'kdenlive',
    'mpv', 'potplayer', 'media player classic', 'winamp', 'musicbee', 'reaper', 'fl studio', 'ableton',
    'ffmpeg', 'sharex', 'greenshot', 'irfanview', 'xnview', 'faststone', 'nomacs']],
  ['Sistema y utilidades', ['7 zip', '7zip', 'winrar', 'winzip', 'peazip', 'ccleaner', 'powertoys',
    'everything', 'treesize', 'hwinfo', 'cpu z', 'gpu z', 'msi afterburner', 'rufus', 'balenaetcher', 'etcher',
    'teamviewer', 'anydesk', 'rustdesk', 'crystaldiskinfo', 'crystaldiskmark', 'speccy', 'revo uninstaller',
    'bulk crap uninstaller', 'autoruns', 'process explorer', 'sysinternals', 'windirstat', 'wiztree',
    'qbittorrent', 'utorrent', 'bittorrent', 'jdownloader', 'internet download manager', 'nvidia control panel',
    'geforce experience', 'nvidia app', 'razer', 'logitech', 'corsair', 'icue', 'steelseries', 'lghub',
    'armoury crate', 'sandboxie', 'autohotkey', 'ditto']]
];

// ------------------------------------------------------------ plataforma ----

function detectPlatform(raw) {
  if (raw.source === 'steam') return 'Steam';
  if (raw.source === 'epic') return 'Epic Games';
  const p = normPath(raw.location) + '\\';
  const pub = norm(raw.publisher);
  if (p.includes('\\steamapps\\')) return 'Steam';
  if (p.includes('\\epic games\\')) return 'Epic Games';
  if (p.includes('\\gog galaxy\\games\\') || p.includes('\\gog games\\') || hasAny(pub, ['gog com', 'gog sa'])) return 'GOG';
  if (p.includes('\\ea games\\') || p.includes('\\origin games\\') || p.includes('\\electronic arts\\') || hasAny(pub, ['electronic arts'])) return 'EA';
  if (p.includes('\\ubisoft') || hasAny(pub, ['ubisoft'])) return 'Ubisoft';
  if (p.includes('\\battle.net\\') || hasAny(pub, ['blizzard entertainment'])) return 'Battle.net';
  if (p.includes('\\riot games\\') || hasAny(pub, ['riot games'])) return 'Riot';
  if (p.includes('\\xboxgames\\')) return 'Xbox';
  return 'Otra';
}

// ---------------------------------------------------------- clasificación ----

function categorize(raw) {
  const n = norm(raw.name);
  const pub = norm(raw.publisher);
  const platform = detectPlatform(raw);
  const tool = (category, confidence, reason) => ({ type: 'tool', category, platform: null, confidence, reason });
  const game = (confidence, reason) => ({ type: 'game', category: 'Sin género', platform, confidence, reason });

  if (LAUNCHERS.some(k => startsWithKw(n, k))) return tool('Launchers de juegos', 'alta', 'Launcher de juegos');
  if (raw.source === 'steam') return game('media', 'Instalado desde Steam');
  if (raw.source === 'epic') return game('media', 'Instalado desde Epic Games');
  if (hasAny(n, DEV)) return tool('Desarrollo', 'alta', 'Herramienta de desarrollo');
  if (hasAny(n, RUNTIME)) return tool('Runtimes y controladores', 'alta', 'Runtime o controlador');
  if (GAME_PATH.test(normPath(raw.location) + '\\')) return game('alta', 'Instalado en una carpeta de juegos');
  if (hasAny(n, KNOWN_GAMES)) return game('alta', 'Título de juego conocido');
  if (hasAny(pub, GAME_PUBLISHERS)) return game('media', 'Editor de videojuegos');
  for (const [category, kws] of TOOL_RULES) {
    if (hasAny(n, kws)) return tool(category, 'alta', 'Herramienta reconocida');
  }
  return tool('Sin clasificar', 'baja', 'Sin coincidencias: revísalo a mano');
}

function isValidCategory(type, category) {
  if (type === 'game') return GAME_GENRES.includes(category);
  if (type === 'tool') return TOOL_CATEGORIES.includes(category);
  return false;
}

// Corrección manual del usuario: manda sobre todo lo demás.
function applyOverride(item, ov) {
  item.type = ov.type;
  item.category = ov.category;
  item.platform = ov.type === 'game' ? (item.platform || detectPlatform(item)) : null;
  item.confidence = 'manual';
  item.reason = 'Asignado por ti';
  item.overridden = true;
  return item;
}

// ------------------------------------------------------- datos de Steam ----

const GENRE_ES = {
  Action: 'Acción', Adventure: 'Aventura', RPG: 'RPG', Strategy: 'Estrategia', Simulation: 'Simulación',
  Sports: 'Deportes', Racing: 'Carreras', Casual: 'Casual', 'Massively Multiplayer': 'MMO', Indie: 'Indie'
};
const STRONG_GAME = new Set(['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing', 'Massively Multiplayer']);
const LOW_PRIORITY = new Set(['Indie', 'Casual']);
const NON_GAME = {
  Utilities: 'Sistema y utilidades',
  'Animation & Modeling': 'Multimedia y diseño',
  'Audio Production': 'Multimedia y diseño',
  'Design & Illustration': 'Multimedia y diseño',
  'Photo Editing': 'Multimedia y diseño',
  'Video Production': 'Multimedia y diseño',
  'Web Publishing': 'Desarrollo',
  'Game Development': 'Desarrollo',
  'Software Training': 'Productividad',
  Accounting: 'Productividad'
};

function primaryGenre(genresEn) {
  const mapped = genresEn.filter(g => GENRE_ES[g]);
  const main = mapped.find(g => !LOW_PRIORITY.has(g));
  if (main) return GENRE_ES[main];
  if (mapped.includes('Casual')) return GENRE_ES.Casual; // "Casual" describe más que "Indie"
  if (mapped.length) return GENRE_ES[mapped[0]];
  return 'Sin género';
}

// info = resultado de online.enrich() guardado en caché.
function applyOnline(item, info) {
  if (!info || !info.found) return item;
  const genresEn = info.genres || [];
  const nonGame = genresEn.filter(g => NON_GAME[g]);
  const strong = genresEn.filter(g => STRONG_GAME.has(g));

  if (nonGame.length && !strong.length) {
    // Steam lo cataloga como software, no como juego.
    item.type = 'tool';
    item.category = NON_GAME[nonGame[0]];
    item.platform = null;
    item.genres = [];
    item.confidence = 'online';
    item.reason = 'Steam lo cataloga como software';
    return item;
  }
  if (!info.isGame) return item;

  const wasUnclassified = item.type === 'tool' && item.category === 'Sin clasificar';
  if (item.type === 'game' || (wasUnclassified && info.exact)) {
    item.type = 'game';
    item.platform = item.platform || detectPlatform(item);
    item.genres = genresEn.filter(g => GENRE_ES[g]).map(g => GENRE_ES[g]);
    item.category = primaryGenre(genresEn);
    item.confidence = 'online';
    item.reason = 'Género obtenido de la tienda de Steam';
  }
  return item;
}

module.exports = {
  TOOL_CATEGORIES, GAME_GENRES, PLATFORMS,
  categorize, detectPlatform, applyOverride, applyOnline, isValidCategory, primaryGenre
};
