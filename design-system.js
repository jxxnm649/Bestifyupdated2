/* ============================================================
   Bestify Design System — Shared UI Helpers
   Vanilla JS, ES module. Import only what you need:
     import { showToast, openModal, closeModal } from "./design-system.js";
   Depends on classes defined in design-system.css.
   Nothing here touches Firebase/auth — purely UI behavior.
   ============================================================ */

/**
 * Ensures the toast container exists in the DOM (creates it once).
 */
function ensureToastContainer() {
  let container = document.getElementById("bf-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "bf-toast-container";
    container.className = "bf-toast-container";
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a short auto-dismissing toast message.
 * @param {string} message
 * @param {"default"|"success"|"danger"|"info"} type
 * @param {number} duration ms before it disappears (default 3000)
 */
export function showToast(message, type = "default", duration = 3000) {
  const container = ensureToastContainer();

  const toast = document.createElement("div");
  toast.className = "bf-toast";
  if (type === "success") toast.classList.add("bf-toast-success");
  if (type === "danger") toast.classList.add("bf-toast-danger");
  if (type === "info") toast.classList.add("bf-toast-info");
  toast.textContent = message;

  container.appendChild(toast);

  // trigger enter animation
  requestAnimationFrame(() => toast.classList.add("bf-show"));

  setTimeout(() => {
    toast.classList.remove("bf-show");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/**
 * Open a modal by its element id.
 * Expects markup:
 * <div id="myModal" class="bf-modal-overlay">
 *   <div class="bf-modal">...</div>
 * </div>
 * @param {string} modalId
 */
export function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.classList.add("bf-open");
  document.body.style.overflow = "hidden";

  // close on overlay click (outside the modal box)
  overlay.addEventListener("click", function onOverlayClick(e) {
    if (e.target === overlay) {
      closeModal(modalId);
      overlay.removeEventListener("click", onOverlayClick);
    }
  });
}

/**
 * Close a modal by its element id.
 * @param {string} modalId
 */
export function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;
  overlay.classList.remove("bf-open");
  document.body.style.overflow = "";
}

/**
 * Render a simple empty-state block inside a container element.
 * @param {HTMLElement} container
 * @param {{icon?: string, title: string, text?: string}} opts
 */
export function renderEmptyState(container, opts) {
  if (!container) return;
  container.innerHTML = `
    <div class="bf-state">
      <div class="bf-state-icon">${opts.icon || "📦"}</div>
      <p class="bf-state-title">${opts.title}</p>
      ${opts.text ? `<p class="bf-state-text">${opts.text}</p>` : ""}
    </div>
  `;
}

/**
 * Render a simple error-state block with an optional retry button.
 * @param {HTMLElement} container
 * @param {{title?: string, text?: string, onRetry?: () => void}} opts
 */
export function renderErrorState(container, opts = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="bf-state bf-state-error">
      <div class="bf-state-icon">⚠️</div>
      <p class="bf-state-title">${opts.title || "Unable to load data"}</p>
      <p class="bf-state-text">${opts.text || "Please try again."}</p>
      <button type="button" class="bf-btn bf-btn-ghost bf-btn-sm" id="bf-retry-btn">Retry</button>
    </div>
  `;
  if (opts.onRetry) {
    const btn = container.querySelector("#bf-retry-btn");
    if (btn) btn.addEventListener("click", opts.onRetry);
  }
}

/**
 * Render N skeleton placeholder cards inside a container
 * (useful for product grids / order lists while data loads).
 * @param {HTMLElement} container
 * @param {number} count
 */
export function renderSkeletonCards(container, count = 4) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="bf-card">
      <span class="bf-skeleton bf-skeleton-card"></span>
      <span class="bf-skeleton bf-skeleton-title"></span>
      <span class="bf-skeleton bf-skeleton-text"></span>
    </div>
  `).join("");
}
