<!-- docs/decisions/2026-11-16-correct-the-refunds-already-stored-before-the-refu.md -->
# Correct the refunds already stored before the refund rule, so the month page counts them as money back?

- **Date:** 16 November 2026
- **Piece:** month-page
- **Options:** A. Correct the stored refund rows from a backup, and make a re-import match them (A one-time change to stored rows, after a backup; no change to the import, since a re-import already matches a corrected row; the script refuses to run where a refund already has its money-back row; Can be partly undone) · B. Leave stored rows as they are; fix only future imports (Nothing now; the month page keeps showing those refunds as spending; Can be undone)
- **Recommended:** fix
- **Chosen:** fix
- **The director's words:** none
