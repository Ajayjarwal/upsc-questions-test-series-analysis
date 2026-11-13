# CSAT JSON format

Use `csat-source-exam.json` as a format example, replacing its illustrative questions with your own PYQs.

- Import the file while **CSAT** is selected. Source tags identify the originating exam; they do not move questions to another section.
- Set `source_exam` to `"CAPF"` or `"CSE"` at file level when all questions have that source. Values are case-insensitive. `paper.source_exam` is also supported.
- For a mixed file, put `source_exam` on individual questions. A question's tag overrides the file default. The shorter field name `exam` is accepted as an alias, but `source_exam` is recommended.
- Untagged older files still work. Their questions appear under **All sources** and **Untagged**, without guessing from titles or subjects.
- Required question fields are `question`, `options`, and `answer`, plus `subject` either on the question or inherited from the file. Use distinct `no` values within a file. `topic`, `year`, `explanation`, `summary`, and `sources` are optional.
- `paper.year` is inherited by questions without their own `year`. `paper.id` identifies the imported set; keep it stable when replacing that set, and use distinct IDs for separate files.

In CSAT, source filters are available in quiz/Smart Quiz preferences, year-wise practice and review, and question search. Tags are saved with each question and retained in backups.
