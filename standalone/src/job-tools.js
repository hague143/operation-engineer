/* Job-aligned tools. Embedded inside offline.js's private application scope. */
const DISCIPLINES = {
  general: "General / unclassified",
  mechanical: "Mechanical",
  structural: "Structural",
  hydraulic: "Hydraulic / process",
};
const COMPONENTS = {
  pipe: "Pipe / spool",
  flange: "Flange",
  valve: "Valve",
  pump: "Pump",
  weld: "Weld / seam",
  tank_shell: "Tank shell",
  support: "Pipe / equipment support",
  beam: "Beam",
  column: "Column / pile",
  joint: "Connection / joint",
  bracing: "Bracing",
  inlet: "Inlet",
  outlet: "Outlet",
  drain: "Drain",
  channel: "Channel / culvert",
  gate: "Gate / hydraulic control",
  other: "Other component",
};
const EVIDENCE_TYPES = {
  photo: "Inspection photograph",
  pid: "P&ID / process diagram",
  isometric: "Isometric / engineering drawing",
  cad: "CAD screenshot",
  schematic: "Schematic / synthetic example",
};
const CONDITIONS = {
  unassessed: "Not assessed",
  no_indication: "No indication in supplied evidence",
  monitor: "Follow-up / monitoring required",
  priority_review: "Priority engineering review required",
};
const QA_CHECKS = {
  inspector: {
    quality: "Image clarity and coverage reviewed",
    labels: "Defect / feature labels and equipment tags checked",
    rectangles: "Rectangle placement checked against supplied evidence",
    duplicates: "Potential duplicate/overlapping records reviewed",
    observations: "Observations describe visible evidence only",
    followup: "Follow-up actions and scope limitations checked",
  },
  reviewer: {
    evidence: "All photographs / drawings and saved records reviewed",
    taxonomy: "Discipline, component tags and rectangle labels reviewed",
    basis: "Assessment basis, references and limitations reviewed",
    actions: "Recommended follow-up and measurements reviewed",
    history: "Previous review comments and changes checked",
  },
};
const isFeature = (f) => f.kind === "feature";
const defects = (id) => findings(id).filter((f) => !isFeature(f));
const recordTitle = (f) =>
  isFeature(f) ? COMPONENTS[f.component] || "Feature" : CATEGORIES[f.category];
const severityText = (f) =>
  isFeature(f) ? "Feature identified" : SEVERITIES[f.severity];
