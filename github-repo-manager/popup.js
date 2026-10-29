const API = "https://api.github.com";
const $ = (id) => document.getElementById(id);

const state = {
  token: "",
  user: null,
  repos: [],
  selected: new Set(),
  loading: false,
};

function showNotice(message, kind = "info") {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = `notice ${kind}`;
}

function clearNotice() {
  $("notice").className = "notice hidden";
  $("notice").textContent = "";
}

function setLoading(isLoading) {
  state.loading = isLoading;
  $("loading").classList.toggle("hidden", !isLoading);
  $("refreshButton").disabled = isLoading;
  $("loginButton").disabled = isLoading;
  $("createButton").disabled = isLoading;
}

function apiErrorMessage(status, body, path, method = "GET", acceptedPermissions = "") {
  const message = body?.message || "Unbekannter Fehler";
  if (status === 401) return "GitHub-Anmeldung abgelaufen oder widerrufen. Bitte erneut mit GitHub anmelden.";
  if (status === 403 && /rate limit/i.test(message)) return "GitHub API-Limit erreicht. Bitte später erneut versuchen.";
  if (status === 403) {
    const targetMatch = path.match(/^\/repos\/([^/]+)\/([^/?]+)/);
    const target = targetMatch ? `${decodeURIComponent(targetMatch[1])}/${decodeURIComponent(targetMatch[2])}` : "dieses Repo";
    const context = method === "DELETE"
      ? `Die OAuth-App muss mit dem Recht delete_repo autorisiert sein, um ${target} zu löschen.`
      : method === "POST" && path.startsWith("/user/repos")
        ? "Zum Erstellen eines Repositories muss die OAuth-App mit dem Recht repo autorisiert sein."
      : path.startsWith("/user/repos")
        ? "Zum Auflisten privater Repos muss die OAuth-App mit dem Recht repo autorisiert sein."
        : "Prüfe die Token-Rechte und den Repository-Zugriff.";
    const accepted = acceptedPermissions ? ` GitHub nennt als erforderliche Berechtigung: ${acceptedPermissions}.` : "";
    return `GitHub verweigert die Aktion. ${context}${accepted} GitHub meldet: ${message}`;
  }
  if (status === 404) return "Repository oder GitHub-Endpunkt wurde nicht gefunden.";
  if (status === 422) return `GitHub hat die Angaben abgelehnt: ${message}`;
  return `GitHub-Fehler (${status}): ${message}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const acceptedPermissions = response.headers.get("X-Accepted-GitHub-Permissions") || "";
    throw new Error(apiErrorMessage(response.status, body, path, options.method || "GET", acceptedPermissions));
  }
  return body;
}

async function loadRepos() {
  setLoading(true);
  clearNotice();
  try {
    const repos = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await api(`/user/repos?visibility=all&affiliation=owner&sort=updated&per_page=100&page=${page}`);
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    state.repos = repos.filter((repo) => repo.owner?.login?.toLowerCase() === state.user?.login?.toLowerCase());
    state.selected = new Set([...state.selected].filter((fullName) => state.repos.some((repo) => repo.full_name === fullName)));
    renderRepos();
    if (repos.length >= 1000) showNotice("Es werden maximal 1.000 eigene Repositories geladen.", "info");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function renderRepos() {
  const query = $("searchInput").value.trim().toLowerCase();
  const visible = state.repos.filter((repo) => {
    const haystack = `${repo.name} ${repo.full_name} ${repo.description || ""}`.toLowerCase();
    return haystack.includes(query);
  });
  $("repoCount").textContent = String(state.repos.length);
  $("selectionCount").textContent = `${state.selected.size} ausgewählt`;
  $("deleteSelectedButton").disabled = state.selected.size === 0 || state.loading;
  $("emptyState").classList.toggle("hidden", visible.length !== 0);

  const list = $("repoList");
  list.replaceChildren();
  for (const repo of visible) {
    const row = document.createElement("div");
    row.className = "repo-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(repo.full_name);
    checkbox.setAttribute("aria-label", `${repo.full_name} auswählen`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(repo.full_name);
      else state.selected.delete(repo.full_name);
      renderRepos();
    });

    const details = document.createElement("div");
    details.className = "repo-main";
    const name = document.createElement("div");
    name.className = "repo-name";
    name.textContent = repo.name;
    const description = document.createElement("div");
    description.className = "repo-description";
    description.textContent = repo.description || "Keine Beschreibung";
    const meta = document.createElement("div");
    meta.className = "repo-meta";
    const visibility = document.createElement("span");
    visibility.className = "badge";
    visibility.textContent = repo.private ? "Privat" : "Öffentlich";
    meta.append(visibility);
    if (repo.language) {
      const language = document.createElement("span");
      language.textContent = repo.language;
      meta.append(language);
    }
    details.append(name, description, meta);
    const link = document.createElement("a");
    link.className = "repo-link";
    link.href = repo.html_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Öffnen ↗";
    row.append(checkbox, details, link);
    list.append(row);
  }
  $("repoList").classList.toggle("hidden", visible.length === 0);
}

async function connectWithOAuthToken(token) {
  state.token = token || "";
  if (!state.token) {
    showNotice("Bitte melde dich über GitHub an.", "error");
    return;
  }
  setLoading(true);
  clearNotice();
  try {
    const user = await api("/user");
    state.user = user;
    $("accountName").textContent = `@${user.login}`;
    $("accountBar").classList.remove("hidden");
    $("connectedPermissionsHelp").classList.remove("hidden");
    $("connectionPanel").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    await loadRepos();
  } catch (error) {
    state.token = "";
    showNotice(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function createRepo(event) {
  event.preventDefault();
  if (state.loading) return;
  const name = $("repoName").value.trim();
  if (!name) return;
  setLoading(true);
  clearNotice();
  try {
    const repo = await api("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: $("repoDescription").value.trim() || undefined,
        private: $("repoPrivate").checked,
        auto_init: $("repoReadme").checked,
      }),
    });
    $("createForm").reset();
    $("repoPrivate").checked = true;
    $("repoReadme").checked = true;
    $("createForm").classList.add("hidden");
    $("toggleCreateButton").setAttribute("aria-expanded", "false");
    $("toggleCreateButton").textContent = "＋ Erstellen";
    await loadRepos();
    showNotice(`${repo.full_name} wurde erstellt.`, "success");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function openDeleteConfirmation() {
  const selected = state.repos.filter((repo) => state.selected.has(repo.full_name));
  if (!selected.length) return;
  const names = selected.map((repo) => repo.full_name);
  $("deleteSummary").textContent = names.length <= 5 ? names.join(", ") : `${names.slice(0, 5).join(", ")} und ${names.length - 5} weitere`;
  $("deletePhrase").value = "";
  $("confirmDeleteButton").disabled = true;
  $("deleteConfirm").classList.remove("hidden");
  $("deletePhrase").focus();
}

async function deleteSelected() {
  if (state.loading || $("deletePhrase").value.trim() !== "LOESCHEN") return;
  const selected = state.repos.filter((repo) => state.selected.has(repo.full_name));
  if (!selected.length) return;
  setLoading(true);
  clearNotice();
  const deleted = [];
  const failed = [];
  for (const repo of selected) {
    try {
      await api(`/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`, { method: "DELETE" });
      deleted.push(repo.full_name);
      state.selected.delete(repo.full_name);
    } catch (error) {
      failed.push(`${repo.full_name}: ${error.message}`);
    }
  }
  $("deleteConfirm").classList.add("hidden");
  await loadRepos();
  if (failed.length) {
    showNotice(`${deleted.length} gelöscht. Fehler: ${failed.join(" | ")}`, "error");
  } else {
    showNotice(`${deleted.length} Repository${deleted.length === 1 ? "" : "s"} endgültig gelöscht.`, "success");
  }
}

async function disconnect() {
  await chrome.storage.local.remove(["githubOAuthToken", "githubToken"]);
  state.token = "";
  state.user = null;
  state.repos = [];
  state.selected.clear();
  $("accountBar").classList.add("hidden");
  $("connectedPermissionsHelp").classList.add("hidden");
  $("workspace").classList.add("hidden");
  $("connectionPanel").classList.remove("hidden");
  $("repoList").replaceChildren();
  clearNotice();
}

$("loginButton").addEventListener("click", async () => {
  const clientId = $("clientIdInput").value.trim();
  if (!clientId) {
    showNotice("Bitte zuerst die öffentliche Client ID deiner GitHub OAuth-App eintragen.", "error");
    return;
  }
  try {
    const authUrl = `${chrome.runtime.getURL("auth.html")}?client_id=${encodeURIComponent(clientId)}`;
    const authWindow = window.open(authUrl, "_blank");
    if (!authWindow) throw new Error("Der Browser hat das Anmeldefenster blockiert.");
    await chrome.storage.local.set({ githubOAuthClientId: clientId });
    showNotice("GitHub-Anmeldung geöffnet. Nach der Freigabe dieses Fenster erneut öffnen.", "info");
  } catch (error) {
    showNotice(error.message || "Die GitHub-Anmeldeseite konnte nicht geöffnet werden.", "error");
  }
});
$("refreshButton").addEventListener("click", loadRepos);
$("disconnectButton").addEventListener("click", disconnect);
$("searchInput").addEventListener("input", renderRepos);
$("createForm").addEventListener("submit", createRepo);
$("toggleCreateButton").addEventListener("click", () => {
  const expanded = $("createForm").classList.toggle("hidden") === false;
  $("toggleCreateButton").setAttribute("aria-expanded", String(expanded));
  $("toggleCreateButton").textContent = expanded ? "Schließen" : "＋ Erstellen";
  if (expanded) $("repoName").focus();
});
$("selectVisibleButton").addEventListener("click", () => {
  const query = $("searchInput").value.trim().toLowerCase();
  const visible = state.repos.filter((repo) => `${repo.name} ${repo.full_name} ${repo.description || ""}`.toLowerCase().includes(query));
  for (const repo of visible) state.selected.add(repo.full_name);
  renderRepos();
});
$("deleteSelectedButton").addEventListener("click", openDeleteConfirmation);
$("deletePhrase").addEventListener("input", () => {
  $("confirmDeleteButton").disabled = $("deletePhrase").value.trim() !== "LOESCHEN" || state.loading;
});
$("cancelDeleteButton").addEventListener("click", () => $("deleteConfirm").classList.add("hidden"));
$("confirmDeleteButton").addEventListener("click", deleteSelected);

async function initialize() {
  // Remove any legacy PAT previously stored by version 1.0 of the extension.
  await chrome.storage.local.remove("githubToken");
  const saved = await chrome.storage.local.get(["githubOAuthToken", "githubOAuthClientId"]);
  $("clientIdInput").value = saved.githubOAuthClientId || "";
  if (saved.githubOAuthToken) await connectWithOAuthToken(saved.githubOAuthToken);
}

initialize();
