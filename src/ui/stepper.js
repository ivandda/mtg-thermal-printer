const MAX = 20;

/**
 * Makes a number stepper work: its − and + buttons (with data-step) change the number, and typed
 * numbers are kept between `min` and 20.
 * @param {HTMLElement} stepper
 * @param {(value: number) => void} onChange
 * @param {{ min?: number }} [options]
 */
export function bindStepper(stepper, onChange, { min = 1 } = {}) {
  const input = stepper.querySelector("input");
  if (!input) throw new Error("A stepper needs an input");
  /** @param {unknown} value */
  const clamp = (value) => Math.min(Math.max(Math.round(Number(value)) || 0, min), MAX);

  stepper.addEventListener("click", (event) => {
    const button = event.target instanceof Element && event.target.closest("[data-step]");
    if (!(button instanceof HTMLElement)) return;
    input.value = String(clamp(Number(input.value) + Number(button.dataset.step)));
    onChange(Number(input.value));
  });
  input.addEventListener("input", () => onChange(clamp(input.value)));
  input.addEventListener("change", () => {
    input.value = String(clamp(input.value));
    onChange(Number(input.value));
  });
}
