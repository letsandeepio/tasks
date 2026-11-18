#!/usr/bin/env node
import fs from "node:fs";
import { Command } from "commander";
import { tasks as tasksApi } from "@googleapis/tasks";
import { login, getAuthorizedClient } from "../src/auth.js";
import { CREDENTIALS_PATH, readJson, writeJson, readSettings, updateSettings } from "../src/config.js";
import { toApiDue, fromApiDue } from "../src/dates.js";

let cachedApi;
function api() {
  cachedApi ??= tasksApi({ version: "v1", auth: getAuthorizedClient() });
  return cachedApi;
}

async function allLists() {
  const items = [];
  let pageToken;
  do {
    const { data } = await api().tasklists.list({ maxResults: 100, pageToken });
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

// Accepts a list id, an exact title, or a unique case-insensitive title prefix.
async function resolveList(ref) {
  const lists = await allLists();
  if (!ref) {
    const { defaultList } = readSettings();
    const found = defaultList && lists.find((l) => l.id === defaultList);
    return found ?? lists[0];
  }
  const needle = ref.toLowerCase();
  const exact = lists.find((l) => l.id === ref || l.title.toLowerCase() === needle);
  if (exact) return exact;
  const prefix = lists.filter((l) => l.title.toLowerCase().startsWith(needle));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) throw new Error(`"${ref}" matches several lists: ${prefix.map((l) => l.title).join(", ")}`);
  throw new Error(`No list called "${ref}". Run: tasks lists`);
}

// Fetches a list's tasks in display order: top-level tasks by position, each followed by its subtasks.
async function listTasks(listId, { all = false } = {}) {
  const items = [];
  let pageToken;
  do {
    const { data } = await api().tasks.list({
      tasklist: listId,
      maxResults: 100,
      showCompleted: all,
      showHidden: all,
      pageToken,
    });
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  const byPosition = (a, b) => (a.position ?? "").localeCompare(b.position ?? "");
  const roots = items.filter((t) => !t.parent || !items.some((p) => p.id === t.parent)).sort(byPosition);
  return roots.flatMap((root) => [root, ...items.filter((t) => t.parent === root.id).sort(byPosition)]);
}

// A task ref is the number shown by `tasks ls` or a task id.
async function resolveTask(listId, ref) {
  if (/^\d+$/.test(ref)) {
    const task = (await listTasks(listId))[Number(ref) - 1];
    if (!task) throw new Error(`No task #${ref}. Run: tasks ls`);
    return task;
  }
  const task = (await listTasks(listId, { all: true })).find((t) => t.id === ref);
  if (!task) throw new Error(`No task with id ${ref}.`);
  return task;
}

function formatTask(task, index) {
  const box = task.status === "completed" ? "[x]" : "[ ]";
  const due = fromApiDue(task.due);
  const indent = task.parent ? "    " : "";
  const num = String(index + 1).padStart(3);
  return `${num}. ${indent}${box} ${task.title || "(untitled)"}${due ? `  (due ${due})` : ""}`;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

const program = new Command();
program
  .name("tasks")
  .description("Manage Google Tasks from the terminal.")
  .version("1.0.0")
  .showHelpAfterError();

program
  .command("auth")
  .description("Sign in to Google (once). Stores tokens in ~/.config/tasks.")
  .option("-c, --credentials <file>", "Desktop OAuth client JSON downloaded from Google Cloud")
  .action(async (opts) => {
    if (opts.credentials) {
      const client = readJson(opts.credentials);
      if (!client?.installed) throw new Error(`${opts.credentials} is not a Desktop OAuth client file.`);
      writeJson(CREDENTIALS_PATH, client);
    }
    await login();
    console.log("Signed in.");
  });

const lists = program.command("lists").description("Show, add, rename, delete, or pick the default list.");

lists
  .command("ls", { isDefault: true })
  .description("Show all lists. The default list is marked with *.")
  .option("--json", "print JSON")
  .action(async (opts) => {
    const all = await allLists();
    const current = (await resolveList()).id;
    if (opts.json) return printJson(all.map((l) => ({ ...l, default: l.id === current })));
    for (const l of all) console.log(`${l.id === current ? "*" : " "} ${l.title}`);
  });

lists
  .command("use <list>")
  .description("Set the default list for every other command.")
  .action(async (ref) => {
    const list = await resolveList(ref);
    updateSettings({ defaultList: list.id });
    console.log(`Default list is now "${list.title}".`);
  });

lists
  .command("add <title>")
  .description("Create a list.")
  .action(async (title) => {
    const { data } = await api().tasklists.insert({ requestBody: { title } });
    console.log(`Created list "${data.title}".`);
  });

lists
  .command("rename <list> <title>")
  .description("Rename a list.")
  .action(async (ref, title) => {
    const list = await resolveList(ref);
    await api().tasklists.patch({ tasklist: list.id, requestBody: { title } });
    console.log(`Renamed "${list.title}" to "${title}".`);
  });

lists
  .command("rm <list>")
  .description("Delete a list and every task in it.")
  .option("-y, --yes", "skip the safety check")
  .action(async (ref, opts) => {
    const list = await resolveList(ref);
    if (!opts.yes) throw new Error(`This deletes "${list.title}" and all its tasks. Re-run with --yes to confirm.`);
    await api().tasklists.delete({ tasklist: list.id });
    if (readSettings().defaultList === list.id) updateSettings({ defaultList: undefined });
    console.log(`Deleted list "${list.title}".`);
  });

const listOption = ["-l, --list <list>", "list name or id (defaults to `tasks lists use`)"];

program
  .command("ls")
  .description("Show open tasks.")
  .option(...listOption)
  .option("-a, --all", "include completed and hidden tasks")
  .option("--json", "print JSON")
  .action(async (opts) => {
    const list = await resolveList(opts.list);
    const tasks = await listTasks(list.id, { all: opts.all });
    if (opts.json) return printJson(tasks);
    if (!tasks.length) return console.log(`"${list.title}" has no ${opts.all ? "" : "open "}tasks.`);
    console.log(`${list.title}\n`);
    tasks.forEach((t, i) => console.log(formatTask(t, i)));
  });

program
  .command("add <title...>")
  .description("Add a task.")
  .option(...listOption)
  .option("-d, --due <date>", "today, tomorrow, +N, a weekday, or YYYY-MM-DD")
  .option("-n, --notes <text>", "notes (use - to read from stdin)")
  .option("-p, --parent <task>", "make it a subtask of this task number or id")
  .option("--json", "print the created task as JSON")
  .action(async (words, opts) => {
    const list = await resolveList(opts.list);
    const parent = opts.parent ? (await resolveTask(list.id, opts.parent)).id : undefined;
    const { data } = await api().tasks.insert({
      tasklist: list.id,
      parent,
      requestBody: {
        title: words.join(" "),
        notes: opts.notes === "-" ? readStdin() : opts.notes,
        due: opts.due ? toApiDue(opts.due) : undefined,
      },
    });
    if (opts.json) return printJson(data);
    console.log(`Added "${data.title}" to "${list.title}".`);
  });

program
  .command("show <task>")
  .description("Show one task in full.")
  .option(...listOption)
  .option("--json", "print JSON")
  .action(async (ref, opts) => {
    const list = await resolveList(opts.list);
    const task = await resolveTask(list.id, ref);
    if (opts.json) return printJson(task);
    console.log(task.title || "(untitled)");
    console.log(`  status:  ${task.status}`);
    if (task.due) console.log(`  due:     ${fromApiDue(task.due)}`);
    if (task.completed) console.log(`  done:    ${task.completed}`);
    console.log(`  updated: ${task.updated}`);
    console.log(`  id:      ${task.id}`);
    if (task.notes) console.log(`\n${task.notes}`);
  });

program
  .command("edit <task>")
  .description("Change a task's title, due date, or notes.")
  .option(...listOption)
  .option("-t, --title <title>", "new title")
  .option("-d, --due <date>", "new due date, or none to clear it")
  .option("-n, --notes <text>", "new notes (use - for stdin, empty string to clear)")
  .action(async (ref, opts) => {
    const list = await resolveList(opts.list);
    const task = await resolveTask(list.id, ref);
    const body = {};
    if (opts.title !== undefined) body.title = opts.title;
    if (opts.notes !== undefined) body.notes = opts.notes === "-" ? readStdin() : opts.notes;
    if (opts.due !== undefined) body.due = opts.due === "none" ? null : toApiDue(opts.due);
    if (!Object.keys(body).length) throw new Error("Nothing to change. Pass --title, --due, or --notes.");
    const { data } = await api().tasks.patch({ tasklist: list.id, task: task.id, requestBody: body });
    console.log(`Updated "${data.title}".`);
  });

program
  .command("done <tasks...>")
  .description("Mark tasks complete. Numbers refer to the current `tasks ls` output.")
  .option(...listOption)
  .action(async (refs, opts) => {
    const list = await resolveList(opts.list);
    // Resolve every ref before changing anything, since completing a task renumbers the rest.
    const targets = await Promise.all(refs.map((r) => resolveTask(list.id, r)));
    for (const t of targets) {
      await api().tasks.patch({ tasklist: list.id, task: t.id, requestBody: { status: "completed" } });
      console.log(`Done: ${t.title}`);
    }
  });

program
  .command("undo <task>")
  .description("Mark a completed task as open again (takes a task id; see `tasks ls --all --json`).")
  .option(...listOption)
  .action(async (ref, opts) => {
    const list = await resolveList(opts.list);
    const tasks = await listTasks(list.id, { all: true });
    const task = tasks.find((t) => t.id === ref);
    if (!task) throw new Error(`No task with id ${ref} in "${list.title}".`);
    await api().tasks.patch({
      tasklist: list.id,
      task: task.id,
      requestBody: { status: "needsAction", completed: null },
    });
    console.log(`Reopened: ${task.title}`);
  });

program
  .command("rm <tasks...>")
  .description("Delete tasks.")
  .option(...listOption)
  .action(async (refs, opts) => {
    const list = await resolveList(opts.list);
    const targets = await Promise.all(refs.map((r) => resolveTask(list.id, r)));
    for (const t of targets) {
      await api().tasks.delete({ tasklist: list.id, task: t.id });
      console.log(`Deleted: ${t.title}`);
    }
  });

program
  .command("mv <task> <list>")
  .description("Move a task to another list.")
  .option(...listOption)
  .action(async (ref, dest, opts) => {
    const from = await resolveList(opts.list);
    const to = await resolveList(dest);
    const task = await resolveTask(from.id, ref);
    await api().tasks.move({ tasklist: from.id, task: task.id, destinationTasklist: to.id });
    console.log(`Moved "${task.title}" to "${to.title}".`);
  });

program
  .command("clear")
  .description("Hide all completed tasks in a list.")
  .option(...listOption)
  .action(async (opts) => {
    const list = await resolveList(opts.list);
    await api().tasks.clear({ tasklist: list.id });
    console.log(`Cleared completed tasks from "${list.title}".`);
  });

program.parseAsync().catch((err) => {
  const message = err.response?.data?.error_description ?? err.response?.data?.error?.message ?? err.message;
  if (/invalid_grant/.test(message) || err.response?.data?.error === "invalid_grant") {
    console.error("Your Google sign-in has expired or was revoked. Run: tasks auth");
  } else {
    console.error(`tasks: ${message}`);
  }
  process.exit(1);
});
