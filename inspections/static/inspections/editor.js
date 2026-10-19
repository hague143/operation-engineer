(() => {
  const root = document.querySelector("#annotation-editor");
  if (!root) return;
  const editable = root.dataset.editable === "true";
  const annotations = JSON.parse(
    document.querySelector("#annotations-data").textContent,
  );
  const overlay = document.querySelector("#annotation-overlay");
  const form = document.querySelector("#annotation-form");
  const feedback = document.querySelector("#editor-feedback");
  const fields = [
    "x",
    "y",
    "width",
    "height",
    "category",
    "severity",
    "observation",
    "recommendation",
  ];
  const coordMap = { x: "x", y: "y", w: "width", h: "height" };
  let selectedId =
    Number(document.querySelector("#annotation-id").value) || null;
  let pending = null;
  let start = null;
  let pointerId = null;
  let drawMode = !selectedId;
  const ns = "http://www.w3.org/2000/svg";

  function svgNode(name, attrs) {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) =>
      el.setAttribute(key, value),
    );
    return el;
  }
  function displayBox(box, severity, selected = false, label = "") {
    const rect = svgNode("rect", {
      x: box.x * 1000,
      y: box.y * 1000,
      width: box.width * 1000,
      height: box.height * 1000,
      class: `annotation-rect ${severity} ${selected ? "selected" : ""}`,
      "vector-effect": "non-scaling-stroke",
    });
    overlay.append(rect);
    if (label) {
      const labelX = Math.max(
        3,
        Math.min(
          box.x * 1000,
          1000 - (150 * 1000) / Math.max(overlay.clientWidth, 200),
        ),
      );
      const labelY = Math.max(
        (18 * 1000) / Math.max(overlay.clientHeight, 100),
        box.y * 1000 - (7 * 1000) / Math.max(overlay.clientHeight, 100),
      );
      const text = svgNode("text", {
        x: 0,
        y: 0,
        transform: `translate(${labelX} ${labelY}) scale(1 ${overlay.clientWidth / Math.max(overlay.clientHeight, 1)})`,
        class: "annotation-label",
      });
      text.style.fontSize = `${(12 * 1000) / Math.max(overlay.clientWidth, 200)}px`;
      text.textContent = label;
      // Keep text legible in screen pixels while rectangle geometry stays normalized.
      overlay.append(text);
    }
    return rect;
  }
  function render() {
    overlay.replaceChildren();
    annotations.forEach((a) => {
      const box = a.id === selectedId && pending ? pending : a;
      const rect = displayBox(
        box,
        a.severity,
        a.id === selectedId,
        `${a.reference} · ${a.severity[0].toUpperCase() + a.severity.slice(1)}`,
      );
      rect.dataset.annotationId = a.id;
    });
    if (pending && !selectedId) displayBox(pending, "drawing");
    document.querySelectorAll("[data-select]").forEach((button) => {
      const selected = Number(button.dataset.select) === selectedId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".delete-finding-form").forEach((f) => {
      f.hidden = Number(f.dataset.for) !== selectedId;
    });
  }
  function fillCoordinates(box) {
    ["x", "y", "width", "height"].forEach((key) => {
      form.elements[key].value = box[key];
    });
    document.querySelectorAll("[data-coordinate]").forEach((input) => {
      input.value = box[coordMap[input.dataset.coordinate]];
    });
  }
  function dirty() {
    if (editable) form.dataset.dirty = "true";
  }
  function abandonAllowed() {
    return (
      form.dataset.dirty !== "true" ||
      window.confirm("Discard the unsaved changes to this finding?")
    );
  }
  function select(id) {
    if (!abandonAllowed()) return;
    const a = annotations.find((item) => item.id === id);
    if (!a) return;
    selectedId = id;
    pending = null;
    drawMode = false;
    fields.forEach((key) => {
      form.elements[key].value = a[key];
    });
    document.querySelector("#annotation-id").value = id;
    document.querySelector("#finding-heading").textContent = a.reference;
    fillCoordinates(a);
    form.dataset.dirty = "false";
    feedback.textContent = editable
      ? "Finding selected. Edit its details or choose “Redraw rectangle”."
      : `${a.reference} · Saved human observation`;
    render();
  }
  function newFinding() {
    if (!abandonAllowed()) return;
    form.reset();
    fields.forEach((key) => {
      form.elements[key].value = "";
    });
    document.querySelector("#annotation-id").value = "";
    ["x", "y", "width", "height"].forEach((key) => {
      form.elements[key].value = "";
    });
    document.querySelectorAll("[data-coordinate]").forEach((input) => {
      input.value = "";
    });
    selectedId = null;
    pending = null;
    drawMode = true;
    form.dataset.dirty = "false";
    document.querySelector("#finding-heading").textContent = "New finding";
    feedback.textContent =
      "Draw a rectangle around a visible indication, or enter normalized coordinates below.";
    render();
  }
  function point(event) {
    const bounds = overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function rectangle(end) {
    const x = Math.min(start.x, end.x),
      y = Math.min(start.y, end.y);
    // Round inward to avoid floating point sums just above 1 on the server.
    const round = (n) => Math.floor(n * 1000000) / 1000000;
    return {
      x: round(x),
      y: round(y),
      width: round(Math.abs(end.x - start.x)),
      height: round(Math.abs(end.y - start.y)),
    };
  }
  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const id = Number(event.target.dataset.annotationId);
    if (id && !drawMode) {
      select(id);
      return;
    }
    if (!editable || !drawMode || pointerId !== null) return;
    event.preventDefault();
    start = point(event);
    pointerId = event.pointerId;
    overlay.setPointerCapture(pointerId);
  });
  overlay.addEventListener("pointermove", (event) => {
    if (!start || event.pointerId !== pointerId) return;
    pending = rectangle(point(event));
    render();
  });
  overlay.addEventListener("pointerup", (event) => {
    if (!start || event.pointerId !== pointerId) return;
    pending = rectangle(point(event));
    start = null;
    overlay.releasePointerCapture(pointerId);
    pointerId = null;
    if (pending.width <= 0 || pending.height <= 0) {
      pending = null;
      feedback.textContent =
        "The rectangle needs a visible area. Drag across the indication and try again.";
    } else {
      fillCoordinates(pending);
      dirty();
      drawMode = false;
      feedback.textContent =
        "Rectangle recorded. Complete the finding details and save.";
    }
    render();
  });
  overlay.addEventListener("pointercancel", () => {
    start = null;
    pointerId = null;
    pending = null;
    render();
  });
  document
    .querySelectorAll("[data-select]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        select(Number(button.dataset.select)),
      ),
    );
  document.querySelector("#new-finding")?.addEventListener("click", newFinding);
  document.querySelector("#redraw")?.addEventListener("click", () => {
    drawMode = true;
    feedback.textContent =
      "Drag a new rectangle. The finding details will be kept.";
  });
  document.querySelectorAll("[data-coordinate]").forEach((input) =>
    input.addEventListener("input", () => {
      form.elements[coordMap[input.dataset.coordinate]].value = input.value;
      const values = Object.fromEntries(
        ["x", "y", "width", "height"].map((key) => [
          key,
          Number(form.elements[key].value),
        ]),
      );
      pending = values;
      dirty();
      render();
    }),
  );
  form.addEventListener("submit", (event) => {
    if (!editable) {
      event.preventDefault();
      return;
    }
    const box = Object.fromEntries(
      ["x", "y", "width", "height"].map((key) => [
        key,
        Number(form.elements[key].value),
      ]),
    );
    if (
      box.width <= 0 ||
      box.height <= 0 ||
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > 1 ||
      box.y + box.height > 1
    ) {
      event.preventDefault();
      dirty();
      feedback.textContent =
        "Draw a non-zero rectangle entirely inside the photograph before saving.";
      feedback.scrollIntoView({ block: "center" });
    }
  });
  if (!editable) {
    form
      .querySelectorAll("input:not([type=hidden]), select, textarea")
      .forEach((el) => {
        el.disabled = true;
      });
    overlay.style.cursor = "default";
  }
  if (root.dataset.failed === "true") {
    pending = Object.fromEntries(
      ["x", "y", "width", "height"].map((key) => [
        key,
        Number(form.elements[key].value),
      ]),
    );
    fillCoordinates(pending);
    render();
  } else if (annotations.length && !editable) select(annotations[0].id);
  else render();
  new ResizeObserver(render).observe(overlay);
})();
