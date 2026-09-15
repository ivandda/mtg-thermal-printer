import { clampCopies } from "../print-list.js";

/**
 * Makes a copies stepper work: its − and + buttons (with data-step) change the number, and typed
 * numbers are kept in range.
 * @param {HTMLElement} stepper
 * @param {(copies: number) => void} onChange
 */
export function bindStepper(stepper, onChange) {
  const input = stepper.querySelector("input");
  if (!input) throw new Error("A stepper needs an input");

  stepper.addEventListener("click", (event) => {
    const button = event.target instanceof Element && event.target.closest("[data-step]");
    if (!(button instanceof HTMLElement)) return;
    input.value = String(clampCopies(Number(input.value) + Number(button.dataset.step)));
    onChange(Number(input.value));
  });
  input.addEventListener("input", () => onChange(clampCopies(input.value)));
  input.addEventListener("change", () => {
    input.value = String(clampCopies(input.value));
    onChange(Number(input.value));
  });
}
