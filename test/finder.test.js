'use strict';
const assert = require('assert');
const { sameTitle } = require('../src/match');
const { findGog } = require('../src/gog');
const { findRawg } = require('../src/rawg');
const { hostAllowed } = require('../src/images');

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

module.exports = async function register(test, atest) {
  test('coincidencia de títulos: ediciones sí, secuelas y subtítulos no', () => {
    assert.ok(sameTitle('Hades', 'HADES™'));
    assert.ok(sameTitle('The Witcher 3: Wild Hunt', 'The Witcher 3 Wild Hunt - Game of the Year Edition'));
    assert.ok(sameTitle('Final Fantasy VII', 'Final Fantasy 7'));
    assert.ok(sameTitle('Cyberpunk 2077', 'Cyberpunk 2077 Ultimate Edition'));
    assert.ok(!sameTitle('Hades', 'Hades II'));
    assert.ok(!sameTitle('Portal', 'Portal 2'));
    assert.ok(!sameTitle('Hades', 'Hades: Battle Out of Hell'));
    assert.ok(!sameTitle('Doom', 'Doom Eternal'));
    assert.ok(!sameTitle('', 'Hades'));
  });
  test('hosts de imágenes de GOG y RAWG permitidos, otros no', () => {
    assert.ok(hostAllowed('https://images.gog-statics.com/abc.jpg'));
    assert.ok(hostAllowed('https://media.rawg.io/media/games/x.jpg'));
    assert.ok(!hostAllowed('https://evil.example/x.jpg'));
    assert.ok(!hostAllowed('http://media.rawg.io/x.jpg'));
  });
  await atest('GOG: acepta solo el mismo título y devuelve portada y estudio', async () => {
    const f = async () => json({ products: [
      { title: 'Hades II', coverHorizontal: 'https://images.gog-statics.com/wrong.jpg' },
      { title: 'Hades', coverHorizontal: 'https://images.gog-statics.com/ok.jpg', developers: ['Supergiant Games'], publishers: ['Supergiant Games'] }] });
    const r = await findGog('Hades', f);
    assert.strictEqual(r.imageUrl, 'https://images.gog-statics.com/ok.jpg');
    assert.deepStrictEqual(r.developers, ['Supergiant Games']);
    assert.strictEqual((await findGog('Portal', async () => json({ products: [{ title: 'Portal 2' }] }))).found, false);
    await assert.rejects(() => findGog('x', async () => json({}, 429)), e => e.code === 'RATE_LIMIT');
  });
  await atest('RAWG: busca, valida título, lee descripción y trata clave inválida', async () => {
    const calls = [];
    const f = async url => {
      calls.push(url);
      if (url.includes('/games?search=')) return json({ results: [{ id: 1, name: 'Celeste 64' }, { id: 2, name: 'Celeste', background_image: 'https://media.rawg.io/media/c.jpg' }] });
      return json({ description_raw: 'Un juego de plataformas. '.repeat(60), developers: [{ name: 'Maddy Makes Games' }], publishers: [{ name: 'Maddy Makes Games' }] });
    };
    const r = await findRawg('Celeste', 'K'.repeat(32), f);
    assert.ok(/\/games\/2\?/.test(calls[1]));
    assert.ok(r.description.length <= 701 && r.description.startsWith('Un juego'));
    assert.deepStrictEqual(r.developers, ['Maddy Makes Games']);
    assert.strictEqual(r.imageUrl, 'https://media.rawg.io/media/c.jpg');
    await assert.rejects(() => findRawg('x', 'bad', async () => json({}, 401)), e => e.code === 'BAD_KEY');
    assert.strictEqual((await findRawg('Doom', 'K'.repeat(32), async () => json({ results: [{ id: 3, name: 'Doom Eternal' }] }))).found, false);
  });
};
