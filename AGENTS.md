<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the uploaded welcome experience at `/` and the existing AI coach at `/coach`; this preserves the supplied page while giving Get Started a stable destination.
- Serve the uploaded self-contained welcome document from `public/welcome.html` in the home route's frame; its original interactive layout and scripts remain isolated from the coach's styles and logic.
