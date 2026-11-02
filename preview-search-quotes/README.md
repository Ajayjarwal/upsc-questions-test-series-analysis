# Search and quote design preview

Open http://127.0.0.1:8765/preview-search-quotes/ while the local server is running.

This folder contains a separate copy of the application. The root `index.html` has not been edited. It has no cloud login or cloud connection; a browser policy blocks outgoing connections from JavaScript. Questions, attempts and quotes use separate preview storage keys. The ten initial questions, including four religion examples, are illustrative samples, not verified UPSC PYQs. Existing imported question sets and saved quotes are preserved.

## Try the features

- In CSE, choose **Search questions**. Try **Federalism**: two direct matches (including one found only in a solution) and one related topic. Turn off **Include related topics** to see only direct matches.
- Search covers question text, options, explanation and quick notes. Related matching also checks subject/topic labels. Terms use the explicit dictionary in `preview.js`; this is not unlimited semantic search. Broad **Religion** searches expand to Buddhism, Jainism, Bhakti, Sufism and other listed traditions. Narrow terms do not expand back to the umbrella and across unrelated subtopics. Actual mentions in answer options are still matches. Results show their source and never record an attempt.
- The compact quote box sits below the theme button, on the right of the question-space tabs. On wider screens it uses the existing header gaps, keeping the logo, space tabs and main navigation at their original positions. Long quotes show two lines; hover for the full quote or open the editor. On narrow screens the card gets its own row to avoid overlapping tabs. Choose its pencil button to edit the full collection, add/remove quotes, or import JSON. Imported quotes replace the draft only; **Save quotes** applies the collection. **Cancel** discards the draft.
- One quote is selected deterministically for each local calendar day. Quotes are stored only in this preview browser.
- `quotes.example.json` demonstrates the supported format. Arrays of strings, `{text,author}` objects, and `{quote,author}` objects also work, either as a top-level array or under `quotes`.

Checks: `node --test preview-search-quotes/preview.test.cjs`.

No publishing or changes to the original website are included. These features must be deliberately integrated into the original application after design approval. Cloud storage for quotes has not been added in this preview.
