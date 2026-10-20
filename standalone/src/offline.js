/* AssetInspect offline portfolio demo. All state and role checks are local to
 * this browser. The Django app is the server-authenticated implementation. */
(() => {
  "use strict";
  const STATUS = {
    draft: "Draft",
    submitted: "Submitted",
    changes: "Changes Requested",
    approved: "Approved",
  };
  const TYPES = {
    pipeline: "Pipeline",
    tank: "Tank",
    steel: "Steel structure",
    marine: "Marine structure",
    other: "Other",
  };
  const CATEGORIES = {
    corrosion: "Corrosion signs",
    coating: "Coating damage",
    crack: "Visible crack indication",
    leakage: "Leakage signs",
    deformation: "Deformation",
    other: "Other",
  };
  const SEVERITIES = { low: "Low", medium: "Medium", high: "High" };
  const COLORS = { low: "#198c80", medium: "#d29a34", high: "#d94c61" };
  const USERS = {
    inspector: { id: "demo-inspector", name: "Alex Morgan", role: "Inspector" },
    reviewer: { id: "demo-reviewer", name: "Jordan Lee", role: "Reviewer" },
  };
  const DISCLAIMER =
    "Independent portfolio demonstration. Findings are based on supplied visual evidence and require appropriate engineering verification. This report does not certify structural integrity or compliance with inspection standards.";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icon = (name, extra = "") =>
    `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const uuid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);
  const date = (value) =>
    new Date(
      value.length === 10 ? value + "T12:00:00" : value,
    ).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const paragraphs = (value) => esc(value).replace(/\n/g, "<br>");
  const badge = (status) =>
    `<span class="badge ${status}">${STATUS[status]}</span>`;
  const options = (choices, current = "") =>
    Object.entries(choices)
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === current ? "selected" : ""}>${label}</option>`,
      )
      .join("");
  let state,
    db = null,
    storageMessage = "",
    actor = "inspector",
    dirty = false,
    busy = false,
    editor = null,
    toastTimer,
    channel = null;
  let workspaceId = "default";
  const embedded = JSON.parse($("#initial-data").textContent);
  if (
    embedded?.workspaceId &&
    /^[a-zA-Z0-9-]{1,80}$/.test(embedded.workspaceId)
  )
    workspaceId = embedded.workspaceId;
  const databaseName = `AssetInspect-offline-v1-${workspaceId}`;
  const person = () => USERS[actor];
  const asset = (id) => state.assets.find((a) => a.id === id);
  const inspection = (id) => state.inspections.find((i) => i.id === id);
  const photo = (id) => state.photos.find((p) => p.id === id);
  const photos = (id) => state.photos.filter((p) => p.inspectionId === id);
  const findings = (id) => state.findings.filter((f) => f.inspectionId === id);
  const annotations = (id) => state.findings.filter((f) => f.photoId === id);
  const visible = () =>
    state.inspections.filter((i) =>
      actor === "inspector"
        ? i.inspector === person().id
        : i.status !== "draft",
    );
  const editable = (i) =>
    actor === "inspector" &&
    i.inspector === person().id &&
    ["draft", "changes"].includes(i.status);
  const reviewable = (i) =>
    actor === "reviewer" &&
    i.inspector !== person().id &&
    i.status === "submitted";
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  function toast(message, error = false) {
    const target = $("#feedback");
    target.textContent = message;
    target.classList.toggle("error", error);
    target.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (target.hidden = true), error ? 8500 : 5000);
  }
  function event(i, action, comment = "", previous = "", status = "") {
    state.events.push({
      id: uuid(),
      inspectionId: i.id,
      actor: person().name,
      action,
      comment,
      previous,
      status,
      at: now(),
    });
  }
  function touch(i, invalidate = true) {
    if (invalidate) i.qa = emptyQa();
    i.assessment ||= referenceAssessment();
    i.version++;
    i.updatedAt = now();
  }
  function requireEditable(id, version) {
    const i = inspection(id);
    assert(
      i && editable(i),
      "This inspection is read-only for the selected demo role.",
    );
    if (version !== undefined)
      assert(
        i.version === Number(version),
        "The saved inspection changed. Reload it before saving.",
      );
    return i;
  }
  function rectangular(box) {
    return (
      [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.width > 0 &&
      box.height > 0 &&
      box.x + box.width <= 1 &&
      box.y + box.height <= 1
    );
  }
  function syntheticImage(kind = "pipeline") {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    const c = canvas.getContext("2d");
    c.fillStyle = "#dbe6e8";
    c.fillRect(0, 0, 1400, 900);
    c.strokeStyle = "#c5d5da";
    c.lineWidth = 1;
    for (let x = 0; x < 1400; x += 50) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 900);
      c.stroke();
    }
    for (let y = 0; y < 900; y += 50) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(1400, y);
      c.stroke();
    }
    c.strokeStyle = "#5a7b88";
    c.lineWidth = 4;
    if (kind === "tank") {
      c.fillStyle = "#adbec4";
      c.fillRect(350, 250, 710, 390);
      c.strokeRect(350, 250, 710, 390);
      c.fillStyle = "#c6d7db";
      c.beginPath();
      c.ellipse(705, 250, 355, 105, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      [390, 520].forEach((y) => {
        c.beginPath();
        c.moveTo(350, y);
        c.lineTo(1060, y);
        c.stroke();
      });
      c.strokeRect(1080, 240, 28, 480);
      for (let y = 250; y < 720; y += 40) {
        c.beginPath();
        c.moveTo(1080, y);
        c.lineTo(1108, y);
        c.stroke();
      }
    } else if (kind === "marine" || kind === "steel") {
      c.fillStyle = "#7c99a4";
      [250, 670, 1090].forEach((x) => {
        c.fillRect(x, 210, 60, 490);
        c.strokeRect(x, 210, 60, 490);
      });
      [240, 640].forEach((y) => {
        c.fillRect(210, y, 970, 45);
        c.strokeRect(210, y, 970, 45);
      });
      c.lineWidth = 26;
      c.beginPath();
      c.moveTo(280, 280);
      c.lineTo(700, 640);
      c.moveTo(700, 280);
      c.lineTo(1120, 640);
      c.stroke();
    } else {
      const gradient = c.createLinearGradient(0, 300, 0, 510);
      gradient.addColorStop(0, "#728e99");
      gradient.addColorStop(0.45, "#b7ced3");
      gradient.addColorStop(1, "#607e89");
      c.fillStyle = gradient;
      c.fillRect(90, 310, 1220, 200);
      c.strokeRect(90, 310, 1220, 200);
      c.fillStyle = "#627b86";
      [330, 760, 1100].forEach((x) => {
        c.fillRect(x, 295, 42, 230);
        c.strokeRect(x, 295, 42, 230);
      });
      c.fillRect(490, 510, 25, 150);
      c.fillRect(900, 510, 25, 150);
      c.fillRect(440, 660, 540, 35);
    }
    c.fillStyle = "#a76b43";
    [
      [550, 380, 23],
      [575, 403, 15],
      [530, 415, 13],
      [590, 382, 10],
    ].forEach(([x, y, r]) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    });
    c.strokeStyle = "#eee6ce";
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(480, 470);
    c.lineTo(555, 485);
    c.lineTo(620, 468);
    c.stroke();
    c.fillStyle = "#153d45";
    c.fillRect(0, 0, 1400, 125);
    c.fillRect(0, 815, 1400, 85);
    c.fillStyle = "#a0e6d8";
    c.font = "bold 34px system-ui";
    c.fillText("SYNTHETIC DEMONSTRATION IMAGE", 45, 60);
    c.font = "23px system-ui";
    c.fillStyle = "#c3dedf";
    c.fillText(
      "AssetInspect / Schematic evidence only / No real asset assessment",
      45,
      100,
    );
    c.fillText(
      "DEMO DATA · Drawn locally · Not an actual inspection photograph",
      45,
      865,
    );
    return canvas.toDataURL("image/jpeg", 0.88);
  }
  function seed() {
    const s = {
      format: 1,
      assets: [],
      inspections: [],
      photos: [],
      findings: [],
      events: [],
    };
    const rows = [
      [
        "DEMO-PL-001",
        "North transfer pipeline",
        "pipeline",
        "North process area",
      ],
      ["DEMO-TK-002", "Water storage tank", "tank", "Utility compound"],
      ["DEMO-ST-003", "Jetty support structure", "marine", "East waterfront"],
    ];
    const images = Object.fromEntries(
      rows.map((r) => [r[2], syntheticImage(r[2])]),
    );
    rows.forEach(([identifier, name, type, location], index) =>
      s.assets.push({
        id: `asset-${index + 1}`,
        identifier,
        name,
        type,
        location: `Demonstration site · ${location}`,
        description:
          "SYNTHETIC DEMO ASSET. Illustrative portfolio data, not real infrastructure.",
        createdAt: now(),
      }),
    );
    ["draft", "submitted", "changes", "approved"].forEach((status, n) => {
      const a = s.assets[n % 3],
        id = `inspection-${n + 1}`,
        pId = `photo-${n + 1}`;
      const i = {
        id,
        reference: `DEMO-INSP-${String(n + 1).padStart(3, "0")}`,
        assetId: a.id,
        date: today(),
        inspector: "demo-inspector",
        scope:
          "SYNTHETIC DEMO: Review the supplied schematic for visible surface indications. Record manual observations only.",
        notes:
          "Independent portfolio example. The findings are synthetic and require no real engineering action.",
        status,
        noDefects: false,
        version: 0,
        nextFinding: 3,
        createdAt: now(),
        updatedAt: now(),
      };
      s.inspections.push(i);
      s.photos.push({
        id: pId,
        inspectionId: id,
        name: "synthetic-demo.jpg",
        caption: "SYNTHETIC DEMO · Illustrative surface condition",
        dataUrl: images[a.type],
        width: 1400,
        height: 900,
        at: now(),
      });
      [
        ["corrosion", "medium", 0.36, 0.38, 0.1, 0.13],
        ["coating", "low", 0.34, 0.5, 0.12, 0.06],
      ].forEach(([category, severity, x, y, width, height], k) =>
        s.findings.push({
          id: `finding-${n}-${k}`,
          inspectionId: id,
          photoId: pId,
          reference: `F-00${k + 1}`,
          category,
          severity,
          x,
          y,
          width,
          height,
          observation:
            "SYNTHETIC DEMO FINDING: Illustrative surface indication in a locally drawn schematic.",
          recommendation:
            "DEMO ONLY: In an actual inspection, request qualified engineering verification.",
          creator: "Alex Morgan",
          createdAt: now(),
          updatedAt: now(),
        }),
      );
      s.events.push({
        id: uuid(),
        inspectionId: id,
        actor: "Alex Morgan",
        action: "Inspection created",
        comment: "Synthetic demonstration dataset.",
        previous: "",
        status: "draft",
        at: now(),
      });
      if (status !== "draft")
        s.events.push({
          id: uuid(),
          inspectionId: id,
          actor: "Alex Morgan",
          action: "Submitted for review",
          comment: "",
          previous: "draft",
          status: "submitted",
          at: now(),
        });
      if (status === "changes" || status === "approved")
        s.events.push({
          id: uuid(),
          inspectionId: id,
          actor: "Jordan Lee",
          action: status === "changes" ? "Changes requested" : "Approved",
          comment:
            status === "changes"
              ? "DEMO: Please clarify the indication location and recommended follow-up."
              : "DEMO: Reviewed the supplied synthetic evidence. This is not engineering certification.",
          previous: "submitted",
          status,
          at: now(),
        });
    });
    return seedJobTools(s);
  }
  async function openStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Browser storage is blocked by another open copy."));
    });
  }
  function readStorage() {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("records")
        .objectStore("records")
        .get("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function writeStorage(value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(value, "workspace");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function mutate(change, message, target) {
    if (busy) {
      toast("A save is already in progress.");
      return false;
    }
    busy = true;
    const previous = structuredClone(state);
    try {
      if (db)
        await new Promise((resolve, reject) => {
          const tx = db.transaction("records", "readwrite"),
            store = tx.objectStore("records");
          const request = store.get("workspace");
          let failure = null;
          request.onsuccess = () => {
            try {
              if (request.result) state = validateState(request.result);
              change();
              state = validateState(state);
              store.put(state, "workspace");
            } catch (error) {
              failure = error;
              tx.abort();
            }
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(failure || tx.error);
          tx.onabort = () =>
            reject(failure || tx.error || new Error("Save cancelled."));
        });
      else {
        change();
        state = validateState(state);
      }
      dirty = false;
      $("#form-dialog").close();
      channel?.postMessage("updated");
      if (target && location.hash !== target) {
        location.hash = target;
      } else render();
      toast(
        message +
          (db ? "" : " (temporary session; download a copy to keep it)"),
      );
      return true;
    } catch (error) {
      state = previous;
      const message =
        error?.name === "QuotaExceededError"
          ? "Browser storage is full. Export a backup, then remove unneeded photos or use a smaller image."
          : error?.message ||
            "Could not save. Export your work before closing this file.";
      toast(message, true);
      const box = $(".dialog-error", $("#form-dialog"));
      if (box) box.textContent = message;
      return false;
    } finally {
      busy = false;
    }
  }
  function heading(eyebrow, title, subtitle, buttons = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${esc(title)}<span class="heading-dot">.</span></h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${buttons}</div></div>`;
  }
  function button(action, label, extra = "", style = "primary") {
    return `<button type="button" class="btn ${style}" data-action="${action}" ${extra}>${label}</button>`;
  }
  function table(items, reportMode = false) {
    return `<div class="table-scroll"><table><thead><tr><th>Inspection / Asset</th><th>Inspection date</th><th>Evidence</th><th>Status</th><th>Open</th></tr></thead><tbody>${items.length ? items.map((i) => `<tr><td><a class="table-primary" href="#/${reportMode ? "report" : "inspection"}/${i.id}">${esc(i.reference)}</a><span class="table-secondary">${esc(asset(i.assetId).name)}</span></td><td>${date(i.date)}<span class="table-secondary">Alex Morgan</span></td><td>${icon("photo")} ${photos(i.id).length} photos<span class="table-secondary">${findings(i.id).length} findings</span></td><td>${badge(i.status)}</td><td><a class="row-arrow" href="#/${reportMode ? "report" : "inspection"}/${i.id}" aria-label="Open ${esc(i.reference)}">${icon("arrow")}</a></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state"><h3>No inspections here yet</h3><p>Create an inspection, or change the search/filter.</p></div></td></tr>`}</tbody></table></div>`;
  }
  function overview() {
    const items = visible(),
      fs = state.findings.filter((f) =>
        items.some((i) => i.id === f.inspectionId),
      );
    const metrics = [
      ["Total assets", state.assets.length, "asset", "#/assets"],
      ["Total inspections", items.length, "inspect", "#/inspections"],
      [
        "Awaiting review",
        items.filter((i) => i.status === "submitted").length,
        "clock",
        "#/reviews",
      ],
      [
        "Approved",
        items.filter((i) => i.status === "approved").length,
        "check",
        "#/reports",
      ],
    ];
    return (
      heading(
        "YOUR PORTFOLIO, READY TO EXPLORE",
        "Inspection overview",
        "Visual evidence. Human observations. A traceable review workflow.",
        actor === "inspector"
          ? button("new-inspection", `${icon("plus")} New inspection`)
          : "",
      ) +
      `
      <section class="overview-banner"><div><span class="banner-kicker"><span class="live-dot"></span> INTERACTIVE OFFLINE PORTFOLIO</span><h2>Know your assets.<br>See every detail.</h2><p>Explore a complete inspection workflow.<br>One file. No installation. No account needed.</p><a href="#/guide">Start the five-minute walkthrough ${icon("arrow")}</a></div><svg class="infrastructure-art" viewBox="0 0 570 230" fill="none" aria-hidden="true"><g stroke="#70b8b2" stroke-width="1.4"><path d="m50 180 215-100 230 82-215 65Z" opacity=".3"/><ellipse cx="190" cy="85" rx="59" ry="23"/><path d="M131 85v78c0 29 118 29 118 0V85M131 160c0 30 118 30 118 0M139 130c20 17 91 17 110 0m47 20 76 25 90-42V72l-76-25-90 43v60Zm0-60 76 26 90-44m-90 44v59M249 133h24v55h26m33-118V30m24 28V20M99 156v-38h32"/></g><g stroke="#38d5bf" stroke-width="2"><rect x="165" y="103" width="49" height="38" rx="2"/><path d="m214 120 45-25h35"/></g><text x="275" y="84" fill="#8ac3be" font-family="monospace" font-size="9">VISUAL EVIDENCE</text></svg></section>
      <div class="stats-grid">${metrics.map(([label, count, name, href], n) => `<a class="stat-card ${n === 2 ? "amber-stat" : n === 3 ? "teal-stat" : ""}" href="${href}"><div class="stat-label">${label}${icon(name)}</div><div class="stat-value">${String(count).padStart(2, "0")}</div><span>Based on saved records ${icon("arrow")}</span></a>`).join("")}</div>
      <section class="panel"><div class="panel-heading"><div><h2>Recent inspections</h2><p>Open an example or create your own synthetic inspection.</p></div><a href="#/inspections" class="text-link">View all ${icon("arrow")}</a></div>${table([...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6))}</section>
      <div class="dashboard-bottom"><section class="panel"><div class="panel-heading"><div><h2>Findings at a glance</h2><p>Manually recorded · Preliminary severity</p></div></div><div class="findings-overview"><div class="severity-summary">${Object.entries(
        SEVERITIES,
      )
        .map(
          ([key, label]) =>
            `<div><i class="severity-dot ${key}"></i><strong>${fs.filter((f) => f.severity === key).length}</strong><span>${label}</span></div>`,
        )
        .join("")}</div><div class="category-chart">${Object.entries(CATEGORIES)
        .map(([key, label]) => {
          const n = fs.filter((f) => f.category === key).length;
          return `<div class="category-row"><span>${label}</span><div class="bar-track"><span style="width:${fs.length ? (n / fs.length) * 100 : 0}%"></span></div><strong>${n}</strong></div>`;
        })
        .join(
          "",
        )}</div></div></section><section class="panel"><div class="panel-heading"><div><h2>Made for a hands-on review</h2><p>Try the workflow from both perspectives.</p></div></div><div class="padded"><ol class="guide-list"><li>Create an inspection as Inspector.</li><li>Add a photo and draw a finding.</li><li>Submit and switch to Reviewer.</li><li>Request changes, resubmit, approve.</li><li>Export a report or shareable HTML.</li></ol><a class="btn secondary" href="#/guide">Open walkthrough ${icon("arrow")}</a></div></section></div>`
    );
  }
  function assetsPage() {
    return (
      heading(
        "KNOW YOUR INFRASTRUCTURE",
        "Asset register",
        "A single place for assets and their inspection history.",
        actor === "inspector"
          ? button("new-asset", `${icon("plus")} Register asset`)
          : "",
      ) +
      `<div class="asset-grid">${state.assets.map((a) => `<a href="#/asset/${a.id}" class="asset-card"><div class="asset-visual ${a.type}">${icon("asset")}<span>${TYPES[a.type]}</span><span class="asset-visual-ref">${esc(a.identifier)}</span></div><div class="asset-card-content"><div class="eyebrow">${esc(a.identifier)}</div><h2>${esc(a.name)}</h2><p>${icon("pin")}${esc(a.location)}</p><div class="asset-card-footer"><span>View asset & inspection history</span>${icon("arrow")}</div></div></a>`).join("")}</div>`
    );
  }
  function assetPage(id) {
    const a = asset(id);
    assert(a, "Asset not found.");
    return (
      `<a class="back-link" href="#/assets">${icon("arrow", "back")} Asset register</a>` +
      heading(
        `${esc(a.identifier)} / ${TYPES[a.type]}`,
        a.name,
        a.location,
        actor === "inspector"
          ? button(
              "edit-asset",
              "Edit asset",
              `data-id="${a.id}"`,
              "secondary",
            ) +
              button("new-inspection", "New inspection", `data-asset="${a.id}"`)
          : "",
      ) +
      `<section class="panel padded"><h2>About this asset</h2><p class="prose">${paragraphs(a.description || "No description recorded.")}</p><small class="muted">Asset details are locked when an associated inspection is Submitted or Approved.</small></section><section class="panel"><div class="panel-heading"><h2>Inspection history</h2></div>${table(visible().filter((i) => i.assetId === id))}</section>`
    );
  }
  function listPage(kind) {
    const review = kind === "reviews",
      reports = kind === "reports";
    if (review)
      assert(
        actor === "reviewer",
        "Switch to Reviewer to open the review queue.",
      );
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const query = params.get("q") || "",
      status = params.get("status") || "";
    let items = visible();
    if (review) items = items.filter((i) => reviewable(i));
    if (query)
      items = items.filter((i) =>
        (
          i.reference +
          " " +
          asset(i.assetId).name +
          " " +
          asset(i.assetId).identifier
        )
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    if (status) items = items.filter((i) => i.status === status);
    return (
      heading(
        review
          ? "A SECOND SET OF EYES"
          : reports
            ? "EVIDENCE YOU CAN SHARE"
            : "EVIDENCE, CONNECTED",
        review
          ? "Review queue"
          : reports
            ? "Inspection reports"
            : "Inspections",
        review
          ? "Submitted inspections awaiting a simulated independent review."
          : reports
            ? "Saved findings, annotated photographs, and review history."
            : "Manage observations from first photograph to final review.",
        !review && !reports && actor === "inspector"
          ? button("new-inspection", `${icon("plus")} New inspection`)
          : "",
      ) +
      `<section class="panel">${!review ? `<form class="filter-bar" data-form="filter"><label class="search-field">${icon("search")}<input name="q" value="${esc(query)}" placeholder="Search reference or asset…" aria-label="Search inspections"></label><select name="status" aria-label="Filter by status"><option value="">All statuses</option>${options(STATUS, status)}</select><button class="btn secondary">Apply filters</button></form>` : ""}${table(items, reports)}</section>`
    );
  }
  function audit(i) {
    return `<ol class="audit-list">${state.events
      .filter((e) => e.inspectionId === i.id)
      .slice()
      .reverse()
      .map(
        (e) =>
          `<li><strong>${esc(e.action)}</strong><small>${esc(e.actor)} · ${date(e.at)}</small>${e.comment ? `<p class="prose">${paragraphs(e.comment)}</p>` : ""}${e.status ? badge(e.status) : ""}</li>`,
      )
      .join("")}</ol>`;
  }
  function workspace(id) {
    const i = inspection(id);
    assert(
      i && visible().some((v) => v.id === id),
      "This inspection is unavailable for the selected demo role.",
    );
    const a = asset(i.assetId),
      ps = photos(id),
      fs = findings(id),
      edit = editable(i);
    return (
      `<a class="back-link" href="#/inspections">${icon("arrow", "back")} Inspections</a>` +
      heading(
        `INSPECTION WORKSPACE / ${esc(a.identifier)}`,
        i.reference,
        `${a.name} · ${a.location}`,
        (edit
          ? button(
              "edit-inspection",
              "Edit details",
              `data-id="${id}"`,
              "secondary",
            )
          : "") +
          `<a class="btn primary" href="#/report/${id}">${icon("report")} View report</a>`,
      ) +
      `<div class="status-heading" style="margin-bottom:20px">${badge(i.status)}<span class="muted">${date(i.date)} · Alex Morgan</span></div>
      <div class="workflow-strip"><span class="complete">01 <strong>Asset & scope</strong></span><span class="${ps.length ? "complete" : ""}">02 <strong>Visual evidence</strong></span><span class="${i.status !== "draft" ? "complete" : ""}">03 <strong>Review</strong></span><span class="${i.status === "approved" ? "complete" : ""}">04 <strong>Report</strong></span></div>
      ${i.status === "changes" ? `<div class="notice warning">Changes requested. Read the reviewer’s comments in the audit trail, update the findings, and resubmit.</div>` : !edit ? `<div class="notice">Evidence is read-only. ${reviewable(i) ? "Review all photographs, findings, and previous comments before deciding." : "Saved observations and report exports are available below."}</div>` : ""}
      <div class="workspace-layout"><div><section class="panel padded"><h2>Inspection scope</h2><p class="prose">${paragraphs(i.scope)}</p>${i.notes ? `<h3>General notes</h3><p class="prose">${paragraphs(i.notes)}</p>` : ""}</section>
      ${assessmentPanel(i)}${measurementReport(i)}<section class="panel padded"><div class="section-line"><div><h2>Visual evidence <span class="count-tag">${ps.length}</span></h2><p class="muted">Open a photograph to ${edit ? "annotate visible indications" : "view saved annotations"}.</p></div>${icon("photo")}</div><div class="photo-grid">${ps.length ? ps.map((p) => `<article class="photo-card"><a href="#/photo/${p.id}"><img src="${p.dataUrl}" alt="${esc(p.caption || p.name)}"><div class="photo-card-info"><strong>${esc(p.caption || p.name)}</strong><span>${EVIDENCE_TYPES[p.evidenceType || "photo"]} · ${annotations(p.id).length} records ${icon("arrow")}</span></div></a>${edit ? button("delete-photo", "Delete photograph", `data-id="${p.id}"`, "delete-text") : ""}</article>`).join("") : `<div class="empty-state">${icon("photo")}<h3>Your evidence starts here</h3><p>Upload a test image or add a synthetic schematic below.</p></div>`}</div>
      ${edit ? `<form class="upload-area" data-form="upload" data-id="${id}" data-version="${i.version}"><h3>Add inspection photographs</h3><p>JPEG/PNG · 10 MB each · 8 files per batch · 20 MP maximum</p><div class="input-row"><label for="images">Inspection photographs</label><input type="file" id="images" name="images" accept="image/jpeg,image/png" multiple required></div><div class="input-row"><label for="evidence-type">Evidence type</label><select id="evidence-type" name="evidenceType">${options(EVIDENCE_TYPES, "photo")}</select></div><div class="input-row"><label for="caption">Caption (optional)</label><input id="caption" name="caption" maxlength="300" placeholder="Describe the supplied evidence…"></div><div class="button-group"><button class="btn secondary">${icon("plus")} Upload photographs</button>${button("synthetic", "Add synthetic example", `data-id="${id}"`, "secondary")}${button("synthetic-pid", "Add synthetic P&ID", `data-id="${id}"`, "secondary")}</div></form>` : ""}</section>
      <section class="panel padded"><h2>Recorded findings <span class="count-tag">${fs.length}</span></h2>${fs.length ? fs.map((f) => `<article class="finding-detail"><div class="section-line"><h3><a href="#/photo/${f.photoId}">${esc(f.reference)} · ${recordTitle(f)}</a></h3><span class="badge severity-${recordClass(f)}">${severityText(f)}${isFeature(f) ? "" : " · Preliminary"}</span></div><p class="note-small">${DISCIPLINES[f.discipline] || "General"} · ${COMPONENTS[f.component] || "Unspecified component"}${f.tag ? " · Tag: " + esc(f.tag) : ""}</p><p class="prose">${paragraphs(f.observation)}</p><div class="follow-up"><strong>Recommended follow-up</strong><p class="prose">${paragraphs(f.recommendation)}</p></div></article>`).join("") : `<p class="muted">${i.noDefects ? "No visible defects observed in the supplied photographs. This does not imply the entire asset is defect-free." : "No findings recorded yet."}</p>`}</section></div>
      <aside class="workspace-aside">${qaPanel(i)}${edit ? `<section class="panel padded"><div class="eyebrow">NEXT STEP</div><h2>Ready for review?</h2><p class="muted">Submission locks editing. At least one photograph is required.</p><form data-form="submit" data-id="${id}" data-version="${i.version}">${!defects(id).length ? `<div class="checkbox-field"><input type="checkbox" id="no-defects" name="noDefects"><label for="no-defects">No visible defects observed in the supplied photographs</label></div>` : ""}<button class="btn primary full">Submit for review ${icon("arrow")}</button></form></section>` : ""}
      ${reviewable(i) ? `<section class="panel padded review-panel"><div class="eyebrow">SIMULATED INDEPENDENT REVIEW</div><h2>Record your decision</h2><p class="muted">Review all saved evidence and comments. Change requests require an explanation.</p><form data-form="review" data-id="${id}" data-version="${i.version}"><p><label for="decision">Decision</label><select id="decision" name="decision"><option value="approve">Approve inspection</option><option value="changes">Request changes</option></select></p><p><label for="comment">Review comment</label><textarea id="comment" name="comment" rows="4" maxlength="20000" placeholder="Record your review and any required changes…"></textarea></p><button class="btn primary full">Save review decision</button></form></section>` : ""}
      <section class="panel padded"><h2>Audit trail</h2><p class="muted">Saved local demonstration history</p>${audit(i)}</section><p class="note-small">Demo role switching is simulated in this browser. The Django implementation provides server-side authentication and authorization.</p></aside></div>`
    );
  }
  function editorPage(id) {
    const p = photo(id);
    assert(p, "Photograph not found.");
    const i = inspection(p.inspectionId);
    assert(
      visible().some((v) => v.id === i.id),
      "Switch to Inspector to view draft evidence.",
    );
    const edit = editable(i),
      as = annotations(id);
    return (
      `<a class="back-link" href="#/inspection/${i.id}">${icon("arrow", "back")} ${esc(i.reference)} / Visual evidence</a>` +
      heading(
        "HUMAN OBSERVATIONS / NORMALIZED RECTANGLES",
        "Annotation workspace",
        p.caption || p.name,
        badge(i.status),
      ) +
      `<div class="editor-layout" id="annotation-editor"><section class="panel editor-canvas-panel"><div class="editor-toolbar"><span>${icon("photo")} ${p.width} × ${p.height}</span><span>${edit ? "Draw a rectangle · Select saved findings to edit" : "Read-only evidence"}</span></div><div class="image-stage"><img id="evidence-image" src="${p.dataUrl}" alt="${esc(p.caption || p.name)}"><svg id="annotation-overlay" viewBox="0 0 ${p.width} ${p.height}" preserveAspectRatio="none" aria-label="Photograph annotation rectangles"></svg></div><div class="editor-legend">${Object.entries(
        SEVERITIES,
      )
        .map(
          ([key, label]) =>
            `<span><i class="severity-dot ${key}"></i>${label}</span>`,
        )
        .join(
          "",
        )}<span><i class="severity-dot feature"></i>Feature</span><small>Preliminary severity · Not a measurement tool</small></div><div class="editor-feedback" id="editor-feedback" role="status">${edit ? "Drag around a visible indication, or enter normalized coordinates below." : "Select a saved finding to inspect its details."}</div>${edit ? `<details class="coordinate-help"><summary>Keyboard-accessible rectangle entry</summary><p>Image fractions from 0 to 1. X/Y specify the top-left corner.</p><div class="coordinate-inputs">${["x", "y", "width", "height"].map((key) => `<label>${key.toUpperCase()}<input type="number" aria-label="Rectangle ${key}" data-coordinate="${key}" min="0" max="1" step="0.001"></label>`).join("")}</div></details>` : ""}</section><aside><section class="panel padded"><div class="section-line"><h2 id="finding-heading">${edit ? "New finding" : "Finding details"}</h2>${edit ? button("new-finding", "+ New", "", "text-link") : ""}</div><form id="annotation-form" data-form="finding" data-photo="${id}" data-version="${i.version}"><input type="hidden" name="findingId">${annotationMetadata(edit)}<div class="field"><label for="category">Defect category</label><select name="category" id="category" required ${edit ? "" : "disabled"}><option value="">Choose a category</option>${options(CATEGORIES)}</select></div><div class="field"><label for="severity">Preliminary severity</label><select name="severity" id="severity" required ${edit ? "" : "disabled"}><option value="">Choose severity</option>${options(SEVERITIES)}</select></div><div class="field"><label for="observation">Observation</label><textarea name="observation" id="observation" maxlength="10000" required ${edit ? "" : "disabled"} placeholder="Describe only what is visible…"></textarea></div><div class="field"><label for="recommendation">Recommended follow-up</label><textarea name="recommendation" id="recommendation" maxlength="10000" required ${edit ? "" : "disabled"} placeholder="Describe the recommended engineering verification…"></textarea></div>${edit ? button("redraw", "Redraw rectangle", "", "secondary full") + `<button class="btn primary full save-finding">Save finding ${icon("check")}</button>` : ""}</form></section><section class="panel padded"><h2>Saved findings <span class="count-tag">${as.length}</span></h2><div id="saved-findings">${as.map((f) => `<button type="button" class="saved-finding" data-action="select-finding" data-id="${f.id}"><i class="severity-dot ${recordClass(f)}"></i><span><strong>${esc(f.reference)}</strong><small>${recordTitle(f)} · ${severityText(f)}</small></span>${icon("arrow")}</button>`).join("") || `<p class="muted">No findings saved for this photograph.</p>`}</div>${edit ? `<button type="button" id="delete-finding" class="delete-text" data-action="delete-finding" hidden>Delete selected finding</button>` : ""}</section><p class="note-small">Record visible conditions only. Ordinary photographs do not establish crack depth, wall thickness, structural safety, or real-world dimensions.</p></aside></div>`
    );
  }
  function reportPage(id) {
    const i = inspection(id);
    assert(
      i && visible().some((v) => v.id === id),
      "This report is unavailable for the selected role.",
    );
    const a = asset(i.assetId),
      fs = findings(id),
      ps = photos(id);
    document.title = `AssetInspect ${i.reference} · ${STATUS[i.status]}`;
    return (
      `<a class="back-link" href="#/inspection/${id}">${icon("arrow", "back")} Inspection workspace</a>` +
      heading(
        "SAVED RECORD / OFFLINE REPORT",
        "Inspection report",
        "Print this saved record to PDF using your browser.",
        button("csv", "Export findings CSV", `data-id="${id}"`, "secondary") +
          button("print", `${icon("download")} Print / Save PDF`),
      ) +
      `<article class="report-paper"><div class="report-brand">Asset<span>Inspect</span><small>VISUAL INFRASTRUCTURE INSPECTION</small></div>${i.status !== "approved" ? `<div class="draft-warning">DRAFT — NOT APPROVED</div>` : ""}<h2 class="offline-report-title">${esc(i.reference)}</h2>${badge(i.status)}<p class="seed-mark">OFFLINE PORTFOLIO DEMONSTRATION · SIMULATED REVIEW ROLES</p><div class="report-meta"><div><span>ASSET</span><strong>${esc(a.identifier)} · ${esc(a.name)}</strong><p>${TYPES[a.type]}<br>${esc(a.location)}</p></div><div><span>INSPECTION</span><strong>${date(i.date)}</strong><p>Alex Morgan<br>Assigned demo inspector</p></div></div><h3>Scope & general notes</h3><p class="prose">${paragraphs(i.scope)}</p><p class="prose">${paragraphs(i.notes)}</p><h3>Finding summary</h3><p>${ps.length} evidence images · ${defects(id).length} defect indications · ${fs.filter(isFeature).length} identified features</p><p>${Object.entries(
        SEVERITIES,
      )
        .map(
          ([key, label]) =>
            `${label}: ${fs.filter((f) => f.severity === key).length}`,
        )
        .join(
          " · ",
        )}</p>${i.noDefects ? `<p>No visible defects observed in the supplied photographs. This does not imply the entire asset is defect-free.</p>` : ""}
      ${ps
        .map(
          (p, n) =>
            `<section class="report-photo"><h3>Photograph ${n + 1} · ${esc(p.caption || p.name)}</h3><div class="report-image" style="--image-aspect:${p.width / p.height}"><img src="${p.dataUrl}" alt="${esc(p.caption || p.name)}"><svg viewBox="0 0 ${p.width} ${p.height}" preserveAspectRatio="none" aria-label="Saved finding rectangles">${annotations(
              p.id,
            )
              .map(
                (f) =>
                  `<rect x="${f.x * p.width}" y="${f.y * p.height}" width="${f.width * p.width}" height="${f.height * p.height}" stroke="${recordColor(f)}"/><text style="font-size:${p.width * 0.022}px" x="${Math.max(2, Math.min(f.x * p.width, p.width * 0.75))}" y="${Math.max(p.width * 0.025, f.y * p.height - p.width * 0.008)}">${esc(f.reference)} · ${severityText(f)}</text>`,
              )
              .join("")}</svg></div>${annotations(p.id)
              .map(
                (f) =>
                  `<div class="finding-detail"><h4>${esc(f.reference)} · ${recordTitle(f)} <span class="badge severity-${recordClass(f)}">${severityText(f)}${isFeature(f) ? "" : " · Preliminary"}</span></h4><p class="note-small">${DISCIPLINES[f.discipline] || "General"} · ${COMPONENTS[f.component] || "Unspecified component"}${f.tag ? " · Tag: " + esc(f.tag) : ""}</p><p class="prose">${paragraphs(f.observation)}</p><strong>Recommended follow-up</strong><p class="prose">${paragraphs(f.recommendation)}</p></div>`,
              )
              .join("")}</section>`,
        )
        .join("")}
      ${jobReport(i)}<h3>Review & audit history</h3>${state.events
        .filter((e) => e.inspectionId === id)
        .map(
          (e) =>
            `<div class="report-event"><strong>${esc(e.action)}</strong> · ${esc(e.actor)}<small>${date(e.at)}</small><p class="prose">${paragraphs(e.comment)}</p></div>`,
        )
        .join(
          "",
        )}<div class="report-disclaimer">${DISCLAIMER}<p>Offline review roles and local history are a workflow demonstration, not authenticated independent sign-off. No affiliation with any engineering company is claimed.</p></div></article>`
    );
  }
  function guidePage() {
    return (
      heading(
        "ONE FILE / A COMPLETE WALKTHROUGH",
        "Try the portfolio demo",
        "Open locally, explore the workflow, and share a prepared example.",
      ) +
      `<div class="guide-grid"><section class="guide-card"><span>01 / CAPTURE</span><h3>Build the evidence</h3><p>As Inspector, register an asset, create an inspection, upload a JPEG/PNG or add a synthetic example. Draw a visible indication and record a finding.</p></section><section class="guide-card"><span>02 / REVIEW</span><h3>Try both roles</h3><p>Submit, then use the account menu to switch to Reviewer. Request changes with a comment. Update and resubmit as Inspector, then approve as Reviewer.</p></section><section class="guide-card"><span>03 / COMMUNICATE</span><h3>Share your work</h3><p>Export findings CSV, use Print / Save PDF, or download a new shareable HTML containing your saved example for a recruiter.</p></section></div><section class="panel padded" style="margin-top:22px"><h2>Portfolio capabilities</h2><p class="prose">This offline edition demonstrates asset organization, normalized manual photograph annotations, engineering observations, review states, traceable local history, and report communication. It has real browser persistence and works without a server or Internet access.</p><div class="hint-panel">Inspector/Reviewer switching is a simulation, with no password or secure multi-user boundary. The separate Django application implements server-side authentication, object permissions, transactional review transitions, and PDF generation. Local browser records are editable by the browser owner.</div><h3 style="margin-top:24px">Keep or share a prepared example</h3><p class="prose">The original file does not change when you edit records. “Download shareable HTML” embeds the currently saved photographs and observations into a new file. The recipient opens their own independent copy. Inspect the contents before sharing and use synthetic data.</p><div class="button-group">${button("share", `${icon("download")} Download shareable HTML`)}${button("backup", "Export backup", "", "secondary")}${button("restore", "Restore backup", "", "secondary")}</div><h3 style="margin-top:24px">Storage & limitations</h3><p class="prose">Data is saved in this browser’s IndexedDB when permitted. Private browsing, moving the file, browser policies, clearing storage, or switching browser/profile may remove or hide the saved workspace. Export a backup or shareable HTML before moving it. If storage is blocked, the app displays a temporary-session warning.</p><p class="prose">Reports print locally through your browser. Choose Save as PDF in the print dialog. Chrome/Edge on a desktop or laptop are recommended for the drawing editor. Nothing is uploaded anywhere.</p><p class="prose">${DISCLAIMER}</p>${button("reset", "Reset demo data (confirmation required)", "", "secondary")}</section>`
    );
  }
  function render() {
    editor?.observer?.disconnect();
    editor = null;
    geometryView?.dispose();
    geometryView = null;
    const [route, id] = location.hash
      .replace(/^#\/?/, "")
      .split("?")[0]
      .split("/");
    const key = route || "overview";
    document.title = "AssetInspect · Offline portfolio demo";
    document.body.classList.toggle("report-active", key === "report");
    const nav = [
      ["overview", "Overview", "grid"],
      ["assets", "Asset register", "asset"],
      ["inspections", "Inspections", "inspect"],
      ...(actor === "reviewer" ? [["reviews", "Review queue", "check"]] : []),
      ["analytics", "Analysis & worklist", "grid"],
      ["geometry", "3D / point-cloud lab", "asset"],
      ["reports", "Reports", "report"],
      ["guide", "Demo guide", "clock"],
    ];
    let content;
    try {
      content =
        key === "overview"
          ? overview()
          : key === "assets"
            ? assetsPage()
            : key === "asset"
              ? assetPage(id)
              : ["inspections", "reviews", "reports"].includes(key)
                ? listPage(key)
                : key === "inspection"
                  ? workspace(id)
                  : key === "photo"
                    ? editorPage(id)
                    : key === "report"
                      ? reportPage(id)
                      : key === "analytics"
                        ? analyticsPage()
                        : key === "geometry"
                          ? geometryPage()
                          : guidePage() + jobGuide();
    } catch (error) {
      content =
        heading("RECORD UNAVAILABLE", "Open another record", error.message) +
        `<a class="btn primary" href="#/overview">Return to overview</a>`;
    }
    const current =
      key === "asset"
        ? "assets"
        : ["inspection", "photo"].includes(key)
          ? "inspections"
          : key === "report"
            ? "reports"
            : key;
    $("#app").innerHTML =
      `<aside class="sidebar" id="sidebar"><a class="brand" href="#/overview">${$("link[rel=icon]") ? `<img src="${$("link[rel=icon]").href}" width="35" height="35" alt="">` : ""}<span>Asset<span class="brand-light">Inspect</span><small>VISUAL INFRASTRUCTURE INSPECTION</small></span></a><div class="workspace-label"><span class="workspace-icon">AI</span><div>Recruiter demo<small><span class="live-dot"></span> Offline · One file</small></div></div><div class="nav-label">WORKSPACE</div><nav aria-label="Main navigation">${nav.map(([link, label, name]) => `<a href="#/${link}" class="${current === link ? "active" : ""}">${icon(name)}${label}${link === "reviews" ? `<span class="nav-count">${visible().filter((i) => reviewable(i)).length}</span>` : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="portfolio-note"><span class="live-dot"></span>INDEPENDENT PORTFOLIO<small>Visual evidence. Human judgment.<br>Browser-only role simulation.</small><button type="button" data-action="backup">Export backup</button><button type="button" data-action="restore">Restore backup</button></div><div class="user-block"><span class="avatar">${person().name[0]}</span><div><strong>${person().name}</strong><small>${person().role} · Demo account</small></div></div></div></aside>
      <div class="app-shell"><header class="topbar"><div class="breadcrumbs"><button type="button" class="mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false">☰</button><span>Portfolio</span><span class="crumb-slash">/</span><strong>${nav.find((n) => n[0] === current)?.[1] || "Workspace"}</strong></div><div class="topbar-right"><label class="sr-only" for="demo-role">Demo account</label><select id="demo-role" class="role-select" aria-label="Demo account"><option value="inspector" ${actor === "inspector" ? "selected" : ""}>Inspector · Alex Morgan</option><option value="reviewer" ${actor === "reviewer" ? "selected" : ""}>Reviewer · Jordan Lee</option></select></div></header><main id="main" class="main-content"><div class="offline-ribbon"><div><strong>Interactive offline portfolio demo</strong><span>Roles are simulated. ${db ? "Changes save in this browser only." : "Temporary session: local storage unavailable."} No installation or Internet needed.</span></div><div class="offline-toolbar">${button("share", `${icon("download")} Download shareable HTML`, "", "secondary")}<a class="btn secondary" href="#/guide">Quick guide</a></div></div>${storageMessage ? `<div class="offline-storage-warning">${esc(storageMessage)}</div>` : ""}<div id="page-content">${content}</div><footer class="app-footer"><span>AssetInspect / Visual infrastructure inspection</span><span>Independent portfolio demonstration · ${db ? "Saved locally" : "Temporary session"}</span></footer></main></div>`;
    if (key === "photo" && $("#annotation-overlay")) {
      initEditor(id);
      updateFindingFields();
    }
    if (key === "geometry" && $("#geometry-canvas")) initGeometry();
  }
  function allowAbandon() {
    return !dirty || confirm("Discard the unsaved form or annotation changes?");
  }
  function field(
    label,
    name,
    value = "",
    type = "text",
    required = true,
    max = 240,
  ) {
    return `<label for="form-${name}">${label}</label><input id="form-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${max}">`;
  }
  function area(label, name, value = "", required = true, max = 10000) {
    return `<label for="form-${name}">${label}</label><textarea id="form-${name}" name="${name}" ${required ? "required" : ""} maxlength="${max}">${esc(value)}</textarea>`;
  }
  function openDialog(title, form, markup, attributes = "") {
    if (!allowAbandon()) return;
    dirty = false;
    const d = $("#form-dialog");
    d.innerHTML = `<h2 id="dialog-title">${title}</h2><form data-form="${form}" ${attributes}>${markup}<p class="dialog-error" role="alert"></p><div class="form-actions">${button("close-dialog", "Cancel", "", "secondary")}<button class="btn primary">Save ${form === "asset" ? "asset" : form === "assessment" ? "assessment" : "inspection"}</button></div></form>`;
    d.showModal();
  }
  function assetForm(id) {
    assert(
      actor === "inspector",
      "Switch to Inspector to register/edit assets.",
    );
    const a = id ? asset(id) : null;
    if (a)
      assert(
        !state.inspections.some(
          (i) =>
            i.assetId === id && ["submitted", "approved"].includes(i.status),
        ),
        "Asset details are locked while an associated inspection is Submitted or Approved.",
      );
    openDialog(
      a ? "Edit asset" : "Register an asset",
      "asset",
      field(
        "Asset identifier",
        "identifier",
        a?.identifier || "",
        "text",
        true,
        40,
      ) +
        field("Asset name", "name", a?.name || "", "text", true, 140) +
        `<label for="asset-type">Asset type</label><select id="asset-type" name="type">${options(TYPES, a?.type)}</select>` +
        field("Location", "location", a?.location || "") +
        area("Description", "description", a?.description || "", false),
      `data-id="${id || ""}"`,
    );
  }
  function inspectionForm(id, assetId) {
    assert(
      actor === "inspector",
      "Switch to Inspector to create/edit inspections.",
    );
    const i = id ? requireEditable(id) : null;
    assert(state.assets.length, "Register an asset first.");
    openDialog(
      i ? "Edit inspection" : "Create an inspection",
      "inspection",
      field(
        "Inspection reference",
        "reference",
        i?.reference || "",
        "text",
        true,
        40,
      ) +
        `<label for="inspection-asset">Asset</label><select id="inspection-asset" name="assetId">${state.assets.map((a) => `<option value="${a.id}" ${a.id === (i?.assetId || assetId) ? "selected" : ""}>${esc(a.identifier)} · ${esc(a.name)}</option>`).join("")}</select>` +
        field("Inspection date", "date", i?.date || today(), "date") +
        area("Inspection scope", "scope", i?.scope || "") +
        area("General notes", "notes", i?.notes || "", false, 20000),
      `data-id="${id || ""}" data-version="${i?.version ?? 0}"`,
    );
  }
  function initEditor(id) {
    const p = photo(id),
      i = inspection(p.inspectionId),
      overlay = $("#annotation-overlay"),
      form = $("#annotation-form");
    editor = {
      photoId: id,
      selected: null,
      box: null,
      draw: editable(i),
      start: null,
      pointer: null,
      observer: null,
    };
    function draw() {
      if (!editor) return;
      overlay.replaceChildren();
      const w = p.width,
        h = p.height,
        ns = "http://www.w3.org/2000/svg";
      const add = (box, severity, label, selected, id) => {
        const rect = document.createElementNS(ns, "rect");
        Object.entries({
          x: box.x * w,
          y: box.y * h,
          width: box.width * w,
          height: box.height * h,
          class: `annotation-rect ${severity} ${selected ? "selected" : ""}`,
          "vector-effect": "non-scaling-stroke",
        }).forEach(([k, v]) => rect.setAttribute(k, v));
        if (id) rect.dataset.finding = id;
        overlay.append(rect);
        if (label) {
          const text = document.createElementNS(ns, "text");
          text.setAttribute(
            "x",
            Math.max(
              2,
              Math.min(
                box.x * w,
                w - (160 * w) / Math.max(overlay.clientWidth, 200),
              ),
            ),
          );
          text.setAttribute(
            "y",
            Math.max(
              (20 * h) / Math.max(overlay.clientHeight, 100),
              box.y * h - (7 * h) / Math.max(overlay.clientHeight, 100),
            ),
          );
          text.setAttribute("class", "annotation-label");
          text.style.fontSize = `${(12 * w) / Math.max(overlay.clientWidth, 200)}px`;
          text.textContent = label;
          overlay.append(text);
        }
      };
      annotations(id).forEach((f) =>
        add(
          f.id === editor.selected && editor.box ? editor.box : f,
          recordClass(f),
          `${f.reference} · ${severityText(f)}`,
          f.id === editor.selected,
          f.id,
        ),
      );
      if (editor.box && !editor.selected)
        add(editor.box, "drawing", "", false, null);
      $$("[data-action=select-finding]").forEach((b) => {
        const selected = b.dataset.id === editor.selected;
        b.classList.toggle("selected", selected);
        b.setAttribute("aria-pressed", String(selected));
      });
      const del = $("#delete-finding");
      if (del) del.hidden = !editor.selected;
    }
    editor.drawBoxes = draw;
    const position = (e) => {
      const r = overlay.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
    };
    const box = (end) => {
      const round = (n) => Math.floor(n * 1000000) / 1000000;
      return {
        x: round(Math.min(editor.start.x, end.x)),
        y: round(Math.min(editor.start.y, end.y)),
        width: round(Math.abs(end.x - editor.start.x)),
        height: round(Math.abs(end.y - editor.start.y)),
      };
    };
    overlay.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      if (e.target.dataset.finding && !editor.draw) {
        selectFinding(e.target.dataset.finding);
        return;
      }
      if (!editable(i) || !editor.draw || editor.pointer !== null) return;
      e.preventDefault();
      editor.start = position(e);
      editor.pointer = e.pointerId;
      overlay.setPointerCapture(e.pointerId);
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!editor.start || e.pointerId !== editor.pointer) return;
      editor.box = box(position(e));
      draw();
    });
    overlay.addEventListener("pointerup", (e) => {
      if (!editor.start || e.pointerId !== editor.pointer) return;
      editor.box = box(position(e));
      editor.start = null;
      overlay.releasePointerCapture(e.pointerId);
      editor.pointer = null;
      if (!rectangular(editor.box)) {
        editor.box = null;
        $("#editor-feedback").textContent =
          "Draw a rectangle with a visible area entirely inside the photograph.";
      } else {
        editor.draw = false;
        dirty = true;
        syncCoordinates();
        $("#editor-feedback").textContent =
          "Rectangle recorded. Complete the details and save the finding.";
      }
      draw();
    });
    overlay.addEventListener("pointercancel", () => {
      editor.start = null;
      editor.pointer = null;
      editor.box = null;
      draw();
    });
    $$("[data-coordinate]").forEach((input) =>
      input.addEventListener("input", () => {
        editor.box = Object.fromEntries(
          $$("[data-coordinate]").map((el) => [
            el.dataset.coordinate,
            Number(el.value),
          ]),
        );
        dirty = true;
        draw();
      }),
    );
    editor.observer = new ResizeObserver(draw);
    editor.observer.observe(overlay);
    draw();
    if (!editable(i) && annotations(id).length)
      selectFinding(annotations(id)[0].id);
  }
  function syncCoordinates() {
    if (editor?.box)
      $$("[data-coordinate]").forEach(
        (input) => (input.value = editor.box[input.dataset.coordinate]),
      );
  }
  function selectFinding(id) {
    if (!allowAbandon()) return;
    const f = state.findings.find(
      (f) => f.id === id && f.photoId === editor?.photoId,
    );
    assert(f, "Finding not found.");
    editor.selected = f.id;
    editor.box = { x: f.x, y: f.y, width: f.width, height: f.height };
    editor.draw = false;
    const form = $("#annotation-form");
    [
      "category",
      "severity",
      "observation",
      "recommendation",
      "kind",
      "discipline",
      "component",
      "tag",
    ].forEach(
      (key) =>
        (form.elements[key].value =
          f[key] ?? ({ kind: "defect", discipline: "general" }[key] || "")),
    );
    updateFindingFields();
    form.elements.findingId.value = f.id;
    $("#finding-heading").textContent = f.reference;
    syncCoordinates();
    dirty = false;
    editor.drawBoxes();
    $("#editor-feedback").textContent =
      "Saved finding selected. Edit its details or redraw the rectangle.";
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new Error("Could not decode this image. Choose a valid JPEG or PNG."),
        );
      img.src = url;
    });
  }
  async function normalizedUpload(file) {
    assert(
      file.size > 0 && file.size <= 10 * 1024 * 1024,
      `${file.name}: use a non-empty image of 10 MB or less.`,
    );
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (n, k) => bytes[k] === n,
    );
    assert(
      jpeg || png,
      `${file.name}: only actual JPEG or PNG images are supported.`,
    );
    const url = URL.createObjectURL(file);
    let bitmap;
    try {
      bitmap = globalThis.createImageBitmap
        ? await createImageBitmap(file, { imageOrientation: "from-image" })
        : await loadImage(url);
      const w = bitmap.width || bitmap.naturalWidth,
        h = bitmap.height || bitmap.naturalHeight;
      assert(
        Math.min(w, h) >= 64 && Math.max(w, h) <= 10000 && w * h <= 20000000,
        `${file.name}: use images from 64 px to 10,000 px per side, at most 20 megapixels.`,
      );
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d");
      c.fillStyle = "white";
      c.fillRect(0, 0, w, h);
      c.drawImage(bitmap, 0, 0);
      return {
        name: file.name.split(/[\\/]/).pop().slice(0, 255),
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        width: w,
        height: h,
      };
    } catch (error) {
      throw new Error(error.message || `${file.name}: invalid image.`);
    } finally {
      bitmap?.close?.();
      URL.revokeObjectURL(url);
    }
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function share() {
    if (
      dirty &&
      !confirm(
        "Only saved records will be included. Continue without unsaved changes?",
      )
    )
      return;
    const copy = document.documentElement.cloneNode(true);
    copy.querySelector("#initial-data").textContent = JSON.stringify({
      format: 1,
      workspaceId: uuid(),
      state,
    })
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    copy.querySelector("#app").innerHTML =
      '<main class="startup"><h1>AssetInspect</h1><p>Preparing your saved portfolio example…</p></main>';
    copy.querySelector("#form-dialog").innerHTML = "";
    copy.querySelector("#form-dialog").removeAttribute("open");
    copy.querySelector("#feedback").hidden = true;
    copy.querySelector("#feedback").textContent = "";
    copy.querySelector("body").classList.remove("report-active");
    download(
      "AssetInspect-portfolio.html",
      "<!DOCTYPE html>\n" + copy.outerHTML,
      "text/html;charset=utf-8",
    );
    toast(
      "Downloaded a self-contained copy with your saved records and photographs. Review its contents before sharing.",
    );
  }
  function csv(id) {
    const i = inspection(id);
    assert(i && visible().some((v) => v.id === id), "Inspection unavailable.");
    downloadCsv(`${i.reference}-findings.csv`, exportRows(findings(id)));
  }
  function validateState(raw) {
    assert(
      raw && raw.format === 1,
      "This is not an AssetInspect version 1 backup.",
    );
    const result = { format: 1 };
    const id = (v) => {
      assert(
        typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v),
        "Invalid record identifier.",
      );
      return v;
    };
    const text = (v, max = 10000) => {
      assert(
        typeof v === "string" && v.length <= max,
        "Invalid or oversized text in backup.",
      );
      return v;
    };
    const unique = (rows, key = "id") =>
      assert(
        new Set(rows.map((r) => r[key])).size === rows.length,
        "Duplicate record references in backup.",
      );
    for (const [key, max] of [
      ["assets", 100],
      ["inspections", 200],
      ["photos", 100],
      ["findings", 1000],
      ["events", 5000],
    ])
      assert(
        Array.isArray(raw[key]) && raw[key].length <= max,
        `Invalid ${key} collection in backup.`,
      );
    result.assets = raw.assets.map((a) => {
      assert(Object.hasOwn(TYPES, a.type), "Invalid asset type.");
      return {
        id: id(a.id),
        identifier: text(a.identifier, 40),
        name: text(a.name, 140),
        type: a.type,
        location: text(a.location, 240),
        description: text(a.description),
        createdAt: text(a.createdAt, 40),
      };
    });
    unique(result.assets);
    unique(result.assets, "identifier");
    result.inspections = raw.inspections.map((i) => {
      assert(
        Object.hasOwn(STATUS, i.status) &&
          i.inspector === "demo-inspector" &&
          /^\d{4}-\d{2}-\d{2}$/.test(i.date),
        "Invalid inspection metadata.",
      );
      assert(
        result.assets.some((a) => a.id === i.assetId),
        "Inspection asset is missing.",
      );
      return {
        id: id(i.id),
        reference: text(i.reference, 40),
        assetId: id(i.assetId),
        date: i.date,
        inspector: i.inspector,
        scope: text(i.scope),
        notes: text(i.notes, 20000),
        status: i.status,
        noDefects: !!i.noDefects,
        version:
          Number.isSafeInteger(i.version) && i.version >= 0 ? i.version : 0,
        nextFinding:
          Number.isSafeInteger(i.nextFinding) && i.nextFinding > 0
            ? i.nextFinding
            : 1,
        createdAt: text(i.createdAt, 40),
        updatedAt: text(i.updatedAt, 40),
      };
    });
    unique(result.inspections);
    unique(result.inspections, "reference");
    result.photos = raw.photos.map((p) => {
      assert(
        result.inspections.some((i) => i.id === p.inspectionId),
        "Photograph inspection is missing.",
      );
      assert(
        typeof p.dataUrl === "string" &&
          p.dataUrl.length <= 16000000 &&
          /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.dataUrl),
        "Backup photographs must be embedded JPEG/PNG images.",
      );
      assert(
        Number.isInteger(p.width) &&
          Number.isInteger(p.height) &&
          Math.min(p.width, p.height) >= 64 &&
          Math.max(p.width, p.height) <= 10000 &&
          p.width * p.height <= 20000000,
        "Invalid image dimensions.",
      );
      return {
        id: id(p.id),
        inspectionId: id(p.inspectionId),
        name: text(p.name, 255),
        caption: text(p.caption, 300),
        dataUrl: p.dataUrl,
        width: p.width,
        height: p.height,
        at: text(p.at, 40),
      };
    });
    unique(result.photos);
    result.findings = raw.findings.map((f) => {
      const p = result.photos.find((p) => p.id === f.photoId);
      assert(
        p &&
          p.inspectionId === f.inspectionId &&
          Object.hasOwn(CATEGORIES, f.category) &&
          (f.kind === "feature"
            ? f.severity === null && f.category === "other"
            : Object.hasOwn(SEVERITIES, f.severity)) &&
          rectangular(f),
        "Invalid finding or rectangle.",
      );
      return {
        id: id(f.id),
        inspectionId: id(f.inspectionId),
        photoId: id(f.photoId),
        reference: text(f.reference, 20),
        category: f.category,
        severity: f.severity,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        observation: text(f.observation),
        recommendation: text(f.recommendation),
        creator: text(f.creator, 140),
        createdAt: text(f.createdAt, 40),
        updatedAt: text(f.updatedAt, 40),
      };
    });
    unique(result.findings);
    unique(
      result.findings.map((f) => ({ id: f.inspectionId + ":" + f.reference })),
    );
    result.events = raw.events.map((e) => {
      assert(
        result.inspections.some((i) => i.id === e.inspectionId) &&
          (!e.status || Object.hasOwn(STATUS, e.status)),
        "Invalid audit event.",
      );
      return {
        id: id(e.id),
        inspectionId: id(e.inspectionId),
        actor: text(e.actor, 140),
        action: text(e.action, 80),
        comment: text(e.comment, 20000),
        previous: text(e.previous, 16),
        status: e.status,
        at: text(e.at, 40),
      };
    });
    unique(result.events);
    for (const i of result.inspections) {
      const nums = result.findings
        .filter((f) => f.inspectionId === i.id)
        .map((f) => Number(f.reference.replace(/^F-/, "")))
        .filter(Number.isFinite);
      i.nextFinding = Math.max(i.nextFinding, ...nums.map((n) => n + 1));
    }
    return enrichJobState(result, raw);
  }
  async function handleSubmit(form) {
    const kind = form.dataset.form,
      data = new FormData(form),
      value = (name) => String(data.get(name) || "").trim();
    if (await jobForm(form, data, value)) return;
    if (kind === "filter") {
      const route = location.hash.split("?")[0];
      location.hash =
        route +
        "?" +
        new URLSearchParams({ q: value("q"), status: value("status") });
      return;
    }
    if (kind === "asset") {
      const id = form.dataset.id || uuid();
      await mutate(
        () => {
          assert(actor === "inspector", "Switch to Inspector first.");
          assert(
            !state.assets.some(
              (a) => a.identifier === value("identifier") && a.id !== id,
            ),
            "Asset identifier is already in use.",
          );
          let a = asset(id);
          if (a)
            assert(
              !state.inspections.some(
                (i) =>
                  i.assetId === id &&
                  ["submitted", "approved"].includes(i.status),
              ),
              "Asset metadata is locked by a submitted/approved inspection.",
            );
          const record = {
            id,
            identifier: value("identifier"),
            name: value("name"),
            type: value("type"),
            location: value("location"),
            description: value("description"),
            createdAt: a?.createdAt || now(),
          };
          assert(
            record.identifier &&
              record.name &&
              record.location &&
              Object.hasOwn(TYPES, record.type),
            "Complete all required asset fields.",
          );
          if (a) {
            Object.assign(a, record);
            state.inspections
              .filter((i) => i.assetId === id)
              .forEach((i) => {
                event(i, "Asset details updated");
                touch(i);
              });
          } else state.assets.push(record);
        },
        "Asset saved.",
        `#/asset/${id}`,
      );
    } else if (kind === "inspection") {
      const id = form.dataset.id || uuid();
      await mutate(
        () => {
          assert(actor === "inspector", "Switch to Inspector first.");
          assert(
            !state.inspections.some(
              (i) => i.reference === value("reference") && i.id !== id,
            ),
            "Inspection reference is already in use.",
          );
          let i = form.dataset.id
            ? requireEditable(id, form.dataset.version)
            : null;
          const record = {
            reference: value("reference"),
            assetId: value("assetId"),
            date: value("date"),
            scope: value("scope"),
            notes: value("notes"),
          };
          assert(
            record.reference &&
              record.scope &&
              record.date &&
              asset(record.assetId),
            "Complete all required inspection fields.",
          );
          if (i) {
            Object.assign(i, record);
            touch(i);
            event(i, "Inspection details updated");
          } else {
            i = {
              ...record,
              id,
              inspector: person().id,
              status: "draft",
              noDefects: false,
              version: 0,
              nextFinding: 1,
              createdAt: now(),
              updatedAt: now(),
            };
            state.inspections.push(i);
            event(i, "Inspection created", "", "", "draft");
          }
        },
        "Inspection saved.",
        `#/inspection/${id}`,
      );
    } else if (kind === "upload") {
      const files = [...form.elements.images.files];
      assert(
        files.length && files.length <= 8,
        "Choose between 1 and 8 JPEG/PNG images.",
      );
      toast("Validating and preparing photographs…");
      const processed = [];
      for (const file of files) processed.push(await normalizedUpload(file));
      await mutate(() => {
        const i = requireEditable(form.dataset.id, form.dataset.version);
        for (const p of processed)
          state.photos.push({
            ...p,
            id: uuid(),
            inspectionId: i.id,
            caption: value("caption"),
            evidenceType: Object.hasOwn(EVIDENCE_TYPES, value("evidenceType"))
              ? value("evidenceType")
              : "photo",
            at: now(),
          });
        touch(i);
        event(
          i,
          "Photographs uploaded",
          `${processed.length} photograph(s) added.`,
        );
      }, `${processed.length} photograph(s) uploaded.`);
    } else if (kind === "finding") {
      const p = photo(form.dataset.photo),
        selected = editor.selected,
        box = { ...editor.box };
      assert(
        rectangular(box),
        "Draw a non-zero rectangle entirely inside the photograph before saving.",
      );
      const details = readFindingFields(value);
      await mutate(() => {
        const i = requireEditable(p.inspectionId, form.dataset.version);
        let f = selected
          ? state.findings.find((f) => f.id === selected && f.photoId === p.id)
          : null;
        assert(!selected || f, "The selected finding is no longer available.");
        const record = {
          ...box,
          ...details,
          updatedAt: now(),
        };
        if (f) {
          Object.assign(f, record);
          event(
            i,
            "Finding updated",
            `${f.reference}: ${recordTitle(f)} · ${severityText(f)}`,
          );
        } else {
          f = {
            ...record,
            id: uuid(),
            inspectionId: i.id,
            photoId: p.id,
            reference: `F-${String(i.nextFinding++).padStart(3, "0")}`,
            creator: person().name,
            createdAt: now(),
          };
          state.findings.push(f);
          event(
            i,
            "Finding created",
            `${f.reference}: ${recordTitle(f)} · ${severityText(f)}`,
          );
        }
        if (!isFeature(f)) i.noDefects = false;
        touch(i);
      }, "Finding saved.");
    } else if (kind === "submit") {
      await mutate(() => {
        const i = requireEditable(form.dataset.id, form.dataset.version);
        assert(
          photos(i.id).length,
          "Add at least one photograph before submitting.",
        );
        assert(
          defects(i.id).length || data.has("noDefects"),
          "Confirm that no visible defects were observed in the supplied photographs, or record a finding.",
        );
        assert(
          qaComplete(i, "inspector"),
          "Complete and save the inspector QA checklist before submitting.",
        );
        const previous = i.status;
        i.noDefects = !defects(i.id).length && data.has("noDefects");
        i.status = "submitted";
        i.qa.reviewer = {};
        i.qa.reviewerAt = "";
        touch(i, false);
        event(i, "Submitted for review", "", previous, "submitted");
      }, "Submitted. Switch to Reviewer to continue the demonstration.");
    } else if (kind === "review") {
      await mutate(() => {
        const i = inspection(form.dataset.id);
        assert(
          i && reviewable(i),
          "Only the other demo role can decide a submitted inspection.",
        );
        assert(
          i.version === Number(form.dataset.version),
          "This inspection changed. Reload before reviewing.",
        );
        assert(
          ["approve", "changes"].includes(value("decision")),
          "Choose a valid decision.",
        );
        assert(
          value("decision") !== "changes" || value("comment"),
          "Explain the changes the inspector needs to make.",
        );
        assert(
          value("decision") !== "approve" || qaComplete(i, "reviewer"),
          "Complete and save the reviewer QA checklist before approval.",
        );
        i.status = value("decision") === "approve" ? "approved" : "changes";
        if (i.status === "changes") {
          i.qa.inspector = {};
          i.qa.inspectorAt = "";
        }
        touch(i, false);
        event(
          i,
          i.status === "approved" ? "Approved" : "Changes requested",
          value("comment"),
          "submitted",
          i.status,
        );
      }, "Review decision recorded.");
    }
  }
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.matches("form[data-form]"))
      handleSubmit(e.target).catch((error) => {
        toast(error.message, true);
        const box = $(".dialog-error", e.target);
        if (box) box.textContent = error.message;
      });
  });
  document.addEventListener("input", (e) => {
    if (e.target.closest("form[data-form]:not([data-form=filter])"))
      dirty = true;
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "record-kind") {
      updateFindingFields();
      return;
    }
    if (e.target.id !== "demo-role") return;
    if (!allowAbandon()) {
      e.target.value = actor;
      return;
    }
    actor = e.target.value;
    dirty = false;
    try {
      localStorage.setItem(databaseName + "-role", actor);
    } catch (_) {}
    if (location.hash === "#/overview") render();
    else location.hash = "#/overview";
    toast(
      `Switched to ${person().role}. Role checks are simulated in this offline demo.`,
    );
  });
  document.addEventListener("click", async (e) => {
    const link = e.target.closest('a[href^="#/"]');
    if (link && dirty) {
      if (!allowAbandon()) {
        e.preventDefault();
        return;
      }
      dirty = false;
    }
    const b = e.target.closest("[data-action]");
    if (!b) return;
    try {
      const action = b.dataset.action,
        id = b.dataset.id;
      if (await jobAction(action, b)) return;
      if (action === "menu") {
        $("#sidebar").classList.toggle("open");
        b.setAttribute(
          "aria-expanded",
          String($("#sidebar").classList.contains("open")),
        );
      } else if (action === "new-asset" || action === "edit-asset")
        assetForm(id);
      else if (action === "new-inspection" || action === "edit-inspection")
        inspectionForm(id, b.dataset.asset);
      else if (action === "close-dialog") {
        if (allowAbandon()) {
          dirty = false;
          $("#form-dialog").close();
        }
      } else if (action === "share") share();
      else if (action === "backup")
        download(
          "AssetInspect-backup.json",
          JSON.stringify({ format: 1, state }, null, 2),
          "application/json",
        );
      else if (action === "restore") $("#restore-input").click();
      else if (action === "reset") {
        if (
          confirm(
            "Delete this browser demo's saved assets, inspections, photos, and findings and restore the synthetic examples? Export a backup first if needed.",
          )
        )
          await mutate(
            () => {
              state = seed();
              actor = "inspector";
            },
            "Synthetic demo restored.",
            "#/overview",
          );
      } else if (action === "csv") csv(id);
      else if (action === "print") {
        await Promise.all(
          $$(".report-paper img").map((img) => img.decode().catch(() => {})),
        );
        window.print();
      } else if (action === "synthetic")
        await mutate(() => {
          const i = requireEditable(id);
          const a = asset(i.assetId);
          state.photos.push({
            id: uuid(),
            inspectionId: id,
            name: "synthetic-demo.jpg",
            evidenceType: "schematic",
            caption: "SYNTHETIC DEMO · Locally generated schematic",
            dataUrl: syntheticImage(a.type),
            width: 1400,
            height: 900,
            at: now(),
          });
          touch(i);
          event(
            i,
            "Synthetic photograph added",
            "Locally generated demonstration evidence.",
          );
        }, "Synthetic photograph added. Open it to draw a finding.");
      else if (action === "delete-photo") {
        const p = photo(id);
        if (
          confirm(
            "Delete this photograph and all of its findings? This action is recorded in the local history.",
          )
        )
          await mutate(() => {
            const i = requireEditable(p.inspectionId);
            event(i, "Photograph deleted", p.name);
            state.findings = state.findings.filter((f) => f.photoId !== id);
            state.photos = state.photos.filter((p) => p.id !== id);
            touch(i);
          }, "Photograph deleted.");
      } else if (action === "select-finding") selectFinding(id);
      else if (action === "new-finding") {
        if (!allowAbandon()) return;
        editor.selected = null;
        editor.box = null;
        editor.draw = true;
        $("#annotation-form").reset();
        updateFindingFields();
        $$("[data-coordinate]").forEach((el) => (el.value = ""));
        $("#finding-heading").textContent = "New finding";
        $("#editor-feedback").textContent =
          "Draw a new rectangle, or enter normalized coordinates below.";
        dirty = false;
        editor.drawBoxes();
      } else if (action === "redraw") {
        editor.draw = true;
        $("#editor-feedback").textContent =
          "Drag a replacement rectangle. The finding details will be kept.";
      } else if (action === "delete-finding") {
        const selected = editor.selected,
          f = state.findings.find((f) => f.id === selected);
        if (
          f &&
          confirm(
            `Delete ${f.reference}? The deletion is recorded in local history.`,
          )
        )
          await mutate(() => {
            const i = requireEditable(f.inspectionId);
            event(i, "Finding deleted", `${f.reference}: ${f.observation}`);
            state.findings = state.findings.filter((a) => a.id !== selected);
            touch(i);
          }, "Finding deleted.");
      }
    } catch (error) {
      toast(error.message || "Action could not be completed.", true);
    }
  });
  $("#restore-input").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      assert(
        file.size <= 30 * 1024 * 1024,
        "Choose a backup smaller than 30 MB.",
      );
      const raw = JSON.parse(await file.text());
      assert(raw.format === 1, "Unsupported backup format.");
      const restored = validateState(raw.state);
      for (const p of restored.photos) {
        const image = await loadImage(p.dataUrl);
        assert(
          image.naturalWidth === p.width && image.naturalHeight === p.height,
          "A backup photograph's dimensions do not match its contents.",
        );
      }
      if (
        confirm(
          "Replace this browser demo's saved records with this backup? Export your current work first if needed.",
        )
      )
        await mutate(
          () => {
            state = restored;
          },
          "Backup restored.",
          "#/overview",
        );
    } catch (error) {
      toast(error.message || "Invalid backup file.", true);
    } finally {
      e.target.value = "";
    }
  });
  $("#form-dialog").addEventListener("cancel", (e) => {
    if (!allowAbandon()) e.preventDefault();
    else dirty = false;
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("hashchange", () => {
    dirty = false;
    render();
    window.scrollTo(0, 0);
  });
  async function start() {
    let initial = embedded?.state ? validateState(embedded.state) : seed();
    try {
      db = await openStorage();
      const saved = await readStorage();
      state = saved ? validateState(saved) : initial;
      if (!saved) await writeStorage(state);
    } catch (error) {
      db?.close();
      db = null;
      state = initial;
      storageMessage =
        "Browser storage is unavailable. This is a temporary session. Download shareable HTML or export a backup before closing the file.";
    }
    try {
      const savedRole = localStorage.getItem(databaseName + "-role");
      if (Object.hasOwn(USERS, savedRole)) actor = savedRole;
    } catch (_) {}
    if (globalThis.BroadcastChannel && db) {
      channel = new BroadcastChannel(databaseName);
      channel.onmessage = async () => {
        if (dirty) {
          toast(
            "Saved data changed in another tab. Finish or discard this form, then reload.",
            true,
          );
          return;
        }
        const latest = await readStorage();
        if (latest) {
          state = validateState(latest);
          render();
        }
      };
    }
    render();
  }
  /* @@JOB_TOOLS@@ */
  /* @@GEOMETRY@@ */
  start().catch((error) => {
    $("#app").innerHTML =
      `<main class="startup"><h1>Could not open the demo</h1><p>${esc(error.message)}</p><p>Try the original file in a current desktop Chrome or Edge browser.</p></main>`;
  });
})();
