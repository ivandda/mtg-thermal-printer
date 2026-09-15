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
- Create your own cards and tokens: name, mana cost (leave it empty for a token), type, power/toughness, rules text and an image you add, moved and zoomed right on the label preview. Or start from any card with Customize. Your cards and their images stay in your browser; back them up to a file to keep them safe or move them to another browser.
- Print game markers (The Monarch, The Initiative, Day and Night…), trackers for speed, energy, experience and poison, and keyword markers like Flying or Lifelink, or your own like +1/+1 or Shield, packed side by side onto as few labels as possible so they take few cuts.
- Collect labels in a print list, each with its own options and copies, and print them all at once.
- Bookmark or share a card: the address keeps the search and the chosen printing and side.

On 62 × 100 mm die-cut labels (Brother DK-11202) a card prints at 59 × 82 mm, about 94% of a real card.

## Requirements

- **Chrome or Edge**, on desktop or Android. Other browsers can search and preview but can't print, because they don't support WebUSB.
- **A supported printer connected over USB.** If your printer has Editor Lite, turn it off first (green light off).

| Printer | Connection | Status |
| --- | --- | --- |
| Brother QL-700 | USB | Tested on macOS |
| Brother QL-500, QL-550, QL-560, QL-570, QL-600, QL-650TD, QL-710W, QL-720NW, QL-800, QL-810W, QL-820NWB | USB | Untested |
| Brother QL-1050, QL-1060N, QL-1100, QL-1110NWB, QL-1115NWB, with labels up to 104 mm wide | USB | Untested |

The untested printers use the same Brother QL raster protocol, and the app sends each one exactly what brother_ql sends it. If you have one, please [open an issue](https://github.com/ivandda/mtg-thermal-printer/issues) and say whether it prints.

On Windows, the printer needs [a one-time driver change](#windows). Printing on Windows and Linux isn't tested yet.

## Windows

Windows only lets a browser use a USB device that runs Microsoft's generic WinUSB driver ([Chrome's WebUSB guide](https://developer.chrome.com/docs/capabilities/build-for-webusb#windows) explains why). A Brother printer normally uses Windows' printer driver, so it needs a one-time change:

1. Plug in the printer and turn it on. If it has Editor Lite, turn it off.
2. Download and open [Zadig](https://zadig.akeo.ie).
3. Choose **Options → List All Devices**, then pick your Brother QL printer.
4. Choose **WinUSB** as the driver and click **Replace Driver**.
5. Reload the app and click **Connect printer**.

While WinUSB is installed, Brother's software and printing from other Windows programs won't work with that printer. To undo the change, open Device Manager, right-click the printer, choose **Uninstall device** and tick the option to remove its driver. Then unplug the printer and plug it back in, and Windows sets up its own printer driver again.

These steps follow Chrome's guidance but haven't been tried on Windows yet. If you try them, please [open an issue](https://github.com/ivandda/mtg-thermal-printer/issues) and say how it went.

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

Copyright © 2026 Ivan. Released under the [GNU AGPL-3.0](LICENSE): you can use, share and change it for free, and any version you distribute or host must stay open source under the same license.

Magic: The Gathering is a trademark of Wizards of the Coast. This project is not affiliated with or endorsed by Wizards of the Coast, Scryfall or Brother.
