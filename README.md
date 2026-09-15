# MTG Thermal Printer

Search Magic: The Gathering cards and print them on a thermal label printer, right from the browser. No drivers or installs: the page talks to the printer over [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API).

> **Status: early prototype.** The page currently connects to a printer and prints a test label. Card search comes next.

## Supported printers

| Printer | Connection | Status |
| --- | --- | --- |
| Brother QL-700 | USB | In progress |

Printing needs Chrome or Edge (desktop or Android), and the page must be served over HTTPS or from `localhost`. On the QL-700, turn Editor Lite off first (green light off).

## Development

Requires Node.js 24 or newer.

```sh
npm install
npm test            # unit tests
npm run lint        # Biome
npm run typecheck   # TypeScript, checking the JSDoc types
python3 -m http.server 8000   # then open http://localhost:8000
```

There is no build step: the browser loads the files in `src/` as they are.

## How printers are supported

- `src/transport/` moves bytes to and from a device (WebUSB today).
- `src/printers/` has one folder per printer family. A driver turns 1-bit bitmaps into that printer's commands and reads its status.
- `src/printers/types.js` defines the contracts; `src/printers/index.js` lists the drivers.

To add a printer, write a driver that implements `PrinterDriver` and add it to that list.

The Brother QL encoding produces exactly the bytes of the [brother_ql](https://github.com/pklaus/brother_ql) Python library; the tests compare against files it generated (`test/fixtures/brother-ql/generate.py`).

## License

[MIT](LICENSE). Magic: The Gathering is a trademark of Wizards of the Coast. This project is not affiliated with or endorsed by Wizards of the Coast or Brother.
