# MTG Thermal Printer

Search Magic: The Gathering cards and tokens and print them as stickers on a thermal label printer, straight from the browser. No drivers or installs: the page talks to the printer over [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API).

**[Open the app](https://ivandda.github.io/mtg-thermal-printer/)**

## What it does

- Search tokens or every paper card. [Scryfall search syntax](https://scryfall.com/docs/syntax) works too, e.g. `c:g power>=4`.
- Pick the printing you like and, for double-faced tokens, the side.
- Preview the label exactly as it will print: the card is converted to black and white the way a thermal print head draws it, with a darkness setting.
- Pick the label size, or let a connected printer report the roll it has loaded.
- Optionally leave out the black border, so the art and text print larger.
- Or print a card as text: name, type, rules with mana symbols, and power/toughness in large, solid black type, with the art if you like.
- Print one or several copies; the printer cuts after each label.
- Collect labels in a print list, each with its own options and copies, and print them all at once.
- Bookmark or share a card: the address keeps the search and the chosen printing and side.

On 62 × 100 mm die-cut labels (Brother DK-11202) a card prints at 59 × 82 mm, about 94% of a real card.

## Requirements

- **Chrome or Edge**, on desktop or Android. Other browsers can search and preview but can't print, because they don't support WebUSB.
- **A supported printer connected over USB.** On the QL-700, turn Editor Lite off first (green light off).

| Printer | Connection | Status |
| --- | --- | --- |
| Brother QL-700 | USB | Tested on macOS |

Windows and Linux aren't tested yet.

## Development

Requires Node.js 24 or newer. There is no build step: the browser loads the files in `src/` as they are.

```sh
npm install
npm test            # unit tests
npm run lint        # Biome
npm run typecheck   # TypeScript, checking the JSDoc types
python3 -m http.server 8000   # then open http://localhost:8000
```

Pushes to `main` run the checks and deploy `index.html` and `src/` to GitHub Pages.

## How printers are supported

- `src/transport/` moves bytes to and from a device (WebUSB today).
- `src/printers/` has one folder per printer family. A driver turns 1-bit bitmaps into that printer's commands and reads its status.
- `src/printers/types.js` defines the contracts; `src/printers/index.js` lists the drivers.

To add a printer, write a driver that implements `PrinterDriver` and add it to that list.

The Brother QL encoding produces exactly the bytes of the [brother_ql](https://github.com/pklaus/brother_ql) Python library; the tests compare against files it generated (`test/fixtures/brother-ql/generate.py`).

## Credits

- Card data and images: [Scryfall](https://scryfall.com). Requests stay within [its rate limits](https://scryfall.com/docs/api/rate-limits).
- Typeface: [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next), SIL Open Font License.

## License

[MIT](LICENSE). Magic: The Gathering is a trademark of Wizards of the Coast. This project is not affiliated with or endorsed by Wizards of the Coast, Scryfall or Brother.
