# Pak Hijri

Source-backed Hijri dates for Pakistan, exposed as simple JSON data.

Pak Hijri is not a Hijri calculation library. It is a Pakistan-specific Hijri month-start dataset (Exposed as a simple API) based on official or trusted moon-sighting sources.

## Why This Exists

Many Islamic apps calculate Hijri dates automatically. That can be useful, but Pakistan's official Hijri date can differ because Pakistan follows local moon-sighting announcements.

Pak Hijri stores Pakistan-specific month-start dates so apps can use source-backed data when it is available.

## Current Approach

The first version uses static JSON files only:

- `data/1448.json` contains month-start records for Hijri year 1448.
- `data/latest.json` points to the latest active Pakistan Hijri month start for apps.
- `schemas/year.schema.json` defines the expected shape of yearly data files.
- `docs/sources.md` tracks acceptable source types and source notes.
- `docs/project-context.md` explains the project context and product decisions.

## Static API Usage

Fetch the latest active Pakistan Hijri month:

```text
data/latest.json
```

On GitHub Pages, the full endpoint will look like:

```text
https://YOUR_GITHUB_NAME.github.io/pak-hijri/data/latest.json
```

`latest.json` does not need to change every day. It gives the start date of the currently active Pakistan Hijri month.

Example:

```json
{
  "country": "PK",
  "hijri_year": 1448,
  "month": 1,
  "month_name": "Muharram",
  "month_start": "2026-06-17",
  "status": "verified"
}
```

Your app calculates the Hijri day locally:

```text
day = today_gregorian - month_start + 1
```

Example:

```text
month_start = 2026-06-17
today_gregorian = 2026-06-18
day = 2
```

Day 1-28 can be shown normally.

On day 29 or day 30, fetch `latest.json` again because the next month may already have been published.

If the calculated day becomes greater than 30 and `latest.json` still points to the old month, the dataset is stale. The app should stop extending the old month and show an appropriate needs-update state for its product.

## Year Files

Year files such as `data/1448.json` are the archive. They store all month starts for that Hijri year.

`data/latest.json` is the small pointer apps fetch first. It points to the active month and the year file that contains the full record.

## Admin Updates

The GitHub Pages admin UI is public to view, but it cannot save without a GitHub token.

Use a fine-grained GitHub token limited to this repository with contents read/write permission. Do not use a broad token that can edit all repositories.

The admin UI locks the commit target to the current GitHub Pages repository. If this site is later served from a custom domain, set `repoOwner` and `repoName` once in `assets/app.js`.

## Status Values

- `pending`: not added or not confirmed yet
- `verified`: backed by a trusted source
- `estimated`: calculated or inferred, not source-backed
- `disputed`: sources conflict or date is uncertain

## Confidence Values

- `unknown`: no confidence assigned yet
- `low`: weak source or unclear evidence
- `medium`: reasonable source but not official
- `high`: official or strong trusted source
