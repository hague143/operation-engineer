document.querySelector(".mobile-menu")?.addEventListener("click", (event) => {
  const open = document.querySelector("#sidebar").classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".sidebar, .mobile-menu")) {
    document.querySelector("#sidebar")?.classList.remove("open");
    document
      .querySelector(".mobile-menu")
      ?.setAttribute("aria-expanded", "false");
  }
});
document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});
document.querySelectorAll("[data-dirty-form]").forEach((form) => {
  form.dataset.dirty = "false";
  form.addEventListener("input", () => {
    form.dataset.dirty = "true";
  });
  form.addEventListener("submit", () => {
    form.dataset.dirty = "false";
  });
});
window.addEventListener("beforeunload", (event) => {
  if (document.querySelector('[data-dirty="true"]')) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Vercel rejects oversized requests before Django can render a helpful error.
// Keep the same batch limit in client validation and the server upload form.
document
  .querySelectorAll('input[type="file"][data-max-total-bytes]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      const limit = Number(input.dataset.maxTotalBytes);
      const total = [...input.files].reduce(
        (bytes, file) => bytes + file.size,
        0,
      );
      input.setCustomValidity(
        total > limit
          ? `Choose photographs totaling ${Math.floor(limit / 1024 / 1024)} MB or less for this upload.`
          : "",
      );
      if (total > limit) input.reportValidity();
    });
  });
