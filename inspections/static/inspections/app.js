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
