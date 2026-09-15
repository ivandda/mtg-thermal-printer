/**
 * Laying out rules text, like "{1}, {T}, Sacrifice this artifact: Draw a card.", with its symbols.
 * The measuring is passed in, so this works without a canvas.
 */

/**
 * A piece of a word: plain text, or a symbol such as "{T}".
 * @typedef {{ text: string, symbol: boolean }} Piece
 */

/** Pieces with no space between them, so a line never breaks inside, e.g. "{T}:". @typedef {Piece[]} Word */

/** @typedef {Word[]} Line */

const SYMBOL = /(\{[^}]+\})/;

/**
 * Splits rules text into paragraphs of words.
 * @param {string} text
 * @returns {Word[][]}
 */
export function parseRules(text) {
  return text
    .split("\n")
    .map((paragraph) =>
      paragraph
        .split(/\s+/)
        .filter(Boolean)
        .map((word) =>
          word
            .split(SYMBOL)
            .filter(Boolean)
            .map((part) => ({ text: part, symbol: SYMBOL.test(part) })),
        ),
    )
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Breaks a paragraph into lines no wider than `width`. A word wider than a whole line gets a line
 * of its own.
 * @param {Word[]} paragraph
 * @param {number} width
 * @param {(word: Word) => number} measure
 * @param {number} space  Width of a space.
 * @returns {Line[]}
 */
export function wrapParagraph(paragraph, width, measure, space) {
  /** @type {Line[]} */
  const lines = [];
  /** @type {Line} */
  let line = [];
  let lineWidth = 0;
  for (const word of paragraph) {
    const wordWidth = measure(word);
    if (line.length > 0 && lineWidth + space + wordWidth > width) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    lineWidth += (line.length > 0 ? space : 0) + wordWidth;
    line.push(word);
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/**
 * The largest text size, from `largest` down to `smallest`, at which every paragraph fits the box.
 * Paragraphs are separated by half a line. At the smallest size the text may still overflow.
 * @param {Word[][]} paragraphs
 * @param {{ width: number, height: number, largest: number, smallest: number, lineHeight: number }} box
 *   `lineHeight` is a multiple of the text size.
 * @param {(word: Word, size: number) => number} measure
 * @param {(size: number) => number} space
 */
export function fitRules(paragraphs, box, measure, space) {
  let size = box.largest;
  for (;;) {
    const wrapped = paragraphs.map((paragraph) =>
      wrapParagraph(paragraph, box.width, (word) => measure(word, size), space(size)),
    );
    const lines = wrapped.reduce((count, paragraph) => count + paragraph.length, 0);
    const height = size * box.lineHeight * (lines + Math.max(0, wrapped.length - 1) / 2);
    if (height <= box.height || size <= box.smallest) return { size, paragraphs: wrapped };
    size = Math.max(box.smallest, size - 1);
  }
}
