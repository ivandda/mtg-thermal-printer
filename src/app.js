import { PrintList } from "./print-list.js";
import { PrinterConnection } from "./printers/connection.js";
import { createScryfallClient } from "./scryfall/client.js";
import { createLabelPanel } from "./ui/label-panel.js";
import { LabelSize } from "./ui/label-size.js";
import { createPrintListDialog } from "./ui/print-list-dialog.js";
import { bindPrinterButton } from "./ui/printer-button.js";
import { createSearch } from "./ui/search.js";
import { createViews } from "./ui/views.js";

const scryfall = createScryfallClient();
const printer = new PrinterConnection();
const labelSize = new LabelSize(printer);
const printList = new PrintList();

const panel = createLabelPanel({ scryfall, printer, labelSize, printList });
const views = createViews();
createSearch({
  scryfall,
  onSelect(card) {
    panel.showCard(card);
    views.openLabel();
  },
});
createPrintListDialog({ printer, labelSize, printList });
bindPrinterButton(printer, panel.showStatus);

printer.restore();
