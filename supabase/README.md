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
