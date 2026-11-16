<!-- docs/decisions/2026-11-15-should-a-refund-written-with-ref-and-an-unsigned-a.md -->
# Should a refund written with REF and an unsigned amount count as money back?

- **Date:** 15 November 2026
- **Piece:** refund-shows-as-spending
- **Options:** A. Store REF and REFUND rows as money back (negative) (A small rule change, plus a re-import of any data already stored; Can be partly undone) · B. Keep the recorded sign decision: unsigned refunds stay spending (No work; refunds written with REF keep counting as spending; Can be undone)
- **Recommended:** negative
- **Chosen:** negative
- **The director's words:** none
