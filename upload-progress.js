/* ============================================================
   Shared upload progress helper.
   Used everywhere the site uploads a photo to Cloudinary:
   admin/products.js, admin/settings.js, vendor/products.js,
   chat.js, edit-profile.js, profile.js, quick-custom-order.js.

   Import path is relative to whichever file imports it —
   "./upload-progress.js" from the project root, "../upload-progress.js"
   from admin/ or vendor/.
   ============================================================ */

let styleInjected = false;

function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement("style");
  style.id = "bf-upload-progress-style";
  style.textContent = `
    .bf-upload-progress{ margin-top:8px; max-width:260px; }
    .bf-upload-progress-track{ height:6px; background:#f0e6da; border-radius:99px; overflow:hidden; }
    .bf-upload-progress-fill{ height:100%; width:0%; background:linear-gradient(90deg,#ea580c,#f59e0b); border-radius:99px; transition:width .15s ease; }
    .bf-upload-progress-label{ font-size:11px; color:#71717a; margin-top:4px; font-weight:500; }
  `;
  document.head.appendChild(style);
}

/**
 * Creates a small progress bar + "Uploading... N%" label, appends it
 * to `container`, and returns controls to update/finish/remove it.
 */
export function mountProgressBar(container) {
  ensureStyle();

  const wrap = document.createElement("div");
  wrap.className = "bf-upload-progress";
  wrap.innerHTML = `
    <div class="bf-upload-progress-track"><div class="bf-upload-progress-fill"></div></div>
    <div class="bf-upload-progress-label">Uploading... 0%</div>
  `;
  container.appendChild(wrap);

  const fill = wrap.querySelector(".bf-upload-progress-fill");
  const label = wrap.querySelector(".bf-upload-progress-label");

  return {
    label,
    update(percent) {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      fill.style.width = p + "%";
      label.textContent = `Uploading... ${p}%`;
    },
    done(text) {
      fill.style.width = "100%";
      label.textContent = text || "✓ Uploaded";
    },
    remove() {
      wrap.remove();
    }
  };
}

/**
 * Uploads a file to Cloudinary with real upload-progress events
 * (XMLHttpRequest, since fetch() can't report upload progress).
 * onProgress(percent) is called repeatedly while the file is sent.
 * Resolves with the secure_url on success.
 */
export function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "Bestifyimg");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.cloudinary.com/v1_1/rgksliph/image/upload");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.secure_url) resolve(data.secure_url);
        else reject(new Error("Upload failed. Please try again."));
      } catch (error) {
        reject(new Error("Upload failed. Please try again."));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed. Please check your connection."));

    xhr.send(formData);
  });
}
