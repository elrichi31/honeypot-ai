# Web Honeypot

## Structure

- `app.py`: Flask entrypoint and request forwarding to the ingest API.
- `classifier.py`: attack classification heuristics.
- `response_catalog.py`: routing plus dynamic response rendering.
- `templates/`: HTML surfaces grouped by product or page family.
- `payloads/`: static non-HTML bodies such as `.env`, `robots.txt`, XML-RPC, and SQL dumps.

## Editing guide

- Change page look and copy in `templates/`.
- Change static leaked files in `payloads/`.
- Change routing or dynamic error behavior in `response_catalog.py`.

## Notes

- `app.py` now uses `response_catalog.py` as the runtime source for web responses.
- The older `responses.py` is legacy and should be removed from the repo.
