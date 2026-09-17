# SPEC-team.md -- team access to a tenant

## The problem

A tenant was one email. Login slugified the address into a tenant id
(`marc@getquotient.ai` -> `marc-getquotient-ai`), a token was scoped to that
one tenant, and two people from the same company landed in two unrelated
tenants. The only way to share a board was to send the Studio link with its
tenant token in it -- a bearer secret that grants the whole tenant.

## The model

A tenant has MEMBERS. Login resolves your tenant through membership, in
this order (`resolveTenantId` in `src/auth/team-store.ts`):

1. **An invite** for your email: you join that tenant; the invite is consumed.
2. **An existing membership** for your email.
3. **Your company domain**: everyone at `acme.com` shares the acme tenant.
   The first person from a domain founds it. If they already had a
   per-email tenant from before, THAT tenant becomes the company's: their
   projects, brand kit and every existing link carry over untouched (no
   file moves, no aliases -- the tenant id is opaque).
4. **A consumer domain** (gmail and the like, `CONSUMER_DOMAINS`) stays one
   tenant per email.

Removing a member blocks the domain rule for them, so they do not walk
straight back in on their next sign-in; they land in a tenant of their own.
The remover cannot remove themselves.

Everyone in a tenant sees everything: every project, the brand kit, delete
included. There are no per-project permissions and no roles. A person is in
ONE tenant; a tenant switcher (for someone in several) is the next layer,
mostly Studio and the MCP OAuth step, and is not built.

## Where it lives

- `src/auth/team-store.ts`: the store (`team.json` beside `tenants.json`),
  the resolution rule, `listTeam` / `inviteMember` / `removeMember`.
- `src/auth/google-oauth.ts`: login calls `resolveTenantForLogin`; the
  per-email record in tenant-store is pointed at the team tenant, so
  `/auth/me` and the MCP flow see it.
- `/api/team/{tenant}` (GET list, POST invite, DELETE remove) -- tenant-
  enforced at the choke point like every other route; the acting email is
  the session's.
- `/team` page, linked from the phone Studio (Team) and the desktop Studio
  header (Team button), with the same token-in-the-link auth as the take page.
- MCP tool `team` (list / invite / remove).
