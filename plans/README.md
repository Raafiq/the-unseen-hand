# Plans

`specs/` describes **state** — what must be true, forever.
`plans/` describes **motion** — how we're getting there next.

Each plan file declares its scope, which specs it implements, its dependencies on other plans, and
the concrete validation criteria that flip it from `in-progress` to `done`. Together they form a
queryable micro-DAG of work.

**Full protocol** (frontmatter schema, body template, status lifecycle, closeout-commit ritual,
Follow-ups taxonomy): `C:\Users\mdraa\.claude\skills\specops\references\plans-protocol.md`

**Do not maintain a DAG drawing or status table here** — they rot. Use the specops CLI instead:

```powershell
# What to work on next (ready / awaiting / blocked)
C:\Users\mdraa\.claude\skills\specops\scripts\specops next

# Dependency graph (Mermaid)
C:\Users\mdraa\.claude\skills\specops\scripts\specops dag
```
