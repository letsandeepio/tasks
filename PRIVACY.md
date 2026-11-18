# Privacy Policy

_Last updated: 18 November 2026_

`tasks` is an open-source command-line program that runs on your own computer and talks to the Google Tasks API on your behalf.

## What it accesses

When you run `tasks auth`, you grant the program the `https://www.googleapis.com/auth/tasks` scope. It uses that access only to do what you ask from the command line: read, create, edit, complete, move, and delete your task lists and tasks.

## Where your data goes

- Your tasks travel only between your computer and Google's servers.
- The program has no server of its own. The author never receives your tasks, your tokens, or any usage data.
- There is no analytics, telemetry, advertising, or tracking.

## What is stored, and where

The program saves three files in `~/.config/tasks/` on your computer, readable only by your user account:

- `credentials.json`, the OAuth client you provide
- `token.json`, the access and refresh tokens Google issues after you sign in
- `config.json`, your default list

Nothing is stored anywhere else.

## Removing access

Delete `~/.config/tasks/`, and revoke the app's access at <https://myaccount.google.com/permissions>.

## Google API Services User Data Policy

Use of information received from Google APIs follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Contact

Open an issue at <https://github.com/letsandeepio/tasks/issues>.
