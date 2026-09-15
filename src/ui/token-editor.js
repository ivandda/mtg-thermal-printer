/** @import { Token, TokenArt } from "../designs.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { ScryfallCard } from "../scryfall/client.js" */
/** @import { LabelSize } from "./label-size.js" */
import { customKind, isBlankToken, renderDesign } from "../designs.js";
import { CENTERED } from "../imaging/arrangement.js";
import { prepareImage } from "../imaging/images.js";
import { cardText, imageUrl } from "../scryfall/client.js";
import { tokenStore } from "../token-store.js";
import { drawBitmap, element } from "./dom.js";

const SAVE_DELAY_MS = 400;

/** @returns {Token} */
const blankToken = () => ({
  id: crypto.randomUUID(),
  name: "",
  manaCost: "",
  typeLine: "",
  power: "",
  toughness: "",
  rules: "",
});

/** @param {Token} token */
const titleOf = (token) => token.name.trim() || "Untitled card";

/** @param {TokenArt | undefined} art */
const storedImageOf = (art) => (art && "image" in art.source ? art.source.image : undefined);

/**
 * The Create tab: My cards, the custom cards and tokens saved in this browser, and the form for
 * editing one. Cards save themselves as they are edited.
 * @param {object} options
 * @param {PrintList} options.printList  Its labels can use images of cards that were deleted.
 * @param {LabelSize} options.labelSize  For the previews in My cards.
 * @param {(token: Token | undefined) => void} options.onShow  Called whenever the card being edited
 *   changes, and with none when My cards is shown.
 * @param {() => void} options.onPreview  Shows the label, on small screens.
 */
