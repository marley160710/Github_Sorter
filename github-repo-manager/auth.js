const OAUTH_DEVICE_URL = "https://github.com/login/device/code";
const OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_URL = "https://api.github.com";
const $ = (id) => document.getElementById(id);

let isRunning = false;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function postForm(url, values, allowOAuthErrors = false) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams(values),
  });
  const data = await response.json().catch(() => ({}));
  if ((!response.ok && !(allowOAuthErrors && data.error)) || (data.error && !allowOAuthErrors)) {
    const error = data.error_description || data.message || data.error || `HTTP ${response.status}`;
    if (error === "device_flow_disabled") {
      throw new Error("Device Flow ist für diese OAuth-App noch nicht aktiviert. Öffne die OAuth-App-Einstellungen auf GitHub und aktiviere Device Flow.");
    }
    throw new Error(error);
  }
  return data;
}

function showError(message) {
  $("setupError").textContent = message;
  $("setupError").classList.remove("hidden");
  $("startButton").disabled = false;
}

async function startDeviceFlow() {
  if (isRunning) return;
  isRunning = true;
  $("setupError").classList.add("hidden");
  $("successMessage").classList.add("hidden");
  $("verification").classList.add("hidden");
  $("startButton").disabled = true;
  $("startButton").textContent = "Verbindung wird vorbereitet…";

  try {
    const fromUrl = new URLSearchParams(window.location.search).get("client_id");
    const { githubOAuthClientId: savedClientId } = await chrome.storage.local.get("githubOAuthClientId");
    const clientId = fromUrl || savedClientId;
    if (!clientId) throw new Error("Client ID fehlt. Trage sie zuerst im Repo Manager ein.");
    if (fromUrl && fromUrl !== savedClientId) await chrome.storage.local.set({ githubOAuthClientId: fromUrl });

    const device = await postForm(OAUTH_DEVICE_URL, {
      client_id: clientId,
      scope: "repo delete_repo",
    });
    const verificationUrl = new URL(device.verification_uri || "https://github.com/login/device");
    if (verificationUrl.origin !== "https://github.com") {
      throw new Error("GitHub hat eine ungültige Bestätigungsadresse zurückgegeben.");
    }

    $("userCode").textContent = device.user_code;
    $("verifyLink").href = verificationUrl.href;
    $("verification").classList.remove("hidden");
    $("statusText").textContent = "Gib den Code bei GitHub ein und bestätige die angezeigten Rechte. Diese Seite muss geöffnet bleiben.";
    $("startButton").textContent = "Anmeldung läuft…";

    let interval = Math.max(1, Number(device.interval) || 5);
    const expiresAt = Date.now() + (Number(device.expires_in) || 900) * 1000;
    while (Date.now() < expiresAt) {
      await delay(interval * 1000);
      const tokenResult = await postForm(OAUTH_TOKEN_URL, {
        client_id: clientId,
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }, true);
      if (tokenResult.access_token) {
        const userResponse = await fetch(`${API_URL}/user`, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${tokenResult.access_token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        const user = await userResponse.json().catch(() => ({}));
        if (!userResponse.ok) throw new Error(user.message || "GitHub-Anmeldung konnte nicht bestätigt werden.");

        await chrome.storage.local.set({ githubOAuthToken: tokenResult.access_token });
        $("statusText").textContent = `Angemeldet als @${user.login}.`;
        $("successMessage").textContent = "Fertig! Schließe dieses Tab und öffne den Repo Manager erneut.";
        $("successMessage").classList.remove("hidden");
        $("startButton").classList.add("hidden");
        return;
      }
      if (tokenResult.error === "authorization_pending") continue;
      if (tokenResult.error === "slow_down") {
        interval += 5;
        continue;
      }
      if (tokenResult.error === "access_denied") throw new Error("Anmeldung bei GitHub wurde abgelehnt.");
      if (tokenResult.error === "expired_token") throw new Error("Der Anmeldecode ist abgelaufen. Starte die GitHub-Anmeldung erneut.");
      throw new Error(tokenResult.error_description || tokenResult.error || "GitHub-Anmeldung fehlgeschlagen.");
    }
    throw new Error("Der Anmeldecode ist abgelaufen. Starte die GitHub-Anmeldung erneut.");
  } catch (error) {
    showError(error.message || "GitHub-Anmeldung fehlgeschlagen.");
  } finally {
    isRunning = false;
    if ($("successMessage").classList.contains("hidden")) {
      $("startButton").textContent = "Erneut versuchen";
    }
  }
}

$("startButton").addEventListener("click", startDeviceFlow);
$("copyButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("userCode").textContent);
    $("copyButton").textContent = "Kopiert";
  } catch {
    $("copyButton").textContent = "Code markieren und kopieren";
  }
});
