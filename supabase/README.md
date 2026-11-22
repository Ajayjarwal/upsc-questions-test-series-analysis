# Account quote storage

Apply `migrations/20261113161638_account_quote_collections.sql` once to the existing Supabase project before publishing the quote-sync update. It creates only `quote_collections`; it does not alter questions or progress.

Each signed-in user can read, insert, and update only their own collection. Anonymous access is disabled. No service key belongs in the website.

After deployment, open the website in the browser that contains your existing quotes. If the account has no quote collection, those browser quotes are copied to it once. An existing account collection is never automatically replaced by an older browser copy. The editor offers **Import browser quotes** when a different browser copy is available; saving applies that chosen collection to the account.

Quotes load when signing in or reloading the site, and refresh when returning to the page. A failed quote save keeps the editor open and preserves the draft. Account caches are separated by user; the browser-only preview remains isolated.

Run the isolated checks with:

```sh
node --test tests/import-review.cjs tests/search-quotes.cjs tests/quote-sync.cjs
```

The automated checks use fake account backends. Do not create sample records in the live account to test this change.

# Completed-test progress

`migrations/20261115040442_account_test_sessions.sql` adds the `test_sessions` table used by the progress graph. It is separate from questions, per-question progress and quotes. Row-level policies allow signed-in users to read and insert only their own results; updates, deletes and anonymous access are not granted. Results are immutable snapshots, so repeated retries and backup restores use the same ID without overwriting existing test outcomes.

The test-progress graph appears only in the Static dashboard. Completing a 50- or 100-question Static Practice or Exam session records its date, section, counts, current +2/−0.66 marks and per-subject breakdown. Existing results from other sections are retained but are not displayed in the graph. Daily revision, unfinished sessions and other lengths do not enter the graph. A subject filter shows only that subject's portion of the paper while the length filter still refers to the complete paper. Hover details identify the subject(s), including mixed papers.

Supabase results sync per record to the account. The browser keeps a cache separated by account and retains pending results for retry if a save fails. Sign-out and account switching clear in-memory history and ignore stale network responses. Browser-only storage modes retain scoped local history without contacting Supabase. History loading and failures do not prevent use of the question bank.

Backups include an optional `test_history` list. Old backups remain supported and do not erase existing test-session history. The graph combines immutable recorded attempts with one legacy summary per imported Static paper that has no recorded whole-paper result. Legacy summaries require every question to have a saved answer or explicit skip. Their dates show last question activity, not an inferred submission date; missing dates stay unavailable. These summaries reflect latest question outcomes, may change after repeat practice, and never create cloud test-session records. Hover labels distinguish last activity from completed attempts.

New whole-paper sessions save an optional `paperId` only when their question IDs exactly cover one imported paper. This metadata survives account sync, caching and backups. A matching immutable attempt takes precedence over the paper's derived summary, while separate repeat attempts remain separate points. Older sessions without a paper ID are matched only by an exact, unambiguous paper title and full paper length. Ambiguous titles are left separate rather than risking data loss. No demo results are seeded in production.

Run `node --test tests/*.cjs` for the regression and fake-backend history checks. Do not insert artificial test results into the live table for verification.
