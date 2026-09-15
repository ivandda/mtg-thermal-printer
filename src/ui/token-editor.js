/** @import { Token, TokenArt } from "../designs.js" */
/** @import { PrintList } from "../print-list.js" */
/** @import { ScryfallCard } from "../scryfall/client.js" */
import { isBlankToken } from "../designs.js";
import { CENTERED } from "../imaging/arrangement.js";
import { prepareImage } from "../imaging/images.js";
import { cardText, imageUrl } from "../scryfall/client.js";
import { tokenStore } from "../token-store.js";
import { element } from "./dom.js";

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
 * The form for making a custom card or token, and the ones saved in this browser. They save
 * themselves as they are edited.
 * @param {object} options
 * @param {PrintList} options.printList  Its labels can use images of tokens that were deleted.
 * @param {(token: Token) => void} options.onShow  Called whenever the token being made changes.
 * @param {() => void} options.onPreview  Shows the label, on small screens.
 */
export function createTokenEditor({ printList, onShow, onPreview }) {
  const ui = {
    myTokens: element("#my-tokens", HTMLElement),
    newToken: element("#new-token", HTMLButtonElement),
    tokenList: element("#token-list", HTMLUListElement),
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
    deleteToken: element("#delete-token", HTMLButtonElement),
    deleteConfirm: element("#delete-confirm", HTMLElement),
    confirmDelete: element("#confirm-delete", HTMLButtonElement),
    cancelDelete: element("#cancel-delete", HTMLButtonElement),
  };

  /** Saved tokens, by name. @type {Token[]} */
  let saved = [];
  let token = blankToken();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;
  let canSave = true;

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
    if (document.body.dataset.mode !== "create" || !file) return;
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
   * Deletes a saved image once no token and no label in the print list uses it.
   * @param {TokenArt | undefined} art
   */
  function releaseImage(art) {
    const id = storedImageOf(art);
    if (id && !imagesInUse().has(id)) tokenStore.deleteImage(id).catch(() => {});
  }

  function imagesInUse() {
    const fromTokens = [token, ...saved].map((other) => storedImageOf(other.art));
    const fromList = printList.items.map(({ design }) =>
      design.type === "token" ? storedImageOf(design.art) : undefined,
    );
    return new Set([...fromTokens, ...fromList]);
  }

  /* Saving */

  function changed() {
    showImage();
    onShow(token);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  }

  async function save() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const current = token;
    if (isBlankToken(current) || !canSave) return;
    try {
      await tokenStore.save(current);
    } catch {
      canSave = false;
      ui.status.textContent = "This browser can't save your cards, so they last until the page is closed.";
      return;
    }
    saved = byName([...saved.filter((other) => other.id !== current.id), current]);
    showSaved();
  }

  /* Tokens */

  ui.newToken.addEventListener("click", () => {
    open(blankToken());
    ui.name.focus();
  });

  ui.deleteToken.addEventListener("click", () => showDeleteConfirm(true));
  ui.cancelDelete.addEventListener("click", () => {
    showDeleteConfirm(false);
    ui.deleteToken.focus();
  });
  ui.confirmDelete.addEventListener("click", async () => {
    const deleted = token;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    saved = saved.filter((other) => other.id !== deleted.id);
    open(blankToken());
    await tokenStore.delete(deleted.id).catch(() => {});
    releaseImage(deleted.art);
    ui.status.textContent = `Deleted ${titleOf(deleted)}.`;
    ui.name.focus();
  });

  /** @param {boolean} confirming */
  function showDeleteConfirm(confirming) {
    ui.deleteToken.hidden = confirming || !saved.some((other) => other.id === token.id);
    ui.deleteConfirm.hidden = !confirming;
    if (confirming) ui.cancelDelete.focus();
  }

  /** @param {Token} next */
  function open(next) {
    if (saveTimer !== undefined) save();
    token = next;
    ui.name.value = next.name;
    ui.manaCost.value = next.manaCost ?? "";
    ui.typeLine.value = next.typeLine;
    ui.power.value = next.power;
    ui.toughness.value = next.toughness;
    ui.rules.value = next.rules;
    ui.status.textContent = "";
    showImage();
    showSaved();
    onShow(token);
  }

  function showImage() {
    ui.imageEmpty.hidden = Boolean(token.art);
    ui.imageChosen.hidden = !token.art;
  }

  function showSaved() {
    ui.myTokens.hidden = saved.length === 0;
    ui.tokenList.replaceChildren(
      ...saved.map((other) => {
        const button = Object.assign(document.createElement("button"), {
          type: "button",
          className: "button small",
          textContent: titleOf(other),
        });
        button.setAttribute("aria-pressed", String(other.id === token.id));
        button.addEventListener("click", () => open(other.id === token.id ? token : other));
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
    showDeleteConfirm(false);
  }

  /** @param {Token[]} tokens */
  const byName = (tokens) => tokens.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));

  tokenStore.list().then(
    async (tokens) => {
      saved = byName(tokens);
      showSaved();
      // Remove images left behind, e.g. by labels removed from the print list after their token was deleted.
      const inUse = imagesInUse();
      for (const id of await tokenStore.imageIds()) {
        if (!inUse.has(id)) tokenStore.deleteImage(id).catch(() => {});
      }
    },
    () => {
      canSave = false;
    },
  );

  return {
    current: () => token,

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
     * Starts a new token from a card's text and art.
     * @param {ScryfallCard} card
     * @param {number} face
     */
    createFrom(card, face) {
      const text = cardText(card, face);
      const art = imageUrl(card, face, "art_crop");
      open({
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
