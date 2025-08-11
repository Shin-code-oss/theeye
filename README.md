# THE EYE — MVP

Black & white, accessible, and focused on keeping unresolved social issues visible.

## How to edit
- Add or edit issues in `issues.json`. Each item needs: `id`, `title`, `summary`, `tags`, `status`, `priority` (1–5), `region`, optional `details`, `updated`, `sources`.
- No backend yet: this is a static site. Submissions can be a Google Form link wired to the “Submit” nav item.

## Local preview
Just open `index.html` in a browser. Some browsers block `fetch` from file URLs. If that happens, run a tiny local server:

**Python 3**
```
python3 -m http.server 8000
```
Then open http://localhost:8000

## Deploy (GitHub Pages)
1. Create a **public** repo and upload these files.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Pick `main` and `/ (root)`.
3. Wait ~1 minute; your site appears at `https://<your-username>.github.io/<repo-name>/`.

## Roadmap
- Submissions & moderation (Form/DB)
- Comments and updates per issue
- Email digests / reminders
- Multi-language content