export function createTokenEditor({ printList, labelSize, onShow, onPreview }) {
  const ui = {
    library: element("#card-library", HTMLElement),
    libraryStatus: element("#library-status", HTMLElement),
    newToken: element("#new-token", HTMLButtonElement),
    tokenList: element("#token-list", HTMLUListElement),
    itemTemplate: element("#library-item", HTMLTemplateElement),
    editor: element("#card-editor", HTMLElement),
    toLibrary: element("#to-library", HTMLButtonElement),
    saveState: element("#save-state", HTMLElement),
    form: element("#token-form", HTMLFormElement),
    name: element("#token-name", HTMLInputElement),
    manaCost: element("#token-cost", HTMLInputElement),
    typeLine: element("#token-type", HTMLInputElement),
    power: element("#token-power", HTMLInputElement),
    toughness: element("#token-toughness", HTMLInputElement),
    rules: element("#token-rules", HTMLTextAreaElement),
    imageFile: element("#token-image", HTMLInputElement),
    imageDrop: element("#image-drop", HTMLElement),
    imageEmpty: element("#image-empty", HTMLElement),
    chooseImage: element("#choose-image", HTMLButtonElement),
    imageChosen: element("#image-chosen", HTMLElement),
    replaceImage: element("#replace-image", HTMLButtonElement),
    removeImage: element("#remove-image", HTMLButtonElement),
    status: element("#token-status", HTMLElement),
    preview: element("#preview-token", HTMLButtonElement),
    actions: element("#editor-actions", HTMLElement),
    duplicate: element("#duplicate-token", HTMLButtonElement),
    deleteToken: element("#delete-token", HTMLButtonElement),
    deleteConfirm: element("#delete-confirm", HTMLElement),
    deleteQuestion: element("#delete-question", HTMLElement),
    confirmDelete: element("#confirm-delete", HTMLButtonElement),
    cancelDelete: element("#cancel-delete", HTMLButtonElement),
  };

  /** Saved cards, by name. @type {Token[]} */
  let saved = [];
  /** The card in the form, which is shown unless My cards is. */
  let token = blankToken();
  let editing = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;
  let canSave = true;

  const isSaved = () => saved.some((other) => other.id === token.id);

  /* Form */

  ui.form.addEventListener("submit", (event) => event.preventDefault());
  ui.form.addEventListener("input", (event) => {
    if (event.target === ui.imageFile) return;
    token = {
      ...token,
      name: ui.name.value,
      manaCost: ui.manaCost.value.trim(),
      typeLine: ui.typeLine.value,
      power: ui.power.value.trim(),
      toughness: ui.toughness.value.trim(),
      rules: ui.rules.value,
    };
    changed();
  });
  ui.preview.addEventListener("click", onPreview);

  /* Image */

  ui.chooseImage.addEventListener("click", () => ui.imageFile.click());
  ui.replaceImage.addEventListener("click", () => ui.imageFile.click());
  ui.imageFile.addEventListener("change", () => {
    const [file] = ui.imageFile.files ?? [];
    ui.imageFile.value = "";
    if (file) useImage(file);
  });

  ui.imageDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.imageDrop.classList.add("dragging");
  });
  ui.imageDrop.addEventListener("dragleave", () => ui.imageDrop.classList.remove("dragging"));
  ui.imageDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.imageDrop.classList.remove("dragging");
    const [file] = event.dataTransfer?.files ?? [];
    if (file) useImage(file);
  });

  document.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.files ?? [])].find((pasted) => pasted.type.startsWith("image/"));
    if (document.body.dataset.mode !== "create" || !editing || !file) return;
    event.preventDefault();
    useImage(file);
  });

  ui.removeImage.addEventListener("click", () => {
    const removed = token.art;
    token = { ...token, art: undefined };
    changed();
    releaseImage(removed);
    ui.status.textContent = "Image removed.";
    ui.chooseImage.focus();
  });

  /** @param {File} file */
  async function useImage(file) {
    if (!file.type.startsWith("image/")) {
      ui.status.textContent = "That file isn't an image. Choose a JPEG, PNG or WebP image.";
      return;
    }
    ui.status.textContent = "Adding the image…";
    let image;
    try {
      image = await prepareImage(file);
    } catch {
      ui.status.textContent = "This image can't be opened here. Choose a JPEG, PNG or WebP image.";
      return;
    }
    let id;
    try {
      id = await tokenStore.saveImage(image);
    } catch {
      ui.status.textContent = "This browser can't save images, so the image can't be added.";
      return;
    }
    const replaced = token.art;
    token = { ...token, art: { ...CENTERED, source: { image: id } } };
    ui.status.textContent = "";
    changed();
    releaseImage(replaced);
  }

  /**
   * Deletes a saved image once no card and no label in the print list uses it.
   * @param {TokenArt | undefined} art
   */
  function releaseImage(art) {
    const id = storedImageOf(art);
    if (id && !imagesInUse().has(id)) tokenStore.deleteImage(id).catch(() => {});
  }

  function imagesInUse() {
    const fromCards = [token, ...saved].map((other) => storedImageOf(other.art));
    const fromList = printList.items.map(({ design }) =>
      design.type === "token" ? storedImageOf(design.art) : undefined,
    );
    return new Set([...fromCards, ...fromList]);
  }

  /* Saving */

  function changed() {
    showImage();
    onShow(token);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  }

  /** Saves the card, unless it's still blank. My cards has it straight away, even if storage fails. */
  async function save() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const current = token;
    if (isBlankToken(current)) return;
    saved = byName([...saved.filter((other) => other.id !== current.id), current]);
    showActions();
    if (!canSave) return;
    try {
      await tokenStore.save(current);
    } catch {
      canSave = false;
      ui.status.textContent = "This browser can't save your cards, so they last until the page is closed.";
      showActions();
    }
  }

  function saveNow() {
    if (saveTimer !== undefined) save();
  }

  /* My cards */

  ui.newToken.addEventListener("click", () => {
    edit(blankToken());
    ui.name.focus();
  });

  ui.toLibrary.addEventListener("click", () => {
    const shown = token.id;
    showLibrary();
    const button = [...ui.tokenList.querySelectorAll("button")].find((item) => item.dataset.id === shown);
    (button ?? ui.newToken).focus();
  });

  labelSize.addEventListener("change", () => {
    if (!ui.library.hidden) showList();
  });

  /** @param {string} [message]  e.g. what was just deleted. */
  function showLibrary(message = "") {
    saveNow();
    editing = false;
    ui.editor.hidden = true;
    ui.library.hidden = false;
    ui.libraryStatus.textContent = message;
    showList();
    onShow(undefined);
  }

  function showList() {
    const media = labelSize.current;
    ui.tokenList.replaceChildren(
      ...saved.map((other) => {
        const item = /** @type {HTMLElement} */ (ui.itemTemplate.content.firstElementChild?.cloneNode(true));
        const button = /** @type {HTMLButtonElement} */ (item.querySelector("button"));
        const stats = other.power || other.toughness ? `${other.power}/${other.toughness}` : "";
        /** @type {HTMLElement} */ (item.querySelector(".library-name")).textContent = titleOf(other);
        /** @type {HTMLElement} */ (item.querySelector(".library-detail")).textContent = [
          other.typeLine.trim() || customKind(other),
          stats,
        ]
          .filter(Boolean)
          .join(" · ");
        button.dataset.id = other.id;
        button.addEventListener("click", () => {
          edit(other);
          ui.name.focus();
        });
        const preview = /** @type {HTMLCanvasElement} */ (item.querySelector("canvas"));
        renderDesign({ ...other, type: "token", darkness: "normal" }, media)
          .then(([page]) => drawBitmap(preview, page))
          .catch(() => {
            // The card can be opened without its preview.
          });
        return item;
      }),
    );
  }

  /* Editing */

  /** @param {Token} next */
  function edit(next) {
    saveNow();
    token = next;
    editing = true;
    ui.name.value = next.name;
    ui.manaCost.value = next.manaCost ?? "";
    ui.typeLine.value = next.typeLine;
    ui.power.value = next.power;
    ui.toughness.value = next.toughness;
    ui.rules.value = next.rules;
    ui.status.textContent = "";
    ui.library.hidden = true;
    ui.editor.hidden = false;
    showImage();
    showActions();
    onShow(token);
  }

  function showImage() {
    ui.imageEmpty.hidden = Boolean(token.art);
    ui.imageChosen.hidden = !token.art;
  }

  /** @param {boolean} [confirmingDelete] */
  function showActions(confirmingDelete = false) {
    ui.toLibrary.hidden = saved.length === 0;
    ui.saveState.textContent = !isSaved() ? "" : canSave ? "Saved in this browser" : "Not saved";
    ui.actions.hidden = confirmingDelete || !isSaved();
    ui.deleteConfirm.hidden = !confirmingDelete;
    ui.deleteQuestion.textContent = `Delete ${titleOf(token)}?`;
  }

  ui.duplicate.addEventListener("click", () => {
    saveNow();
    const original = token;
    edit({ ...original, id: crypto.randomUUID() });
    save();
    ui.status.textContent = `This is a copy of ${titleOf(original)}. Change what you need.`;
    ui.name.focus();
  });

  ui.deleteToken.addEventListener("click", () => {
    showActions(true);
    ui.cancelDelete.focus();
  });
  ui.cancelDelete.addEventListener("click", () => {
    showActions();
    ui.deleteToken.focus();
  });
  ui.confirmDelete.addEventListener("click", async () => {
    const deleted = token;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    saved = saved.filter((other) => other.id !== deleted.id);
    const message = `Deleted ${titleOf(deleted)}.`;
    if (saved.length > 0) {
      showLibrary(message);
      ui.newToken.focus();
    } else {
      edit(blankToken());
      ui.status.textContent = message;
      ui.name.focus();
    }
    await tokenStore.delete(deleted.id).catch(() => {});
    releaseImage(deleted.art);
  });

  /** @param {Token[]} tokens */
  const byName = (tokens) => tokens.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));

  /* Start: My cards, or a blank card when there are none. */

  tokenStore.list().then(
    async (tokens) => {
      // A card made before the list loaded, e.g. with Customize, is already in `saved`.
      saved = byName([
        ...tokens.filter((stored) => !saved.some((other) => other.id === stored.id)),
        ...saved,
      ]);
      if (editing) showActions();
      else if (saved.length > 0) showLibrary();
      else edit(blankToken());
      // Remove images left behind, e.g. by labels removed from the print list after their card was deleted.
      const inUse = imagesInUse();
      for (const id of await tokenStore.imageIds()) {
        if (!inUse.has(id)) tokenStore.deleteImage(id).catch(() => {});
      }
    },
    () => {
      canSave = false;
      if (!editing) edit(blankToken());
    },
  );

  return {
    /** The card being edited, or none while My cards is shown. */
    current: () => (editing ? token : undefined),

    /**
     * Keeps a change made outside the form, such as arranging the image on the label.
     * @param {Token} next
     */
    update(next) {
      token = next;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DELAY_MS);
    },

    /**
     * Starts a new card from a Scryfall card's text and art.
     * @param {ScryfallCard} card
     * @param {number} face
     */
    createFrom(card, face) {
      const text = cardText(card, face);
      const art = imageUrl(card, face, "art_crop");
      edit({
        id: crypto.randomUUID(),
        name: text.name,
        manaCost: text.manaCost,
        typeLine: text.typeLine,
        power: text.power,
        toughness: text.toughness,
        rules: text.rules,
        art: art ? { ...CENTERED, source: { url: art } } : undefined,
      });
      save();
    },
  };
}
