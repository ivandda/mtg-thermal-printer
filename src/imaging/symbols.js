/** Pixel size symbols are prepared at; they print at most about 30 dots across. */
const SYMBOL_PIXELS = 128;
/** Parts of a symbol darker than this are its glyph; the coloured disc around it is dropped. */
const GLYPH_BRIGHTNESS = 110;

/** @type {Map<string, Promise<ImageBitmap | undefined>>} */
const cache = new Map();

/**
 * Pictures of the symbols in some text, such as "{2}{G}" or "{T}: Add {C}.", by symbol. Each is just
 * the black glyph, since a coloured disc would print as a grey smudge or a black blot. Symbols that
 * can't be loaded are left out, so they print as text.
 * @param {string} text
 * @returns {Promise<Map<string, ImageBitmap>>}
 */
export async function loadSymbols(text) {
  const symbols = [...new Set(text.match(/\{[^}]+\}/g) ?? [])];
  const images = await Promise.all(symbols.map(loadSymbol));
  /** @type {Map<string, ImageBitmap>} */
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
      () => glyphOf(element),
      () => undefined,
    );
    cache.set(symbol, image);
  }
  return image;
}

/**
 * The dark parts of a symbol in solid black on transparent.
 * @param {HTMLImageElement} picture
 */
function glyphOf(picture) {
  const context = new OffscreenCanvas(SYMBOL_PIXELS, SYMBOL_PIXELS).getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(picture, 0, 0, SYMBOL_PIXELS, SYMBOL_PIXELS);
  const pixels = context.getImageData(0, 0, SYMBOL_PIXELS, SYMBOL_PIXELS);
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const glyph = data[i + 3] > 128 && brightness < GLYPH_BRIGHTNESS;
    data.set(glyph ? [0, 0, 0, 255] : [0, 0, 0, 0], i);
  }
  context.putImageData(pixels, 0, 0);
  return createImageBitmap(context.canvas);
}
