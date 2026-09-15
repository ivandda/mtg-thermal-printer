import { PrintList } from "./print-list.js";
import { PrinterConnection } from "./printers/connection.js";
import { createScryfallClient, ScryfallError } from "./scryfall/client.js";
import { addressParam, updateAddress } from "./ui/address.js";
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
const search = createSearch({
  scryfall,
  onSelect(card) {
    panel.showCard(card);
    views.openLabel();
  },
});
createPrintListDialog({ printer, labelSize, printList });
bindPrinterButton(printer, panel.showStatus);

printer.restore();
openLinkedCard();

/** Opens the card a shared or bookmarked address points to. */
async function openLinkedCard() {
  const id = addressParam("card");
  if (!id) return;
  try {
    panel.showCard(await scryfall.card(id), Number(addressParam("face")) || 0);
    views.openLabel();
  } catch (error) {
    const missing = error instanceof ScryfallError && error.status === 404;
    if (missing) updateAddress({ card: undefined, face: undefined });
    search.showStatus(
      missing
        ? "This card link doesn't work anymore. Search for the card instead."
        : "Couldn't reach Scryfall to open the linked card. Check your connection and try again.",
    );
  }
}
