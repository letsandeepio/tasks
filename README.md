# tasks

A small command-line client for Google Tasks.

```
$ tasks ls
My Day

  1. [ ] Renew passport  (due 2026-11-20)
  2. [ ] Call the bank
  3.     [ ] Ask about the fee

$ tasks add Buy milk -d tomorrow
$ tasks done 2
```

## Install

```
git clone https://github.com/letsandeepio/tasks.git
cd tasks
npm install
npm link        # puts `tasks` on your PATH
```

Needs Node 20 or later.

## Set up Google access (once)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Tasks API**.
2. Under **Google Auth Platform → Clients**, create an OAuth client of type **Desktop app** and download its JSON.
3. Under **Audience**, set the publishing status to **In production**. While an app is in "Testing", Google expires its refresh tokens after 7 days and you'd have to sign in again every week.
4. Run:

   ```
   tasks auth --credentials ~/Downloads/client_secret_XXXX.json
   ```

   Your browser opens, you approve access, and you're done. The access token refreshes on its own from then on.

Files live in `~/.config/tasks/` (or `$TASKS_CONFIG_DIR`).

## Commands

| Command | What it does |
|---|---|
| `tasks lists` | Show lists; `*` marks the default |
| `tasks lists use <list>` | Set the default list |
| `tasks lists add <title>` | Create a list |
| `tasks lists rename <list> <title>` | Rename a list |
| `tasks lists rm <list> --yes` | Delete a list and its tasks |
| `tasks ls [-a] [--json]` | Show open tasks (`-a` includes completed) |
| `tasks add <title> [-d due] [-n notes] [-p parent]` | Add a task or subtask |
| `tasks show <task>` | Show a task in full |
| `tasks edit <task> [-t title] [-d due\|none] [-n notes]` | Change a task |
| `tasks done <task...>` | Complete tasks |
| `tasks undo <id>` | Reopen a completed task |
| `tasks rm <task...>` | Delete tasks |
| `tasks mv <task> <list>` | Move a task to another list |
| `tasks clear` | Hide completed tasks |

Every task command takes `-l <list>` to work on a list other than the default. Lists can be named by id, exact title, or a unique prefix (`-l up` for "Upcoming").

A `<task>` is its number from `tasks ls` or its id. Due dates accept `today`, `tomorrow`, `+3`, a weekday (`fri`), or `YYYY-MM-DD`.

## Scripting

`ls`, `show`, `add`, and `lists` take `--json`. To catch new tasks, poll `tasks ls --json` and compare ids or the `updated` field with what you saw last time. Google Tasks has no push notifications.

## Privacy

See [PRIVACY.md](PRIVACY.md).

## License

MIT
