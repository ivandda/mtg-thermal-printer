/** @import { MarkerSelection } from "./markers.js" */
import { tokenOf } from "./designs.js";
import { PrintList } from "./print-list.js";
import { PrinterConnection } from "./printers/connection.js";
import { createScryfallClient, ScryfallError } from "./scryfall/client.js";
import { addressParam, updateAddress } from "./ui/address.js";
import { createDeck } from "./ui/deck.js";
import { element } from "./ui/dom.js";
import { createLabelPanel } from "./ui/label-panel.js";
import { LabelSize } from "./ui/label-size.js";
import { createMarkersPicker } from "./ui/markers-picker.js";
import { createModes } from "./ui/modes.js";
import { createPrintListDialog } from "./ui/print-list-dialog.js";
import { bindPrinterButton } from "./ui/printer-button.js";
import { createSearch } from "./ui/search.js";
import { createTokenEditor } from "./ui/token-editor.js";
import { createViews } from "./ui/views.js";

const scryfall = createScryfallClient();
const printer = new PrinterConnection();
const labelSize = new LabelSize(printer);
const printList = new PrintList();

const views = createViews();
/** The Markers tab's own selection, put back if changing a marker sheet is cancelled.
 * @type {MarkerSelection | undefined} */
let markersBeforeEdit;

const panel = createLabelPanel({
  scryfall,
  printer,
  labelSize,
  printList,
  onTokenChange: (token) => tokens.update(token),
  onCustomize(card, face) {
    tokens.createFrom(card, face);
    modes.show("create");
  },
  onEditEnd(saved, id) {
    if (!saved && markersBeforeEdit) markers.show(markersBeforeEdit);
    markersBeforeEdit = undefined;
    modes.refreshBack();
    list.open(id, saved ? "Changes saved." : undefined);
  },
});
const tokens = createTokenEditor({
  printList,
  labelSize,
  onShow(token) {
    if (document.body.dataset.mode === "create") panel.showToken(token);
  },
  onPreview: views.openLabel,
});
const markers = createMarkersPicker({
  onChange(selection) {
    if (document.body.dataset.mode === "markers") panel.showMarkers(selection);
  },
  onPreview: views.openLabel,
});
const modes = createModes((mode) => {
  if (mode === "create") panel.showToken(tokens.current());
  else if (mode === "markers") panel.showMarkers(markers.current());
  else panel.showCards();
});
const search = createSearch({
  scryfall,
  onSelect(card) {
    panel.showCard(card);
    views.openLabel();
  },
});
createDeck({
  scryfall,
  printList,
  onSelect(card) {
    panel.showCard(card);
    views.openLabel();
  },
});
const list = createPrintListDialog({
  printer,
  labelSize,
  printList,
  onEdit({ design, ...item }) {
    if (design.type === "token") {
      modes.show("create");
      tokens.show(tokenOf(design));
    } else if (design.type === "markers") {
      markersBeforeEdit = markers.current();
      modes.show("markers");
      markers.show({ counts: design.counts, custom: design.custom ?? [] });
    } else {
      modes.show("find");
    }
    panel.editItem({ ...item, design });
    // On a narrow screen the label fills it, so Back leaves the label alone and returns to the list.
    back.textContent = "Back to the print list";
    views.openLabel();
  },
});
const back = element("#back", HTMLButtonElement);
back.addEventListener("click", () => panel.cancelEdit());

bindPrinterButton(printer, panel.showStatus);

printer.restore();
if (document.body.dataset.mode === "find") openLinkedCard();

/** Opens the card a shared or bookmarked address points to. */
async function openLinkedCard() {
  const id = addressParam("card");
  if (!id) return;
  try {
    const face = addressParam("face");
    panel.showCard(await scryfall.card(id), face === "both" ? "both" : Number(face) || 0);
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
