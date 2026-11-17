# Section pages

The website uses hash routes so every page works on GitHub Pages without server rewrites or a framework. Keep HTML, CSS and JavaScript in the existing three-file structure.

Main pages:

- `#/dashboard` — combined SWOT analysis
- `#/static`
- `#/current-affairs`
- `#/cse`
- `#/csat`
- `#/capf`

Append `/notebook`, `/bookmarks`, `/import`, `/practice`, `/revision` or `/mistakes` to a section address for its study tools. `/search` is available for CSE and CSAT. `#/dashboard/static` and the corresponding section paths open that section's SWOT analysis. `#/ca` is accepted as an alias for `#/current-affairs`.

Main menu and tool tabs are real links, supporting bookmarks, copied links and opening in another tab. Navigation updates the browser title, responds to Back and Forward, and restores the page scroll position. Question picks, filters and ordinary rerenders do not add history entries. Unrecognised addresses return to the dashboard. Existing links to the site root continue to work.

Direct links wait for the existing login and question-bank loading flow. Supabase callback fragments and PKCE query parameters are left to the existing auth client. No auth settings, storage tables, credentials or policies are changed.

In-progress quizzes are temporary and are not recreated from shared links or after refresh. Browser Back/Forward and page-link navigation use the existing exit dialog before leaving an unfinished attempt. Refreshing or leaving the site triggers the browser's standard unfinished-session protection. Completed checked answers retain their existing save behaviour; unsubmitted exam answers are not silently saved as results.

Mapping is available directly below Dashboard in the navigation sidebar on every study section and the dashboard. The standalone `mapping/` page opens in a new browser tab, keeping the current study page and unfinished quiz in place. The shortcut uses a standard new-tab link, with no popup window. Map progress and edits are stored separately in this browser, without changing the question bank or account storage.

Run `node --test tests/*.cjs` to check navigation, history, login handoff, quiz protection and the existing app behaviour. Browser verification uses an isolated copy with demo questions and blocked cloud connections. Never create sample tests in the live account.

Mapping Practice and Recall use a full-map question view. All World Places asks for a region before allowing multiple feature types; targets and available regional distractors follow that selection. The per-place timer is optional, supports a selected duration, and can be toggled during an unanswered question. Revealing a Recall answer never counts as a correct answer until it is self-graded.
