const state = {
  yearData: null,
  latestData: null,
  selectedMonth: null,
  repo: {
    owner: "",
    name: "",
    branch: "main"
  }
};

const siteConfig = {
  // For a custom domain, set these once in code. On *.github.io pages they are inferred automatically.
  repoOwner: "",
  repoName: "",
  branch: "main"
};

const monthNames = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Awwal",
  "Jumada al-Thani",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qadah",
  "Dhu al-Hijjah"
];

const els = {
  activeMonth: document.querySelector("#activeMonth"),
  monthStart: document.querySelector("#monthStart"),
  activeStatus: document.querySelector("#activeStatus"),
  computedToday: document.querySelector("#computedToday"),
  latestEndpoint: document.querySelector("#latestEndpoint"),
  monthRows: document.querySelector("#monthRows"),
  yearTitle: document.querySelector("#yearTitle"),
  yearJsonLink: document.querySelector("#yearJsonLink"),
  adminToggle: document.querySelector("#adminToggle"),
  adminPanel: document.querySelector("#adminPanel"),
  adminClose: document.querySelector("#adminClose"),
  adminForm: document.querySelector("#adminForm"),
  adminLog: document.querySelector("#adminLog"),
  repoTarget: document.querySelector("#repoTarget"),
  monthSelect: document.querySelector("#monthSelect"),
  downloadJson: document.querySelector("#downloadJson"),
  addSource: document.querySelector("#addSource"),
  sourcesList: document.querySelector("#sourcesList")
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  return Math.floor((end - start) / 86400000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusPill(status) {
  const safe = escapeHtml(status || "pending");
  return `<span class="pill ${safe}">${safe}</span>`;
}

function sourceSummary(sources) {
  if (!sources || sources.length === 0) return "No source yet";
  return sources
    .map((source) => {
      const name = escapeHtml(source.source_name || source.title || "Source");
      if (source.url) return `<a href="${escapeHtml(source.url)}" rel="noopener noreferrer" target="_blank">${name}</a>`;
      return name;
    })
    .join(", ");
}

function renderLatest() {
  const latest = state.latestData;
  if (!latest) return;
  els.activeMonth.textContent = `${latest.month_name} ${latest.hijri_year}`;
  els.monthStart.textContent = latest.month_start || "Not verified yet";
  els.activeStatus.innerHTML = statusPill(latest.status);

  if (!latest.month_start) {
    els.computedToday.textContent = "Unavailable";
    return;
  }

  const day = daysBetween(latest.month_start, todayIso()) + 1;
  if (day >= 1 && day <= 30) {
    els.computedToday.textContent = `${day} ${latest.month_name} ${latest.hijri_year}`;
  } else if (day > 30) {
    els.computedToday.textContent = "Data is stale";
  } else {
    els.computedToday.textContent = "Starts in future";
  }
}

function renderEndpoint() {
  els.latestEndpoint.textContent = new URL("data/latest.json", window.location.href).href;
}

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("v", Date.now().toString());
  const response = await fetch(url.href, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

function renderMonths() {
  const months = state.yearData?.months || [];
  els.yearTitle.textContent = `Year ${state.yearData?.hijri_year || ""}`;
  els.yearJsonLink.href = state.latestData?.source || `data/${state.yearData?.hijri_year || 1448}.json`;
  els.monthRows.innerHTML = months
    .map((month) => `
      <tr>
        <td><strong>${month.month}. ${escapeHtml(month.month_name)}</strong></td>
        <td>${escapeHtml(month.gregorian_start_date || "Pending")}</td>
        <td>${statusPill(month.status)}</td>
        <td>${escapeHtml(month.confidence || "unknown")}</td>
        <td>${sourceSummary(month.sources)}</td>
      </tr>
    `)
    .join("");
}

function fillMonthSelect() {
  els.monthSelect.innerHTML = monthNames
    .map((name, index) => `<option value="${index + 1}">${index + 1}. ${escapeHtml(name)}</option>`)
    .join("");
}

function findMonth(monthNumber) {
  return state.yearData.months.find((month) => month.month === Number(monthNumber));
}

function sourceTemplate(source = {}) {
  const row = document.createElement("div");
  row.className = "source-card";
  row.innerHTML = `
    <div class="source-card-head">
      <strong>Source</strong>
      <button class="text-button remove-source" type="button">Remove</button>
    </div>
    <div class="form-grid">
      <label>
        Source name
        <input class="source-name" autocomplete="off" placeholder="Central Ruet-e-Hilal Committee" value="${escapeHtml(source.source_name || "")}">
      </label>
      <label>
        Published date
        <input class="source-published" type="date" value="${escapeHtml(source.published_at || "")}">
      </label>
      <label class="span-2">
        Source link
        <input class="source-url" type="url" autocomplete="off" placeholder="https://..." value="${escapeHtml(source.url || "")}">
      </label>
      <label class="span-2">
        Description
        <textarea class="source-description" rows="3" placeholder="What this source confirms">${escapeHtml(source.description || source.title || "")}</textarea>
      </label>
    </div>
  `;

  row.querySelector(".remove-source").addEventListener("click", () => {
    row.remove();
    if (!els.sourcesList.children.length) addSourceRow();
  });

  return row;
}

function addSourceRow(source = {}) {
  els.sourcesList.append(sourceTemplate(source));
}

function loadSourcesIntoForm(sources = []) {
  els.sourcesList.innerHTML = "";
  if (!sources.length) {
    addSourceRow();
    return;
  }
  sources.forEach((source) => addSourceRow(source));
}

function loadMonthIntoForm(monthNumber) {
  const month = findMonth(monthNumber);
  if (!month) return;
  state.selectedMonth = month;
  document.querySelector("#hijriYear").value = state.yearData.hijri_year;
  document.querySelector("#monthStartInput").value = month.gregorian_start_date || "";
  document.querySelector("#statusInput").value = month.status || "pending";
  document.querySelector("#confidenceInput").value = month.confidence || "unknown";
  document.querySelector("#notesInput").value = month.notes || "";
  loadSourcesIntoForm(month.sources || []);
}

function readSources() {
  const rawSources = [...els.sourcesList.querySelectorAll(".source-card")]
    .map((row) => ({
      source_name: row.querySelector(".source-name").value.trim(),
      description: row.querySelector(".source-description").value.trim(),
      url: row.querySelector(".source-url").value.trim(),
      published_at: row.querySelector(".source-published").value
    }))
    .filter((source) => source.source_name || source.description || source.url || source.published_at);

  const unnamedSource = rawSources.find((source) => !source.source_name);
  if (unnamedSource) {
    throw new Error("Every source needs a source name. Link and description can stay optional.");
  }

  return rawSources.map((source) => {
      const cleaned = {};
      if (source.source_name) cleaned.source_name = source.source_name;
      if (source.description) cleaned.description = source.description;
      if (source.url) cleaned.url = source.url;
      if (source.published_at) cleaned.published_at = source.published_at;
      return cleaned;
    });
}

function readFormData() {
  const monthNumber = Number(document.querySelector("#monthSelect").value);

  return {
    owner: state.repo.owner,
    repo: state.repo.name,
    branch: document.querySelector("#repoBranch").value.trim() || "main",
    token: document.querySelector("#githubToken").value.trim(),
    updateLatest: document.querySelector("#updateLatest").checked,
    month: {
      month: monthNumber,
      month_name: monthNames[monthNumber - 1],
      gregorian_start_date: document.querySelector("#monthStartInput").value,
      status: document.querySelector("#statusInput").value,
      confidence: document.querySelector("#confidenceInput").value,
      sources: readSources(),
      notes: document.querySelector("#notesInput").value.trim()
    }
  };
}

function buildUpdatedYearData(formData) {
  const copy = structuredClone(state.yearData);
  copy.hijri_year = Number(document.querySelector("#hijriYear").value);
  copy.months = copy.months.map((month) =>
    month.month === formData.month.month ? { ...month, ...formData.month } : month
  );
  return copy;
}

function buildLatestData(yearData, month) {
  return {
    country: yearData.country,
    country_name: yearData.country_name,
    hijri_year: yearData.hijri_year,
    month: month.month,
    month_name: month.month_name,
    month_start: month.gregorian_start_date,
    status: month.status,
    confidence: month.confidence,
    updated_at: todayIso(),
    source: `data/${yearData.hijri_year}.json`,
    notes: month.notes || ""
  };
}

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setLog(message) {
  els.adminLog.textContent = message;
}

function contentToBase64(content) {
  return btoa(unescape(encodeURIComponent(content)));
}

async function commitFile({ owner, repo, branch, token, path, content, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const current = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  let sha;
  if (current.ok) {
    const existing = await current.json();
    sha = existing.sha;
  } else if (current.status !== 404) {
    throw new Error(`Could not read ${path}: ${current.status}`);
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: contentToBase64(content),
      branch,
      sha
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not commit ${path}: ${response.status} ${text}`);
  }
}

async function handleAdminSubmit(event) {
  event.preventDefault();
  let formData;
  try {
    formData = readFormData();
  } catch (error) {
    setLog(error.message);
    return;
  }
  if (!formData.owner || !formData.repo || !formData.token) {
    setLog("Add GitHub owner, repo, and token before committing.");
    return;
  }

  const updatedYear = buildUpdatedYearData(formData);
  const updatedMonth = updatedYear.months.find((month) => month.month === formData.month.month);
  const yearPath = `data/${updatedYear.hijri_year}.json`;
  const message = `Update ${updatedMonth.month_name} ${updatedYear.hijri_year}`;

  try {
    setLog("Committing year file...");
    await commitFile({
      owner: formData.owner,
      repo: formData.repo,
      branch: formData.branch,
      token: formData.token,
      path: yearPath,
      content: JSON.stringify(updatedYear, null, 2) + "\n",
      message
    });

    if (formData.updateLatest) {
      setLog("Committing year file...\nCommitting latest.json...");
      const latest = buildLatestData(updatedYear, updatedMonth);
      await commitFile({
        owner: formData.owner,
        repo: formData.repo,
        branch: formData.branch,
        token: formData.token,
        path: "data/latest.json",
        content: JSON.stringify(latest, null, 2) + "\n",
        message: `Update latest month to ${updatedMonth.month_name} ${updatedYear.hijri_year}`
      });
    }

    state.yearData = updatedYear;
    state.latestData = formData.updateLatest ? buildLatestData(updatedYear, updatedMonth) : state.latestData;
    renderMonths();
    renderLatest();
    setLog("Saved. GitHub Pages may take a minute to refresh.");
  } catch (error) {
    setLog(error.message);
  }
}

function inferRepoFields() {
  const host = window.location.hostname;
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  state.repo.branch = siteConfig.branch || "main";

  if (host.endsWith("github.io")) {
    state.repo.owner = host.replace(".github.io", "");
    state.repo.name = pathParts[0] || `${state.repo.owner}.github.io`;
  } else {
    state.repo.owner = siteConfig.repoOwner;
    state.repo.name = siteConfig.repoName;
  }

  document.querySelector("#repoBranch").value = state.repo.branch;
  els.repoTarget.textContent = state.repo.owner && state.repo.name
    ? `${state.repo.owner}/${state.repo.name}`
    : "Not configured for this domain";
}

async function init() {
  fillMonthSelect();
  inferRepoFields();
  renderEndpoint();

  state.latestData = await fetchJson("data/latest.json");
  state.yearData = await fetchJson(state.latestData.source || "data/1448.json");

  renderMonths();
  renderLatest();
  loadMonthIntoForm(1);
}

els.adminToggle.addEventListener("click", () => {
  els.adminPanel.classList.add("open");
  els.adminPanel.setAttribute("aria-hidden", "false");
});

els.adminClose.addEventListener("click", () => {
  els.adminPanel.classList.remove("open");
  els.adminPanel.setAttribute("aria-hidden", "true");
});

els.monthSelect.addEventListener("change", (event) => loadMonthIntoForm(event.target.value));
els.adminForm.addEventListener("submit", handleAdminSubmit);
els.addSource.addEventListener("click", () => addSourceRow());
els.downloadJson.addEventListener("click", () => {
  try {
    const formData = readFormData();
    download(`${state.yearData.hijri_year}.json`, buildUpdatedYearData(formData));
  } catch (error) {
    setLog(error.message);
  }
});

init().catch((error) => {
  els.monthRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  setLog(error.message);
});
