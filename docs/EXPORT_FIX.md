# Export response validation

An AI export must contain usable text before Code Insights reports completion.
Previously, an empty model response could reach the Review step with a blank
document and Copy and Download controls that did nothing. Anthropic responses
also lost text whenever it appeared after the first content block.

## Resulting behavior

- The Anthropic adapter collects all text blocks and ignores non-text blocks.
  It rejects a response containing no non-whitespace text and retains the
  provider's stop reason alongside token usage.
- Both AI export routes validate the response before returning success or
  emitting a streaming `complete` event. Blank output becomes an error.
  An Anthropic response stopped by `max_tokens` is reported as incomplete with
  guidance to select a smaller depth.
- The synchronous route rejects a scope with no eligible insights before
  calling the model, matching the streaming route's existing behavior.
- The dashboard independently rejects a blank streaming completion. Review,
  Copy, and Download require non-whitespace content.

The optional `LLMResponse.stopReason` field is additive. This change does not
alter database tables, configured providers, model selection, or token limits.
Token-limit detection currently uses the stop reason supplied by the Anthropic
adapter; other adapters do not gain termination-reason reporting here.

## Regression checks

The regression tests cover text following a thinking block, multiple text
blocks, empty blocks, whitespace-only text, thinking-only responses, preservation
of the provider stop reason, both export routes, and the dashboard completion
handler. A nonblank Markdown response remains available for review.

The failing regression tests were committed before the implementation.
Recorded validation after the implementation:

| Check | Result |
| --- | --- |
| Server test suite | 593 passed |
| CLI test suite | 579 passed |
| Dashboard test suite | 18 passed |
| Workspace production build | Passed |
| Dashboard standalone TypeScript check | Six existing errors, reproduced unchanged at the upstream baseline |

The standalone TypeScript check is not clean. Its errors concern existing test
fixtures, conversation search, Markdown component types, a nullable session
field, and stream types; none is introduced by this export change.

## End-to-end acceptance

After installing the patch, a live Anthropic export at Essential depth
successfully synthesized 25 saved insights. Review visibly displayed 9,771
characters of Markdown. The exact displayed text was saved locally and read
back as a 9,787-byte UTF-8 file.

Clicking Download displayed an “Export downloaded” notification. The
browser-managed file was not located, and browser policy blocked inspection
of the internal downloads page. The notification therefore does not establish
a verified browser download. Copy was not exercised, and the full
Comprehensive-depth export was not rerun.

Remaining acceptance checks are to compare a copied document and a
browser-downloaded file with the displayed text, and to exercise the original
Comprehensive-depth configuration. The synthetic regression tests separately
verify that blank and token-truncated responses cannot report completion.