const recordClass = (f) => (isFeature(f) ? "feature" : f.severity);
const recordColor = (f) => (isFeature(f) ? "#387fb5" : COLORS[f.severity]);
let geometryView = null;
function emptyQa() {
  return { inspector: {}, reviewer: {} };
}
function qaComplete(i, role) {
  return Object.keys(QA_CHECKS[role]).every(
    (key) => i.qa?.[role]?.[key] === true,
  );
}
function referenceAssessment(raw = {}) {
  const clean = (key, max = 10000) => {
    const value = raw[key] ?? "";
    assert(
      typeof value === "string" && value.length <= max,
      "Invalid assessment text.",
    );
    return value;
  };
  const framework = raw.framework || "demo",
    family = raw.family || "none",
    condition = raw.condition || "unassessed";
  assert(
    ["demo", "client", "reference"].includes(framework) &&
      ["none", "client", "API", "NACE", "ASCE", "ASME"].includes(family) &&
      Object.hasOwn(CONDITIONS, condition),
    "Invalid assessment basis.",
  );
  return {
    framework,
    family,
    condition,
    reference: clean("reference", 300),
    criteria: clean("criteria"),
    rationale: clean("rationale"),
    limitations: clean("limitations"),
    due: clean("due", 10),
  };
}
function enrichJobState(result, raw) {
  const text = (value, max = 140) => {
    assert(
      typeof value === "string" && value.length <= max,
      "Invalid job-tool metadata.",
    );
    return value;
  };
  for (const i of result.inspections) {
    const source = raw.inspections.find((v) => v.id === i.id);
    i.assessment = referenceAssessment(source.assessment);
    i.qa = emptyQa();
    for (const role of ["inspector", "reviewer"]) {
      const data = source.qa?.[role] || {};
      for (const key of Object.keys(QA_CHECKS[role]))
        i.qa[role][key] = data[key] === true;
      i.qa[role + "At"] = text(source.qa?.[role + "At"] || "", 40);
    }
  }
  for (const p of result.photos) {
    const source = raw.photos.find((v) => v.id === p.id);
    p.evidenceType = source.evidenceType || "photo";
    assert(
      Object.hasOwn(EVIDENCE_TYPES, p.evidenceType),
      "Invalid evidence type.",
    );
  }
  for (const f of result.findings) {
    const source = raw.findings.find((v) => v.id === f.id);
    f.kind = source.kind || "defect";
    f.discipline = source.discipline || "general";
    f.component = source.component || "";
    f.tag = text(source.tag || "", 40);
    assert(
      ["defect", "feature"].includes(f.kind) &&
        Object.hasOwn(DISCIPLINES, f.discipline) &&
        (!f.component || Object.hasOwn(COMPONENTS, f.component)) &&
        (!isFeature(f) || f.component),
      "Invalid feature/component annotation.",
    );
  }
  result.measurements = (raw.measurements || []).map((m) => {
    assert((raw.measurements || []).length <= 1000, "Too many measurements.");
    assert(
      result.inspections.some((i) => i.id === m.inspectionId) &&
        Array.isArray(m.a) &&
        Array.isArray(m.b) &&
        [...m.a, ...m.b].every(Number.isFinite) &&
        m.a.length === 3 &&
        m.b.length === 3 &&
        ["m", "cm", "mm"].includes(m.unit),
      "Invalid coordinate measurement.",
    );
    return {
      id: text(m.id, 80),
      inspectionId: text(m.inspectionId, 80),
      name: text(m.name),
      source: text(m.source, 255),
      unit: m.unit,
      a: [...m.a],
      b: [...m.b],
      distance: Math.hypot(...m.a.map((n, k) => n - m.b[k])),
      synthetic: !!m.synthetic,
      note: text(m.note, 1000),
      at: text(m.at, 40),
    };
  });
  assert(
    new Set(result.measurements.map((m) => m.id)).size ===
      result.measurements.length,
    "Duplicate measurement identifiers.",
  );
  result.geometry = raw.geometry
    ? validateGeometry(raw.geometry)
    : syntheticGeometry();
  return result;
}
function seedJobTools(s) {
  s.measurements = [];
  s.geometry = syntheticGeometry();
  for (const f of s.findings)
    Object.assign(f, {
      kind: "defect",
      discipline: "general",
      component: "",
      tag: "",
    });
  for (const i of s.inspections) {
    i.assessment = referenceAssessment({
      limitations:
        "SYNTHETIC DEMO: Supplied visual evidence only. No field measurements, standards assessment or structural certification.",
    });
    i.qa = emptyQa();
    if (["submitted", "approved"].includes(i.status))
      for (const key of Object.keys(QA_CHECKS.inspector))
        i.qa.inspector[key] = true;
    if (i.status === "approved")
      for (const key of Object.keys(QA_CHECKS.reviewer))
        i.qa.reviewer[key] = true;
    const p = s.photos.find((p) => p.inspectionId === i.id);
    p.evidenceType = "schematic";
    const a = s.assets.find((a) => a.id === i.assetId);
    s.findings.push({
      id: uuid(),
      inspectionId: i.id,
      photoId: p.id,
      reference: "F-003",
      kind: "feature",
      discipline: a.type === "marine" ? "structural" : "mechanical",
      component:
        a.type === "tank"
          ? "tank_shell"
          : a.type === "marine"
            ? "beam"
            : "pipe",
      tag: "DEMO-" + a.identifier,
      category: "other",
      severity: null,
      x: 0.14,
      y: 0.35,
      width: 0.15,
      height: 0.2,
      observation:
        "SYNTHETIC DEMO FEATURE: Manually identified component in the supplied schematic.",
      recommendation:
        "Confirm the component identity against the applicable drawing or equipment register.",
      creator: "Alex Morgan",
      createdAt: now(),
      updatedAt: now(),
    });
    i.nextFinding = 4;
  }
  return s;
}
function annotationMetadata(edit) {
  return `<div class="field"><label for="record-kind">Record type</label><select id="record-kind" name="kind" ${edit ? "" : "disabled"}><option value="defect">Defect / visible indication</option><option value="feature">Feature / component identification</option></select></div><div class="field"><label for="discipline">Engineering discipline</label><select id="discipline" name="discipline" ${edit ? "" : "disabled"}>${options(DISCIPLINES, "general")}</select></div><div class="field"><label for="component">Feature / component</label><select id="component" name="component" ${edit ? "" : "disabled"}><option value="">Unspecified / choose component</option>${options(COMPONENTS)}</select></div><div class="field"><label for="equipment-tag">Equipment / drawing tag</label><input id="equipment-tag" name="tag" maxlength="40" placeholder="e.g. V-101, flange F2, support S3" ${edit ? "" : "disabled"}></div>`;
}
function updateFindingFields() {
  const f = $("#annotation-form");
  if (!f) return;
  const feature = f.elements.kind.value === "feature",
    edit = editable(inspection(photo(f.dataset.photo).inspectionId));
  for (const name of ["category", "severity"]) {
    f.elements[name].closest(".field").hidden = feature;
    f.elements[name].required = !feature && edit;
    f.elements[name].disabled = feature || !edit;
  }
  f.elements.component.required = feature && edit;
}
function readFindingFields(value) {
  const kind = value("kind") || "defect",
    feature = kind === "feature",
    discipline = value("discipline") || "general",
    component = value("component");
  assert(
    ["defect", "feature"].includes(kind) &&
      Object.hasOwn(DISCIPLINES, discipline) &&
      (!component || Object.hasOwn(COMPONENTS, component)) &&
      (!feature || component),
    "Choose the record type, discipline and a component for feature records.",
  );
  assert(
    feature ||
      (Object.hasOwn(CATEGORIES, value("category")) &&
        Object.hasOwn(SEVERITIES, value("severity"))),
    "Choose a valid defect category and preliminary severity.",
  );
  assert(
    value("observation") && value("recommendation"),
    "Complete the observation and recommended follow-up.",
  );
  return {
    kind,
    discipline,
    component,
    tag: value("tag"),
    category: feature ? "other" : value("category"),
    severity: feature ? null : value("severity"),
    observation: value("observation"),
    recommendation: value("recommendation"),
  };
}
function overlapPairs(i) {
  const all = findings(i.id),
    pairs = [];
  for (let a = 0; a < all.length; a++)
    for (let b = a + 1; b < all.length; b++) {
      const p = all[a],
        q = all[b];
      if (
        p.photoId !== q.photoId ||
        isFeature(p) !== isFeature(q) ||
        p.category !== q.category ||
        p.component !== q.component
      )
        continue;
      const area =
        Math.max(
          0,
          Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x),
        ) *
        Math.max(
          0,
          Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y),
        );
      if (area / (p.width * p.height + q.width * q.height - area) > 0.85)
        pairs.push([p.reference, q.reference]);
    }
  return pairs;
}
function qaPanel(i) {
  const role = editable(i) ? "inspector" : reviewable(i) ? "reviewer" : null,
    pairs = overlapPairs(i);
  return `<section class="panel padded qa-panel"><div class="eyebrow">HUMAN QUALITY ASSURANCE</div><h2>QA checklist</h2>${
    pairs.length
      ? `<div class="notice warning">Potential overlaps: ${pairs
          .slice(0, 10)
          .map((p) => p.map(esc).join(" / "))
          .join(
            ", ",
          )}. Review these manually; overlap is not automatically an error.</div>`
      : ""
  }${
    role
      ? `<form data-form="qa" data-id="${i.id}" data-version="${i.version}" data-qa-role="${role}"><p class="muted">${role === "inspector" ? "Complete these checks before submission. Inspection edits clear previous checks." : "Approval requires all reviewer checks. A change request can be recorded while checks remain incomplete."}</p>${Object.entries(
          QA_CHECKS[role],
        )
          .map(
            ([key, label]) =>
              `<label class="qa-check"><input type="checkbox" name="${key}" ${i.qa?.[role]?.[key] ? "checked" : ""}><span>${label}</span></label>`,
          )
          .join(
            "",
          )}<button class="btn secondary full">Save ${role} QA</button></form>`
      : `<p class="muted">Inspector: ${qaComplete(i, "inspector") ? "checklist complete" : "not recorded / incomplete"}<br>Reviewer: ${qaComplete(i, "reviewer") ? "checklist complete" : "not recorded / incomplete"}</p>`
  }</section>`;
}
function assessmentPanel(i) {
  const a = referenceAssessment(i.assessment),
    edit = editable(i);
  return `<section class="panel padded"><div class="section-line"><h2>Assessment basis & limitations</h2>${edit ? button("assessment", "Edit assessment", `data-id="${i.id}"`, "secondary") : ""}</div><div class="assessment-summary"><span class="badge draft">${CONDITIONS[a.condition]}</span><p><strong>${a.framework === "demo" ? "Illustrative portfolio rubric" : a.framework === "client" ? "Client-defined criteria" : "User-supplied reference document"}</strong> · ${esc(a.family)}</p>${a.reference ? `<p class="prose">Reference / revision / clause: ${esc(a.reference)}</p>` : ""}${a.criteria ? `<p class="prose"><strong>Criteria:</strong> ${paragraphs(a.criteria)}</p>` : ""}${a.rationale ? `<p class="prose"><strong>Engineering rationale:</strong> ${paragraphs(a.rationale)}</p>` : ""}<p class="prose">${paragraphs(a.limitations || "Assessment is limited to supplied evidence. Engineering verification is required.")}</p>${a.due ? `<p>Follow-up due: ${esc(a.due)}</p>` : ""}<p class="note-small">API, NACE, ASCE and ASME entries are reference metadata only. No licensed code rules, compliance checks or certified condition grades are built in.</p></div></section>`;
}
function assessmentDialog(id) {
  const i = requireEditable(id),
    a = referenceAssessment(i.assessment);
  openDialog(
    "Assessment basis & limitations",
    "assessment",
    `<div class="notice">Enter a defensible, preliminary assessment of the supplied evidence. Reference fields do not implement or certify a standard.</div><label for="basis-framework">Assessment basis</label><select id="basis-framework" name="framework">${options({ demo: "Illustrative portfolio rubric", client: "Client-defined criteria", reference: "User-supplied reference document" }, a.framework)}</select><label for="standard-family">Reference family (metadata only)</label><select id="standard-family" name="family">${options({ none: "None / portfolio example", client: "Client framework", API: "API — reference only", NACE: "NACE — reference only", ASCE: "ASCE — reference only", ASME: "ASME — reference only" }, a.family)}</select>${field("Document / revision / clause", "reference", a.reference, "text", false, 300)}${area("User-supplied assessment criteria", "criteria", a.criteria, false)}<label for="condition-grade">Preliminary condition / action</label><select id="condition-grade" name="condition">${options(CONDITIONS, a.condition)}</select>${area("Rationale linked to saved evidence", "rationale", a.rationale, false)}${area("Scope / evidence limitations", "limitations", a.limitations, true)}${field("Follow-up due (optional)", "due", a.due, "date", false)}`,
    `data-id="${id}" data-version="${i.version}"`,
  );
}
function measurementReport(i) {
  const rows = (state.measurements || []).filter(
    (m) => m.inspectionId === i.id,
  );
  return `<section class="panel padded"><h2>Model-coordinate measurements <span class="count-tag">${rows.length}</span></h2>${rows.length ? rows.map((m) => `<div class="measurement-record"><strong>${esc(m.name)}: ${m.distance.toFixed(4)} ${m.unit}</strong><p class="prose">${esc(m.source)} · ${m.synthetic ? "Synthetic known-coordinate example" : "User-declared coordinate units; calibration / accuracy unverified"}<br>A: ${m.a.map((v) => v.toFixed(4)).join(", ")} · B: ${m.b.map((v) => v.toFixed(4)).join(", ")}</p><p class="prose">${esc(m.note)}</p>${editable(i) ? button("delete-measurement", "Delete measurement", `data-id="${m.id}"`, "delete-text") : ""}</div>`).join("") : `<p class="muted">Open the 3D / point-cloud lab to select two model points and save a coordinate distance. Photographs do not supply physical scale.</p>`}</section>`;
}
function jobReport(i) {
  const a = referenceAssessment(i.assessment);
  return `<section class="job-report"><h3>Assessment basis & scope limitations</h3><p>${esc(a.framework)} · ${esc(a.family)} · ${CONDITIONS[a.condition]}</p>${a.reference ? `<p>Reference / revision / clause: ${esc(a.reference)}</p>` : ""}<p class="prose">${paragraphs(a.criteria)}</p><p class="prose">${paragraphs(a.rationale)}</p><p class="prose">${paragraphs(a.limitations || "Supplied visual evidence only; qualified engineering verification required.")}</p><p class="note-small">References are user-entered metadata. No built-in industry-standard compliance assessment is performed.</p>${a.due ? `<p>Follow-up due: ${esc(a.due)}</p>` : ""}<h3>Quality assurance</h3>${[
    "inspector",
    "reviewer",
  ]
    .map(
      (role) =>
        `<p><strong>${role === "inspector" ? "Inspector" : "Reviewer"}:</strong> ${
          Object.entries(QA_CHECKS[role])
            .filter(([key]) => i.qa?.[role]?.[key])
            .map(([, label]) => esc(label))
            .join("; ") || "Checks not recorded / legacy record"
        }</p>`,
    )
    .join("")}${measurementReport(i)}</section>`;
}
function syntheticPid() {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f1f5f3";
  c.fillRect(0, 0, 1400, 900);
  c.fillStyle = "#143e47";
  c.fillRect(0, 0, 1400, 130);
  c.fillStyle = "#b6ebdf";
  c.font = "bold 32px system-ui";
  c.fillText("SYNTHETIC PROCESS / P&ID-STYLE EXERCISE", 40, 55);
  c.font = "22px system-ui";
  c.fillText(
    "Illustrative symbols only · Not a plant design or industry-compliant drawing",
    40,
    100,
  );
  c.strokeStyle = "#355b69";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(100, 450);
  c.lineTo(1300, 450);
  c.stroke();
  c.strokeRect(110, 260, 150, 130);
  c.beginPath();
  c.moveTo(185, 390);
  c.lineTo(185, 450);
  c.stroke();
  c.beginPath();
  c.arc(480, 450, 68, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(450, 410);
  c.lineTo(525, 450);
  c.lineTo(450, 490);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.moveTo(780, 400);
  c.lineTo(850, 450);
  c.lineTo(780, 500);
  c.closePath();
  c.moveTo(920, 400);
  c.lineTo(850, 450);
  c.lineTo(920, 500);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.moveTo(850, 400);
  c.lineTo(850, 340);
  c.lineTo(900, 340);
  c.stroke();
  c.fillStyle = "#355b69";
  c.font = "26px system-ui";
  c.fillText("TK-101", 125, 245);
  c.fillText("P-101 / PUMP", 385, 565);
  c.fillText("V-101 / VALVE", 765, 565);
  c.fillText("INLET", 75, 520);
  c.fillText("OUTLET", 1150, 520);
  c.beginPath();
  c.moveTo(1150, 435);
  c.lineTo(1180, 450);
  c.lineTo(1150, 465);
  c.closePath();
  c.fill();
  c.font = "23px system-ui";
  c.fillText(
    "Exercise: identify mechanical/hydraulic features and equipment tags manually.",
    90,
    725,
  );
  c.fillText(
    "Flow direction and symbols are illustrative; no safety or design inference is supported.",
    90,
    770,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}
function filteredRecords() {
  const p = new URLSearchParams(location.hash.split("?")[1] || ""),
    ids = new Set(
      visible()
        .filter(
          (i) =>
            (!p.get("asset") || i.assetId === p.get("asset")) &&
            (!p.get("status") || i.status === p.get("status")),
        )
        .map((i) => i.id),
    );
  return state.findings.filter(
    (f) =>
      ids.has(f.inspectionId) &&
      (!p.get("kind") ||
        (isFeature(f) ? "feature" : "defect") === p.get("kind")) &&
      (!p.get("discipline") || f.discipline === p.get("discipline")) &&
      (!p.get("q") ||
        [
          f.reference,
          f.observation,
          f.tag,
          recordTitle(f),
          inspection(f.inspectionId).reference,
          asset(inspection(f.inspectionId).assetId).name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(p.get("q").toLowerCase())),
  );
}
function summaryRows(records) {
  const map = new Map();
  for (const f of records) {
    const i = inspection(f.inspectionId),
      a = asset(i.assetId),
      key = a.id + ":" + (f.component || "unspecified");
    if (!map.has(key))
      map.set(key, {
        asset: a.identifier,
        name: a.name,
        component: COMPONENTS[f.component] || "Unspecified",
        features: 0,
        defects: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    const row = map.get(key);
    row[isFeature(f) ? "features" : "defects"]++;
    if (!isFeature(f)) row[f.severity]++;
  }
  return [...map.values()];
}
function exportRows(records) {
  return [
    [
      "Inspection",
      "Reference",
      "Record type",
      "Discipline",
      "Component",
      "Equipment tag",
      "Defect category",
      "Preliminary severity",
      "Evidence file",
      "Evidence type",
      "Rectangle X (normalized)",
      "Rectangle Y (normalized)",
      "Rectangle width (normalized)",
      "Rectangle height (normalized)",
      "Observation",
      "Follow-up",
    ],
    ...records.map((f) => [
      inspection(f.inspectionId).reference,
      f.reference,
      isFeature(f) ? "Feature" : "Defect",
      DISCIPLINES[f.discipline] || DISCIPLINES.general,
      COMPONENTS[f.component] || "",
      f.tag || "",
      isFeature(f) ? "" : CATEGORIES[f.category],
      isFeature(f) ? "" : SEVERITIES[f.severity],
      photo(f.photoId).name,
      EVIDENCE_TYPES[photo(f.photoId).evidenceType || "photo"],
      f.x,
      f.y,
      f.width,
      f.height,
      f.observation,
      f.recommendation,
    ]),
  ];
}
function downloadCsv(name, rows) {
  const safe = (v) => {
    let s = String(v ?? "");
    if (/^[\t\r\n]/.test(s) || /^\s*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  download(
    name,
    "\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
function analyticsPage() {
  const records = filteredRecords(),
    summary = summaryRows(records),
    params = new URLSearchParams(location.hash.split("?")[1] || ""),
    page = Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    pages = Math.max(1, Math.ceil(records.length / 25)),
    current = Math.min(page, pages);
  return (
    heading(
      "DATA REVIEW / SPREADSHEETS",
      "Analysis & worklist",
      "Filter saved records, review asset/component counts, and export spreadsheet-ready evidence.",
      button("workbook", "Download Excel XML workbook", "", "secondary") +
        button("records-csv", "Export filtered CSV"),
    ) +
    `<section class="panel"><form class="filter-bar analytics-filter" data-form="analytics-filter"><input name="q" aria-label="Search worklist" value="${esc(params.get("q") || "")}" placeholder="Search tag, observation, reference…"><select name="asset" aria-label="Filter asset"><option value="">All assets</option>${state.assets.map((a) => `<option value="${a.id}" ${params.get("asset") === a.id ? "selected" : ""}>${esc(a.identifier)}</option>`).join("")}</select><select name="status" aria-label="Filter inspection status"><option value="">All statuses</option>${options(STATUS, params.get("status"))}</select><select name="kind" aria-label="Filter record type"><option value="">Defects & features</option>${options({ defect: "Defects", feature: "Features" }, params.get("kind"))}</select><select name="discipline" aria-label="Filter discipline"><option value="">All disciplines</option>${options(DISCIPLINES, params.get("discipline"))}</select><button class="btn secondary">Apply worklist filters</button></form></section><div class="stats-grid">${[
      ["Matching records", records.length],
      ["Defect indications", records.filter((f) => !isFeature(f)).length],
      ["Identified features", records.filter(isFeature).length],
      [
        "High preliminary severity",
        records.filter((f) => !isFeature(f) && f.severity === "high").length,
      ],
    ]
      .map(
        ([name, n]) =>
          `<div class="stat-card"><div class="stat-label">${name}</div><div class="stat-value">${n}</div></div>`,
      )
      .join(
        "",
      )}</div><section class="panel"><div class="panel-heading"><h2>Asset / component summary</h2>${button("summary-csv", "Export summary CSV", "", "secondary")}</div><div class="table-scroll"><table><thead><tr><th>Asset</th><th>Component</th><th>Features</th><th>Defects</th><th>High / Medium / Low</th></tr></thead><tbody>${summary.map((r) => `<tr><td>${esc(r.asset)}<span class="table-secondary">${esc(r.name)}</span></td><td>${r.component}</td><td>${r.features}</td><td>${r.defects}</td><td>${r.high} / ${r.medium} / ${r.low}</td></tr>`).join("") || '<tr><td colspan="5">No matching saved records.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-heading"><h2>Evidence worklist · ${records.length} records</h2><span>Page ${current} / ${pages}</span></div><div class="table-scroll"><table><thead><tr><th>Inspection / Record</th><th>Type / Component</th><th>Discipline / Tag</th><th>Observation</th><th>Open</th></tr></thead><tbody>${
      records
        .slice((current - 1) * 25, current * 25)
        .map(
          (f) =>
            `<tr><td>${esc(inspection(f.inspectionId).reference)}<span class="table-secondary">${esc(f.reference)}</span></td><td>${isFeature(f) ? "Feature" : "Defect"} · ${recordTitle(f)}</td><td>${DISCIPLINES[f.discipline] || "General"}<span class="table-secondary">${esc(f.tag || "No tag")}</span></td><td class="worklist-observation">${esc(f.observation.slice(0, 160))}</td><td><a href="#/photo/${f.photoId}" class="text-link">Open evidence</a></td></tr>`,
        )
        .join("") || '<tr><td colspan="5">No matching records.</td></tr>'
    }</tbody></table></div><div class="pagination">${button("worklist-page", "Previous", `data-page="${Math.max(1, current - 1)}"`, "secondary")}<span>25 records per page</span>${button("worklist-page", "Next", `data-page="${Math.min(pages, current + 1)}"`, "secondary")}</div></section><p class="note-small">Counts describe saved annotations, not verified engineering condition. This browser demo has bounded local storage and is not an industrial large-volume processing platform. CSV imports into Excel or Google Sheets; the multi-sheet XML workbook is Excel SpreadsheetML, not .xlsx.</p>`
  );
}
function excelWorkbook() {
  const records = filteredRecords(),
    s = summaryRows(records),
    visibleIds = new Set(visible().map((i) => i.id));
  const sheets = {
    Findings: exportRows(records),
    "Asset summary": [
      [
        "Asset",
        "Name",
        "Component",
        "Features",
        "Defects",
        "High",
        "Medium",
        "Low",
      ],
      ...s.map((r) => [
        r.asset,
        r.name,
        r.component,
        r.features,
        r.defects,
        r.high,
        r.medium,
        r.low,
      ]),
    ],
    QA: [
      [
        "Inspection",
        "Status",
        "Inspector checks complete",
        "Reviewer checks complete",
        "Condition",
        "Reference family",
        "Document/revision/clause",
      ],
      ...visible().map((i) => [
        i.reference,
        STATUS[i.status],
        qaComplete(i, "inspector") ? "Yes" : "No",
        qaComplete(i, "reviewer") ? "Yes" : "No",
        CONDITIONS[i.assessment?.condition || "unassessed"],
        i.assessment?.family || "none",
        i.assessment?.reference || "",
      ]),
    ],
    Measurements: [
      [
        "Inspection",
        "Label",
        "Source",
        "Distance",
        "Model units",
        "Synthetic",
        "Calibration status",
      ],
      ...(state.measurements || [])
        .filter((m) => visibleIds.has(m.inspectionId))
        .map((m) => [
          inspection(m.inspectionId).reference,
          m.name,
          m.source,
          m.distance,
          m.unit,
          m.synthetic ? "Yes" : "No",
          m.synthetic
            ? "Synthetic known coordinates"
            : "User-declared units; accuracy unverified",
        ]),
    ],
  };
  const xmlEsc = (v) =>
    String(v)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[c],
      );
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    Object.entries(sheets)
      .map(
        ([name, rows]) =>
          `<Worksheet ss:Name="${name}"><Table>${rows.map((row) => "<Row>" + row.map((value) => `<Cell><Data ss:Type="${typeof value === "number" && Number.isFinite(value) ? "Number" : "String"}">${xmlEsc(value)}</Data></Cell>`).join("") + "</Row>").join("")}</Table></Worksheet>`,
      )
      .join("") +
    "</Workbook>";
  download("AssetInspect-workbook.xml", xml, "application/xml;charset=utf-8");
}
function jobGuide() {
  return `<section class="panel padded job-guide"><h2>Job-aligned workbenches</h2><div class="guide-grid"><div class="guide-card"><h3>Defects & features</h3><p>Choose Defect or Feature, then add mechanical/structural/hydraulic discipline, component and equipment tag. Drawings and P&ID-style evidence use the same manual editor.</p></div><div class="guide-card"><h3>QA & assessment</h3><p>Inspector checks are required for submission and clear after evidence edits. Reviewer checks are required for approval. Record preliminary rationale, limitations and supplied document references.</p></div><div class="guide-card"><h3>Data & 3D</h3><p>Use Analysis & worklist for filters, CSV and an Excel XML workbook. The 3D lab imports XYZ/CSV, ASCII PLY and OBJ geometry, with explicitly declared model-coordinate units.</p></div></div><p class="prose">This file does not reconstruct photogrammetry, read native DWG/RVT/NWD/RCP/RCS/LAS/LAZ, apply licensed inspection codes or certify measurement accuracy. Original AutoCAD/Navisworks/Recap proficiency and real standards-based engineering assessment require separate software, data and qualified verification.</p></section>`;
}
async function jobForm(form, data, value) {
  const kind = form.dataset.form;
  if (kind === "analytics-filter") {
    dirty = false;
    location.hash =
      "#/analytics?" + new URLSearchParams(Object.fromEntries(data));
    return true;
  }
  if (kind === "qa") {
    await mutate(() => {
      const i = inspection(form.dataset.id),
        role = form.dataset.qaRole;
      assert(
        i &&
          i.version === Number(form.dataset.version) &&
          (role === "inspector" ? editable(i) : reviewable(i)),
        "QA is unavailable or the inspection changed. Reload before saving.",
      );
      i.qa = i.qa || emptyQa();
      i.qa[role] = Object.fromEntries(
        Object.keys(QA_CHECKS[role]).map((key) => [key, data.has(key)]),
      );
      i.qa[role + "At"] = now();
      touch(i, false);
      event(
        i,
        role === "inspector" ? "Inspector QA saved" : "Reviewer QA saved",
        `${Object.values(i.qa[role]).filter(Boolean).length}/${Object.keys(QA_CHECKS[role]).length} manual checks completed.`,
      );
    }, "QA checklist saved.");
    return true;
  }
  if (kind === "assessment") {
    await mutate(() => {
      const i = requireEditable(form.dataset.id, form.dataset.version),
        a = referenceAssessment(Object.fromEntries(data));
      assert(
        a.framework === "demo" || (a.reference && a.criteria),
        "Supply the document reference and criteria for a client/reference-based assessment.",
      );
      assert(
        a.family === "none" || a.reference,
        "A reference family requires a supplied document / revision / clause.",
      );
      assert(
        a.condition === "unassessed" || a.rationale,
        "Explain the preliminary condition / action using saved evidence.",
      );
      assert(a.limitations, "Record the evidence and scope limitations.");
      i.assessment = a;
      touch(i);
      event(
        i,
        "Assessment basis updated",
        `${a.framework} · ${a.family} · ${CONDITIONS[a.condition]}; reference metadata only.`,
      );
    }, "Assessment basis saved.");
    return true;
  }
  if (kind === "geometry-import" || kind === "measurement")
    return geometryForm(form, data, value);
  return false;
}
async function jobAction(action, b) {
  if (action === "assessment") {
    assessmentDialog(b.dataset.id);
    return true;
  }
  if (action === "synthetic-pid") {
    await mutate(() => {
      const i = requireEditable(b.dataset.id);
      state.photos.push({
        id: uuid(),
        inspectionId: i.id,
        name: "synthetic-process-diagram.jpg",
        caption:
          "SYNTHETIC DEMO · P&ID-style symbol exercise; not a design drawing",
        dataUrl: syntheticPid(),
        width: 1400,
        height: 900,
        evidenceType: "pid",
        at: now(),
      });
      touch(i);
      event(
        i,
        "Synthetic P&ID-style evidence added",
        "Illustrative process symbols for manual component annotation.",
      );
    }, "Synthetic diagram added.");
    return true;
  }
  if (action === "records-csv") {
    downloadCsv(
      "AssetInspect-filtered-records.csv",
      exportRows(filteredRecords()),
    );
    return true;
  }
  if (action === "summary-csv") {
    downloadCsv("AssetInspect-asset-summary.csv", [
      [
        "Asset",
        "Name",
        "Component",
        "Features",
        "Defects",
        "High",
        "Medium",
        "Low",
      ],
      ...summaryRows(filteredRecords()).map((r) => [
        r.asset,
        r.name,
        r.component,
        r.features,
        r.defects,
        r.high,
        r.medium,
        r.low,
      ]),
    ]);
    return true;
  }
  if (action === "workbook") {
    excelWorkbook();
    return true;
  }
  if (action === "worklist-page") {
    const p = new URLSearchParams(location.hash.split("?")[1] || "");
    p.set("page", b.dataset.page);
    location.hash = "#/analytics?" + p;
    return true;
  }
  if (action === "delete-measurement") {
    const m = state.measurements.find((m) => m.id === b.dataset.id);
    if (m && confirm("Delete this saved model-coordinate measurement?"))
      await mutate(() => {
        const i = requireEditable(m.inspectionId);
        state.measurements = state.measurements.filter((v) => v.id !== m.id);
        touch(i);
        event(i, "Model measurement deleted", m.name);
      }, "Measurement deleted.");
    return true;
  }
  return geometryAction(action, b);
}
