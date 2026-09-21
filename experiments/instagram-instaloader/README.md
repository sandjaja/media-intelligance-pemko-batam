# Instagram Instaloader PoC

Isolated experiment for reading a public Instagram profile with Instaloader.

## Scope

- Anonymous only; no Instagram login or session cookies.
- No image/video downloads.
- No database writes.
- No production API integration.
- Default test handle: `diskominfobatam`.

## Run

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python instagram_instaloader_poc.py diskominfobatam
```

A successful response reports only public profile fields such as userid, followers,
following, post count, verification/private/business flags and biography. Failures
are emitted as JSON so cloud/IP restrictions can be distinguished from parser errors.
