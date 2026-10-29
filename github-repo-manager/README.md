# GitHub Repo Manager

Eine Chromium-Erweiterung (Manifest V3), um eigene GitHub-Repositories zu finden, neue anzulegen und ausgewählte zu löschen. Die Anmeldung läuft über GitHubs OAuth Device Flow; du musst keinen Personal Access Token erstellen oder kopieren.

## Installation

1. Öffne `chrome://extensions` (in Edge: `edge://extensions`).
2. Aktiviere **Entwicklermodus**.
3. Wähle **Entpackte Erweiterung laden** und dann diesen Ordner.
4. Richte einmalig eine GitHub OAuth-App ein (siehe unten) und kopiere ihre öffentliche Client ID.
5. Öffne die Erweiterung, füge die Client ID ein und klicke **GitHub Login**.
6. In dem geöffneten Tab startest du die Anmeldung, gibst den angezeigten Code auf GitHub ein und bestätigst die Rechte.

## Einmalige GitHub OAuth-App-Einrichtung

1. Öffne [GitHub Developer Settings](https://github.com/settings/developers) und erstelle unter **OAuth Apps** eine neue App.
2. Als Homepage URL kannst du `https://github.com` verwenden. GitHub verlangt auch eine Authorization callback URL; für den Device Flow wird sie nicht verwendet, du kannst ebenfalls `https://github.com` eintragen.
3. Aktiviere in den App-Einstellungen **Enable Device Flow**.
4. Kopiere die **Client ID** in die Erweiterung. Die Client ID ist öffentlich; kein Client Secret in die Erweiterung eintragen.

Die OAuth-App fragt die Scopes **repo** und **delete_repo** ab. Damit erhält sie weitreichenden Zugriff auf private Repositories und kann Repositories löschen, auf die dein Konto Zugriff hat. Die Erweiterung zeigt in ihrer Liste nur Repositories, die deinem Konto gehören. Den App-Zugriff kannst du jederzeit unter [GitHub Settings → Applications](https://github.com/settings/applications) widerrufen. **Trennen** entfernt nur das lokale OAuth-Zugriffstoken aus dem Browser; es widerruft die App-Berechtigung nicht bei GitHub.

Beim ersten Start entfernt die Erweiterung einen eventuell von Version 1.0 lokal gespeicherten PAT aus `chrome.storage.local`. Falls du diesen alten PAT nicht mehr brauchst, widerrufe ihn zusätzlich in GitHub Developer Settings; das Entfernen aus dem Browser widerruft ihn nicht bei GitHub.

## Funktionen

- Eigene persönliche Repositories (öffentlich und privat) laden, suchen und nach Sichtbarkeit/Sprache ansehen.
- Mehrere Repositories auswählen und nach zusätzlicher Texteingabe endgültig löschen.
- Neue öffentliche oder private Repositories anlegen, optional mit README.

Organisations-Repositories werden nicht als eigene Repositories angezeigt. Das OAuth-Zugriffstoken wird nach der Anmeldung lokal im Browserprofil gespeichert und direkt an `api.github.com` gesendet. **Löschen ist endgültig**; vor dem Löschen verlangt die Erweiterung zusätzlich die Eingabe von `LOESCHEN`.
