/** @type {Map<string, Promise<HTMLImageElement | undefined>>} */
const cache = new Map();

/**
 * Scryfall's pictures of the symbols in some text, such as "{2}{G}" or "{T}: Add {C}.", by symbol.
 * Symbols that can't be loaded are left out, so they print as text.
 * @param {string} text
 * @returns {Promise<Map<string, HTMLImageElement>>}
 */
export async function loadSymbols(text) {
  const symbols = [...new Set(text.match(/\{[^}]+\}/g) ?? [])];
  const images = await Promise.all(symbols.map(loadSymbol));
  /** @type {Map<string, HTMLImageElement>} */
  const loaded = new Map();
  symbols.forEach((symbol, index) => {
    const image = images[index];
    if (image) loaded.set(symbol, image);
  });
  return loaded;
}

/** @param {string} symbol  e.g. "{G/U}", pictured at https://svgs.scryfall.io/card-symbols/GU.svg */
function loadSymbol(symbol) {
  let image = cache.get(symbol);
  if (!image) {
    const code = encodeURIComponent(symbol.slice(1, -1).replaceAll("/", ""));
    const element = Object.assign(new Image(), {
      crossOrigin: "anonymous",
      src: `https://svgs.scryfall.io/card-symbols/${code}.svg`,
    });
    image = element.decode().then(
      () => element,
      () => undefined,
    );
    cache.set(symbol, image);
  }
  return image;
}
