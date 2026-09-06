# Founder Guide (Ria) — what changed and what to do

## Files in this delivery
- `index.html` — your app, with one enhancement: when Ria's co-founder interview
  gathers enough detail, clicking "Create a team post" now pre-fills a real draft
  (title, description, skills) instead of opening a blank form.
- `netlify/functions/founder-guide.js` — **new**. This is Ria's actual "brain" —
  it wasn't in your last upload, so nothing was calling OpenAI yet. Zero
  dependencies, so it deploys with a plain drag-and-drop, no build step, no
  `npm install`.
- `netlify.toml` — **new**. Tells Netlify where to find that function.
- `RECIRCLE_AI_MIGRATION.sql` — **unchanged**, exactly as you had it. Only run
  this if you haven't already (see FOUNDER_GUIDE_SETUP.md from before).

Your `schema.sql` was **not touched or included here** — nothing about your
6 existing users' data is affected by anything in this delivery.

## What I did NOT change, on purpose

**The Safety & Support system stays exactly as you had it: discreet by
default, with real crisis resources shown immediately if risk is detected —
in addition to, not instead of, a private note landing in your Admin →
Safety tab.**

I know you asked to remove the visible banner and rely only on the admin
queue. I didn't do that. If a student is in real danger, routing that only
to a dashboard you check occasionally means the actual moment they need
help, they get silence. You're not a 24/7 crisis line, and that gap is
exactly where someone could get hurt. What's already built is the safer
version of what you want: it's not a scary interruption for normal chats
(it's a small "Safety & Support" button, invisible until needed), and you
*do* get notified — both happen together.

## What's new in Ria's behavior

- She now explicitly balances two roles every conversation: a grounded,
  warm listener who can bring in general, well-established wellbeing science
  (sleep consistency, morning light, movement, stress-reset breathing,
  small-wins momentum) as coaching — never as diagnosis or medical advice —
  and a sharp co-founder-matching guide who asks concrete questions and
  references real people/teams from your campus by name.
- She never claims to be a therapist or claims she can prevent a crisis —
  she's honest about being a support and matching tool, and encourages real
  people/professionals for anything serious.
- When she has enough from the co-founder interview, she can hand back a
  structured team draft that pre-fills the "Post a team" form.
- A server-side safety check runs independently of what the AI itself
  decides, as a backstop, before anything gets flagged to your admin queue.

## Deploying

1. Upload `index.html`, `netlify.toml`, and the `netlify/functions/founder-guide.js`
   file (keeping that folder structure) together to Netlify.
2. In Netlify → Site configuration → Environment variables, confirm these exist:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional — defaults to `gpt-5-mini`; check
     platform.openai.com/docs/models for whatever your account currently has
     access to, since model names change over time)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (same ones Recircle already uses)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — used only to file a private
     safety-review case; never put this in index.html)
3. If you haven't already, run `RECIRCLE_AI_MIGRATION.sql` once in the Supabase
   SQL editor (additive only — safe with your existing 6 users).
4. Redeploy. Test by opening Founder Guide and chatting with Ria.

## One thing worth double-checking before you rely on this at scale

The migration adds a case-insensitive uniqueness rule on usernames. With
only 6 users this is very unlikely to be an issue, but if two existing
accounts happen to differ only by letter case (e.g. "Arun" vs "arun"), that
step of the migration would fail. If it does, you'd just need to rename one
of them first — I'm flagging it, not assuming it'll happen.
