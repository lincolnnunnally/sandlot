# CLAUDE.md

## Asks of Lincoln go on his to-do list (owner request, 2026-11-01; reaffirmed 2026-11-04)

Anything only Lincoln can do goes on his to-do list at
https://dashboard.unitedundergod.org/tasks, **not only in your chat reply**. Chat asks get buried. That
means money, a credential only he can create, an account only he can open, a mission or product
decision, or a hand step no agent can do.

1. **Add it.** The list lives in `source-of-truth/owner-tasks.json` in the AppEngine repo
   (`lincolnnunnally/AppEngine`; attach it with `add_repo` if this session doesn't have it):
   `node scripts/owner-task.mjs add --app <slug> --title "..." --why "..." --step "..." --kind <money|credential|decision|account|other> --priority <blocker|recommended|optional> --link <url> --by "<you>" --source "<repo PR>"`,
   then `node scripts/owner-task.mjs check`, then open a PR and merge it to `main`. If you hold
   `APP_ENGINE_TASKS_TOKEN`, you can instead POST it to `/api/engine/owner-tasks` (instant).
2. **Say it once.** In chat, name the ask in one line with its task id.
3. **Check before you finish.** Before ending any reply that asks Lincoln for something, make sure
   every ask in it has a task id on the list.
4. **Close the loop.** When you verify he finished it, mark it done
   (`node scripts/owner-task.mjs done <id>`).

Full rules: AppEngine `source-of-truth/owner-task-queue.md`.
