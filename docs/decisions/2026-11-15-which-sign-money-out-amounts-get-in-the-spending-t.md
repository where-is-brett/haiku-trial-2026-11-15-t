<!-- docs/decisions/2026-11-15-which-sign-money-out-amounts-get-in-the-spending-t.md -->
# Which sign money-out amounts get in the spending tracker

- **Date:** 15 November 2026
- **Piece:** bank-statement-import
- **Options:** A. Brackets and minus signs stored negative; unsigned amounts such as purchases stay positive (none; this is what the code does now; Can be undone) · B. Every amount negated: brackets and minus signs stored positive; unsigned amounts such as purchases stored negative (one line to change now; totals in later slices would read the other way; Can be undone)
- **Recommended:** as-built
- **Chosen:** as-built
- **The director's words:** none
