# Pak Hijri Project Context

Pak Hijri is a source-backed Hijri date API for Pakistan.

## Core Problem

Many Islamic apps calculate Hijri dates automatically. That works sometimes, but Pakistan's official Hijri date can differ because Pakistan follows local moon-sighting announcements.

When an app shows the wrong Hijri date and asks the user to manually adjust `+1`, `-1`, or similar offsets, the app puts responsibility on the user.

Pak Hijri tries to solve this at the data level.

## Project Goal

Provide Pakistan-specific Hijri month-start dates based on official or trusted moon-sighting sources.

## Product Decision

Pak Hijri is not another Hijri calculation library.

It is a source-backed Pakistan Hijri month-start dataset/API. 