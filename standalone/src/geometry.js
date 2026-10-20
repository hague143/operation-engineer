/* Local geometry viewer. Distances use supplied coordinates, never image pixels. */
const GEOMETRY_LIMITS = {
  vertices: 20000,
  faces: 20000,
  bytes: 8 * 1024 * 1024,
};
function validateGeometry(raw) {
  assert(
    raw &&
      Array.isArray(raw.vertices) &&
      raw.vertices.length >= 2 &&
      raw.vertices.length <= GEOMETRY_LIMITS.vertices,
    "Geometry needs 2–20,000 vertices.",
  );
  assert(
    typeof raw.name === "string" &&
      raw.name.length <= 255 &&
      ["m", "cm", "mm", "unknown"].includes(raw.unit),
    "Invalid model name or units.",
  );
  const vertices = raw.vertices.map((v) => {
    assert(
      Array.isArray(v) &&
        v.length === 3 &&
        v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e9),
      "Coordinates must be finite numbers within ±1 billion model units.",
    );
    return [...v];
  });
  const faces = raw.faces || [];
  assert(
    Array.isArray(faces) && faces.length <= GEOMETRY_LIMITS.faces,
    "At most 20,000 triangles are supported.",
  );
  for (const face of faces)
    assert(
      Array.isArray(face) &&
        face.length === 3 &&
        face.every((n) => Number.isInteger(n) && n >= 0 && n < vertices.length),
      "A face references a missing vertex.",
    );
  return {
    id:
      typeof raw.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)
        ? raw.id
        : uuid(),
    name: raw.name,
    format: String(raw.format || "geometry").slice(0, 40),
    unit: raw.unit,
    synthetic: raw.synthetic === true,
    vertices,
    faces: faces.map((f) => [...f]),
  };
}
function syntheticGeometry() {
  const vertices = [],
    faces = [],
    count = 32;
  // 2 m pipe with flanges. Known dimensions are illustrative, not a field survey.
  for (const [x, r] of [
    [0, 0.5],
    [0.1, 0.5],
    [0.1, 0.32],
    [1.9, 0.32],
    [1.9, 0.5],
    [2, 0.5],
  ])
    for (let k = 0; k < count; k++)
      vertices.push([
        x,
        r * Math.cos((k * 2 * Math.PI) / count),
        r * Math.sin((k * 2 * Math.PI) / count),
      ]);
  for (let ring = 0; ring < 5; ring++)
    for (let k = 0; k < count; k++) {
      const a = ring * count + k,
        b = ring * count + ((k + 1) % count),
        c = b + count,
        d = a + count;
      faces.push([a, b, c], [a, c, d]);
    }
  return validateGeometry({
    id: uuid(),
    name: "SYNTHETIC · 2 m pipe and flange assembly",
    format: "Synthetic mesh",
    unit: "m",
    synthetic: true,
    vertices,
    faces,
  });
}
function parseGeometry(source, filename, unit) {
  assert(
    typeof source === "string" &&
      source.length <= GEOMETRY_LIMITS.bytes &&
      !source.includes("\0"),
    "Use a text XYZ/CSV, ASCII PLY or OBJ file of at most 8 MB.",
  );
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/),
    extension = filename.split(".").pop().toLowerCase(),
    vertices = [],
    faces = [];
  const addVertex = (values) => {
    assert(
      values.length >= 3 &&
        values.slice(0, 3).every((v) => String(v).trim() !== ""),
      "A coordinate row is incomplete.",
    );
    vertices.push(values.slice(0, 3).map(Number));
    assert(
      vertices.length <= GEOMETRY_LIMITS.vertices,
      "Maximum 20,000 vertices. Export a smaller / decimated model.",
    );
  };
  const addPolygon = (indices) => {
    assert(
      indices.length >= 3 && indices.length <= 64,
      "Faces need 3–64 vertex indices.",
    );
    for (let k = 1; k < indices.length - 1; k++)
      faces.push([indices[0], indices[k], indices[k + 1]]);
    assert(
      faces.length <= GEOMETRY_LIMITS.faces,
      "Maximum 20,000 triangles. Export a smaller model.",
    );
  };
  if (extension === "obj") {
    for (const line of lines) {
      const parts = line.split("#")[0].trim().split(/\s+/);
      if (parts[0] === "v") {
        assert(
          parts.length === 4 || (parts.length === 5 && Number(parts[4]) === 1),
          "Export OBJ xyz vertices with no homogeneous weight, or weight 1. Vertex colours are not imported.",
        );
        addVertex(parts.slice(1));
      } else if (parts[0] === "f")
        addPolygon(
          parts.slice(1).map((token) => {
            const n = Number(token.split("/")[0]);
            assert(Number.isInteger(n) && n !== 0, "Invalid OBJ face index.");
            return n > 0 ? n - 1 : vertices.length + n;
          }),
        );
    }
  } else if (extension === "ply") {
    assert(lines[0]?.trim() === "ply", "PLY header is missing.");
    const end = lines.findIndex((l) => l.trim() === "end_header");
    assert(
      end > 0 &&
        end < 300 &&
        lines.slice(0, end).some((l) => /^format ascii 1\.0\s*$/.test(l)),
      "Only ASCII PLY 1.0 is supported; export binary PLY as ASCII first.",
    );
    const elements = [];
    let current = null;
    for (const line of lines.slice(1, end)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === "element") {
        assert(
          Number.isSafeInteger(Number(p[2])) && Number(p[2]) >= 0,
          "Invalid PLY element count.",
        );
        current = { name: p[1], count: Number(p[2]), properties: [] };
        elements.push(current);
      } else if (p[0] === "property") {
        assert(current, "Invalid PLY property.");
        current.properties.push(p.slice(1));
      }
    }
    let cursor = end + 1;
    for (const element of elements) {
      assert(
        ["vertex", "face"].includes(element.name),
        "PLY supports vertex and face elements only; export without other element types.",
      );
      if (element.name === "vertex") {
        assert(
          element.count <= GEOMETRY_LIMITS.vertices &&
            element.properties.every((p) => p[0] !== "list"),
          "Unsupported vertex properties or oversized point cloud.",
        );
        const indices = ["x", "y", "z"].map((name) =>
          element.properties.findIndex((p) => p.at(-1) === name),
        );
        assert(
          indices.every((n) => n >= 0),
          "PLY must include x, y and z properties.",
        );
        for (let k = 0; k < element.count; k++) {
          const values = (lines[cursor++] || "").trim().split(/\s+/);
          assert(
            values.length >= element.properties.length,
            "PLY vertex data is incomplete.",
          );
          addVertex(indices.map((n) => values[n]));
        }
      } else {
        assert(
          element.count <= GEOMETRY_LIMITS.faces &&
            element.properties.length === 1 &&
            element.properties[0][0] === "list" &&
            ["vertex_indices", "vertex_index"].includes(
              element.properties[0].at(-1),
            ),
          "Export PLY faces with only a vertex_indices list.",
        );
        for (let k = 0; k < element.count; k++) {
          const values = (lines[cursor++] || "")
              .trim()
              .split(/\s+/)
              .map(Number),
            n = values.shift();
          assert(
            Number.isInteger(n) && values.length === n,
            "Invalid PLY face list.",
          );
          addPolygon(values);
        }
      }
    }
  } else {
    assert(
      ["xyz", "csv", "txt"].includes(extension),
      "Supported formats: XYZ/CSV text, ASCII PLY and OBJ. Export native CAD/point-cloud files to one of these first.",
    );
    let headerSeen = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const values = trimmed.includes(",")
        ? trimmed.split(",").map((v) => v.trim())
        : trimmed.split(/\s+/);
      if (
        !vertices.length &&
        !headerSeen &&
        values
          .slice(0, 3)
          .map((v) => v.toLowerCase())
          .join(",") === "x,y,z"
      ) {
        headerSeen = true;
        continue;
      }
      addVertex(values);
    }
  }
  return validateGeometry({
    id: uuid(),
    name: filename,
    format: extension.toUpperCase(),
    unit,
    synthetic: false,
    vertices,
    faces,
  });
}
function geometryPage() {
  const g = state.geometry,
    targets = visible().filter(editable);
  return (
    heading(
      "GEOMETRY / COORDINATE MEASUREMENTS",
      "3D / point-cloud lab",
      "Inspect local mesh / point-cloud geometry and measure distances in declared model units.",
      button("geometry-synthetic", "Load synthetic pipe", "", "secondary"),
    ) +
    `<div class="notice">${g.synthetic ? "SYNTHETIC MODEL · Known-coordinate training example." : "LOCAL IMPORT · Coordinate scale is declared by you; field calibration and accuracy are unverified."} This viewer does not reconstruct 3D from photographs.</div><div class="geometry-layout"><section class="panel geometry-panel"><div class="geometry-toolbar"><strong>${esc(g.name)}</strong><span>${g.vertices.length.toLocaleString()} points · ${g.faces.length.toLocaleString()} triangles · ${g.unit === "unknown" ? "Units unknown" : g.unit}</span></div><div class="geometry-controls">${button("geometry-reset", "Reset view", "", "secondary")}${button("geometry-in", "Zoom +", "", "secondary")}${button("geometry-out", "Zoom −", "", "secondary")}<label><input id="geometry-picking" type="checkbox" checked> Pick A/B points</label></div><canvas id="geometry-canvas" aria-label="3D geometry viewport. Drag to rotate, shift-drag to pan; choose vertices with the point fields below." tabindex="0"></canvas><p class="note-small">Drag to rotate · Shift-drag to pan · Wheel / buttons to zoom · Click a point to pick A then B. Vertex numbers provide keyboard access. Blue = A, orange = B.</p></section><aside><section class="panel padded"><h2>Import local geometry</h2><form data-form="geometry-import"><label for="geometry-file">XYZ/CSV, ASCII PLY or OBJ</label><input id="geometry-file" name="geometryFile" type="file" accept=".xyz,.csv,.txt,.ply,.obj" required><label for="geometry-unit">Coordinate units from source</label><select id="geometry-unit" name="unit" required><option value="">Choose declared units</option>${options({ m: "Metres", cm: "Centimetres", mm: "Millimetres", unknown: "Unknown — viewing only" })}</select><p class="note-small">8 MB · 20,000 vertices · 20,000 triangles. Materials/textures and external file references are ignored. Import replaces the active model; saved measurements retain their endpoints.</p><button class="btn secondary full">Import geometry</button></form></section><section class="panel padded"><h2>Two-point coordinate distance</h2><form data-form="measurement"><input name="modelId" type="hidden" value="${g.id}"><div class="point-inputs"><label>Vertex A (0-based)<input id="point-a" name="pointA" type="number" min="0" max="${g.vertices.length - 1}" step="1" value="0" required></label><label>Vertex B (0-based)<input id="point-b" name="pointB" type="number" min="0" max="${g.vertices.length - 1}" step="1" value="${g.synthetic ? 160 : 1}" required></label></div><output id="geometry-distance" aria-live="polite"></output><p class="note-small">Euclidean distance in model coordinates. Decimal display does not establish measurement precision. Check source units, scale and registration independently.</p><label for="measurement-target">Save to editable inspection</label><select id="measurement-target" name="inspectionId" required><option value="">Choose inspection</option>${targets.map((i) => `<option value="${i.id}">${esc(i.reference)} · ${esc(asset(i.assetId).identifier)}</option>`).join("")}</select>${field("Measurement label", "name", "", "text", true, 140)}${area("Measurement context / limitations", "note", "", true, 1000)}<button class="btn primary full" ${g.unit === "unknown" || !targets.length ? "disabled" : ""}>Save coordinate measurement</button>${!targets.length ? '<p class="muted">Switch to Inspector and create a draft inspection to save a measurement.</p>' : ""}</form></section></aside></div><section class="panel padded"><h2>Supported engineering evidence</h2><p>OBJ meshes demonstrate inspection of exported CAD geometry; XYZ/CSV and ASCII PLY demonstrate point-cloud handling. Upload raster drawings, isometrics, P&IDs and CAD screenshots in an inspection to annotate equipment tags and features.</p><p class="note-small">Native AutoCAD/Navisworks/Recap formats, LAS/LAZ processing, calibrated survey metrology and photogrammetric reconstruction require separate tooling and validated source data.</p></section>`
  );
}
function initGeometry() {
  const canvas = $("#geometry-canvas"),
    context = canvas.getContext("2d"),
    g = state.geometry;
  let yaw = -0.45,
    pitch = 0.35,
    zoom = 1,
    pan = [0, 0],
    projected = [],
    pending = 0,
    drag = null,
    nextPoint = "a",
    disposed = false;
  const bounds = [0, 1, 2].map((k) => {
    let min = Infinity,
      max = -Infinity;
    for (const p of g.vertices) {
      min = Math.min(min, p[k]);
      max = Math.max(max, p[k]);
    }
    return [min, max];
  });
  const center = bounds.map(([min, max]) => (min + max) / 2),
    span = Math.max(...bounds.map(([min, max]) => max - min), 1e-9);
  function selected() {
    return ["a", "b"].map((k) => Number($("#point-" + k)?.value));
  }
  function updateDistance() {
    const [a, b] = selected(),
      p = g.vertices[a],
      q = g.vertices[b],
      out = $("#geometry-distance");
    if (!out) return;
    out.textContent =
      p && q
        ? `${Math.hypot(...p.map((v, k) => v - q[k])).toFixed(4)} ${g.unit === "unknown" ? "model units (undeclared)" : g.unit}`
        : "Choose valid vertex indices.";
    schedule();
  }
  function draw() {
    pending = 0;
    if (disposed) return;
    const rect = canvas.getBoundingClientRect(),
      w = rect.width,
      h = rect.height,
      dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "#102834";
    context.fillRect(0, 0, w, h);
    context.strokeStyle = "#213e4a";
    context.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, h);
      context.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(w, y);
      context.stroke();
    }
    const scale = ((Math.min(w, h) * 0.65) / span) * zoom,
      cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    projected = g.vertices.map((v) => {
      const [x, y, z] = v.map((n, k) => n - center[k]),
        rx = cy * x + sy * z,
        rz = -sy * x + cy * z;
      return [
        w / 2 + rx * scale + pan[0],
        h / 2 - (cp * y - sp * rz) * scale + pan[1],
        sp * y + cp * rz,
      ];
    });
    if (g.faces.length) {
      const ordered = g.faces
        .map((f) => ({ f, z: f.reduce((s, k) => s + projected[k][2], 0) / 3 }))
        .sort((a, b) => a.z - b.z);
      for (const { f } of ordered) {
        context.beginPath();
        f.forEach((n, k) =>
          k
            ? context.lineTo(...projected[n].slice(0, 2))
            : context.moveTo(...projected[n].slice(0, 2)),
        );
        context.closePath();
        context.fillStyle = "#245967";
        context.fill();
        context.strokeStyle = "#4ba797";
        context.lineWidth = 0.6;
        context.stroke();
      }
    } else {
      context.fillStyle = "#74d8c1";
      for (const [x, y] of projected) context.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const ids = selected();
    if (ids.every((n) => projected[n])) {
      context.beginPath();
      context.moveTo(...projected[ids[0]].slice(0, 2));
      context.lineTo(...projected[ids[1]].slice(0, 2));
      context.strokeStyle = "#ffd887";
      context.lineWidth = 2;
      context.stroke();
    }
    ids.forEach((n, k) => {
      if (!projected[n]) return;
      const [x, y] = projected[n];
      context.fillStyle = k ? "#ffbd62" : "#7cbcff";
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
      context.font = "bold 14px system-ui";
      context.fillText((k ? "B" : "A") + ": " + n, x + 10, y - 10);
    });
    context.fillStyle = "#c2dedb";
    context.font = "13px system-ui";
    context.fillText(
      `X / Y / Z model coordinates · ${g.synthetic ? "SYNTHETIC" : "Imported"} · ${g.unit}`,
      18,
      h - 18,
    );
  }
  function schedule() {
    if (!pending && !disposed) pending = requestAnimationFrame(draw);
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  canvas.addEventListener("pointerdown", (e) => {
    drag = { start: point(e), last: point(e), moved: false, pan: e.shiftKey };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = point(e),
      dx = p[0] - drag.last[0],
      dy = p[1] - drag.last[1];
    if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > 4)
      drag.moved = true;
    if (drag.moved) {
      if (drag.pan) {
        pan[0] += dx;
        pan[1] += dy;
      } else {
        yaw += dx * 0.008;
        pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.008));
      }
      schedule();
    }
    drag.last = p;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag && !drag.moved && $("#geometry-picking").checked) {
      const p = point(e);
      let best = -1,
        distance = 14;
      projected.forEach(([x, y], k) => {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < distance) {
          distance = d;
          best = k;
        }
      });
      if (best >= 0) {
        $("#point-" + nextPoint).value = best;
        nextPoint = nextPoint === "a" ? "b" : "a";
        dirty = true;
        updateDistance();
      }
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.1, Math.min(20, zoom * Math.exp(-e.deltaY * 0.001)));
      schedule();
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (e) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "-",
        "0",
      ].includes(e.key)
    ) {
      e.preventDefault();
      if (e.key === "ArrowLeft") yaw -= 0.1;
      if (e.key === "ArrowRight") yaw += 0.1;
      if (e.key === "ArrowUp") pitch -= 0.1;
      if (e.key === "ArrowDown") pitch += 0.1;
      if (e.key === "+") zoom = Math.min(20, zoom * 1.2);
      if (e.key === "-") zoom = Math.max(0.1, zoom / 1.2);
      if (e.key === "0") {
        yaw = -0.45;
        pitch = 0.35;
        zoom = 1;
        pan = [0, 0];
      }
      schedule();
    }
  });
  for (const k of ["a", "b"])
    $("#point-" + k).addEventListener("input", updateDistance);
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  geometryView = {
    dispose() {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(pending);
    },
    command(action) {
      if (action === "geometry-reset") {
        yaw = -0.45;
        pitch = 0.35;
        zoom = 1;
        pan = [0, 0];
      } else
        zoom = Math.max(
          0.1,
          Math.min(20, zoom * (action === "geometry-in" ? 1.2 : 1 / 1.2)),
        );
      schedule();
    },
  };
  updateDistance();
}
async function geometryForm(form, data, value) {
  if (form.dataset.form === "geometry-import") {
    const file = form.elements.geometryFile.files[0];
    assert(
      file && file.size <= GEOMETRY_LIMITS.bytes,
      "Choose a geometry text file of at most 8 MB.",
    );
    assert(
      ["m", "cm", "mm", "unknown"].includes(value("unit")),
      "Declare source coordinate units.",
    );
    const geometry = parseGeometry(await file.text(), file.name, value("unit"));
    await mutate(() => {
      state.geometry = geometry;
    }, `Imported ${geometry.vertices.length} model vertices.`);
    return true;
  }
  if (form.dataset.form === "measurement") {
    await mutate(
      () => {
        const i = requireEditable(value("inspectionId")),
          g = state.geometry,
          a = Number(value("pointA")),
          b = Number(value("pointB"));
        assert(
          g.id === value("modelId"),
          "The active model changed. Reload before measuring.",
        );
        assert(
          ["m", "cm", "mm"].includes(g.unit),
          "Measurement requires declared model units.",
        );
        assert(
          Number.isInteger(a) &&
            Number.isInteger(b) &&
            g.vertices[a] &&
            g.vertices[b] &&
            a !== b,
          "Select two different valid vertices.",
        );
        assert(
          value("name") &&
            value("name").length <= 140 &&
            value("note") &&
            value("note").length <= 1000,
          "Add a measurement label and its context / limitations.",
        );
        const p = g.vertices[a],
          q = g.vertices[b],
          distance = Math.hypot(...p.map((n, k) => n - q[k]));
        assert(distance > 0, "Selected points have identical coordinates.");
        state.measurements.push({
          id: uuid(),
          inspectionId: i.id,
          name: value("name"),
          source: g.name,
          unit: g.unit,
          a: [...p],
          b: [...q],
          distance,
          synthetic: g.synthetic,
          note: value("note"),
          at: now(),
        });
        touch(i);
        event(
          i,
          "Model-coordinate distance saved",
          `${value("name")}: ${distance.toFixed(4)} ${g.unit}; ${g.synthetic ? "synthetic example" : "calibration / accuracy unverified"}.`,
        );
      },
      "Model-coordinate measurement saved.",
      `#/inspection/${value("inspectionId")}`,
    );
    return true;
  }
  return false;
}
async function geometryAction(action) {
  if (["geometry-reset", "geometry-in", "geometry-out"].includes(action)) {
    geometryView?.command(action);
    return true;
  }
  if (action === "geometry-synthetic") {
    if (!allowAbandon()) return true;
    await mutate(() => {
      state.geometry = syntheticGeometry();
    }, "Synthetic model loaded.");
    return true;
  }
  return false;
}
