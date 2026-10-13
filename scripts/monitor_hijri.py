#!/usr/bin/env python3
"""Monitor Pakistan's official Hijri month-start announcements.

The model may research and propose. This script is the safety gate: it only edits
repository data when the result matches the next pending month, is within a
plausible date window, and its claimed sources appear in Gemini's grounding data.
It never pushes directly; the workflow opens a pull request for review.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LATEST_PATH = ROOT / "data/latest.json"
YEAR_DIR = ROOT / "data"
TZ = ZoneInfo("Asia/Karachi")
MONTH_NAMES = {
    1: "Muharram", 2: "Safar", 3: "Rabi al-Awwal", 4: "Rabi al-Thani",
    5: "Jumada al-Awwal", 6: "Jumada al-Thani", 7: "Rajab",
    8: "Sha'ban", 9: "Ramadan", 10: "Shawwal",
    11: "Dhu al-Qadah", 12: "Dhu al-Hijjah",
}
TRUSTED_DOMAINS = (
    "app.com.pk", "radio.gov.pk", "pid.gov.pk", "gov.pk",
    "dawn.com", "geo.tv", "aaj.tv", "tribune.com.pk",
    "arynews.tv", "thenews.com.pk", "nation.com.pk",
    "minutemirror.com.pk", "samaa.tv", "brecorder.com",
)
OFFICIAL_DOMAINS = ("app.com.pk", "radio.gov.pk", "pid.gov.pk", "gov.pk")


def emit_output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={str(value).replace(chr(10), ' ')}\n")


def write_result(result):
    (ROOT / "monitor-result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    emit_output("action", result.get("action", "needs_review"))
    emit_output("reason", result.get("reason", "No reason provided"))


def domain_of(url):
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def trusted(url):
    host = domain_of(url)
    return any(host == d or host.endswith("." + d) for d in TRUSTED_DOMAINS)


def official(url):
    host = domain_of(url)
    return any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS)


def stop(action, reason, **extra):
    result = {"action": action, "reason": reason, **extra}
    write_result(result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def main():
    latest = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
    today = datetime.now(TZ).date()
    last_start = date.fromisoformat(latest["month_start"])
    elapsed = (today - last_start).days
    force_research = os.environ.get("FORCE_RESEARCH", "").strip().lower() == "true"

    if elapsed < 28 and not force_research:
        return stop(
            "no_change",
            f"Only {elapsed} days have elapsed since {last_start}; research is inactive until day 28. "
            "Use the manual workflow's force_research option to run a safe research test.",
            pakistan_date=today.isoformat(),
            latest_month_start=last_start.isoformat(),
            elapsed_days=elapsed,
            test_mode=False,
        )

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return stop("needs_review", "Missing GEMINI_API_KEY repository secret.",
                    pakistan_date=today.isoformat(), elapsed_days=elapsed)

    current_year = int(latest["hijri_year"])
    current_month = int(latest["month"])
    next_month = current_month + 1
    if next_month > 12:
        return stop(
            "needs_review",
            "The current month is month 12; next Hijri-year file creation needs a human-reviewed change.",
            pakistan_date=today.isoformat(), elapsed_days=elapsed,
        )

    year_path = YEAR_DIR / f"{current_year}.json"
    if not year_path.exists():
        return stop("needs_review", f"Expected year data file is missing: {year_path.name}")

    year_data = json.loads(year_path.read_text(encoding="utf-8"))
    target = next((m for m in year_data["months"] if m["month"] == next_month), None)
    if not target:
        return stop("needs_review", f"Month {next_month} was not found in {year_path.name}.")
    if target["status"] == "verified" and target["gregorian_start_date"]:
        return stop("no_change", f"Month {next_month} is already verified in the year file.")

    prompt = f"""
You research Pakistan's official Hijri calendar. Today's date in Pakistan is {today.isoformat()}.
The latest verified month is {latest['month_name']} {current_year} AH, month {current_month},
starting {last_start.isoformat()}. The next month to research is {MONTH_NAMES[next_month]}
{current_year} AH (month {next_month}).

Use Google Search grounding to look for a CONFIRMED announcement from Pakistan's Central
Ruet-e-Hilal Committee or the Ministry of Religious Affairs. Prefer Associated Press of
Pakistan (APP), Radio Pakistan, government domains, and reputable Pakistani news reports
that explicitly report the committee's decision. Do not treat moon-visibility predictions,
calendar estimates, social posts, or reports from other countries as confirmation.

Only propose update_month when a confirmed decision explicitly identifies the first Gregorian
day of the next Hijri month in Pakistan. If reports conflict, no official decision is available,
or the evidence is unclear, return needs_review or no_change. Never infer a date from astronomy.

The proposed start date must be 29 or 30 days after {last_start.isoformat()}, and should be
today or within the next two Gregorian days. If not, do not update.

Return exactly one JSON object with these fields:
{{
 "action": "no_change" | "update_month" | "needs_review",
 "hijri_year": {current_year},
 "month_number": {next_month},
 "month_name": "{MONTH_NAMES[next_month]}",
 "gregorian_start_date": "YYYY-MM-DD or empty string",
 "status": "verified" | "pending" | "disputed",
 "confidence": "high" | "medium" | "low" | "unknown",
 "sources": [
   {{"source_name":"publisher or official body","title":"article title",
     "description":"what the source confirms","url":"full https URL",
     "published_at":"YYYY-MM-DD or empty string"}}
 ],
 "evidence_summary": "short factual summary",
 "reason": "why this action was chosen"
}}
For update_month, include at least two independent source URLs, including at least one
official/government source such as APP, Radio Pakistan, or a government domain. Include
only URLs you actually found in the grounded search results. No markdown or code fences.
"""

    request_body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent?key=" + urllib.parse.quote(api_key)
    )
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        return stop("needs_review", f"Gemini API request failed: {exc}")

    try:
        candidate = payload["candidates"][0]
        response_text = "".join(p.get("text", "") for p in candidate["content"]["parts"])
        proposal = json.loads(response_text)
        grounding = candidate.get("groundingMetadata", {})
        grounded_urls = {
            item.get("web", {}).get("uri", "")
            for item in grounding.get("groundingChunks", [])
            if item.get("web", {}).get("uri")
        }
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        return stop("needs_review", f"Gemini response was missing valid structured data: {exc}")

    action = proposal.get("action")
    common = {
        "pakistan_date": today.isoformat(),
        "elapsed_days": elapsed,
        "research_phase": "forced_test" if force_research else "intensified",
        "test_mode": force_research,
        "hijri_year": current_year,
        "month_number": next_month,
        "month_name": MONTH_NAMES[next_month],
        "proposal": proposal,
        "grounded_urls": sorted(grounded_urls),
    }
    if action == "no_change":
        return stop("no_change", proposal.get("reason", "No confirmed announcement found."), **common)
    if action != "update_month":
        return stop("needs_review", proposal.get("reason", "Agent flagged this for review."), **common)

    # Validate all key fields independently of the model's decision.
    try:
        start = date.fromisoformat(proposal["gregorian_start_date"])
        gap = (start - last_start).days
        if int(proposal["hijri_year"]) != current_year:
            raise ValueError("Hijri year does not match the next pending month.")
        if int(proposal["month_number"]) != next_month:
            raise ValueError("Proposed month number is not the next sequential month.")
        if proposal["month_name"] != MONTH_NAMES[next_month]:
            raise ValueError("Proposed month name does not match the repository's month list.")
        if gap not in (29, 30):
            raise ValueError(f"Month-start interval is {gap} days, not 29 or 30.")
        if not (today.fromordinal(today.toordinal() - 1) <= start <= today.fromordinal(today.toordinal() + 2)):
            raise ValueError("Proposed start date is outside the allowed date window.")
        if proposal.get("status") != "verified" or proposal.get("confidence") != "high":
            raise ValueError("Automatic PR requires verified status and high confidence.")
        sources = proposal.get("sources", [])
        if len(sources) < 2:
            raise ValueError("At least two independent sources are required.")
        for source in sources:
            url = source.get("url", "")
            if not url.startswith("https://") or not trusted(url):
                raise ValueError(f"Source URL is not HTTPS or not on the trusted-domain allowlist: {url}")
            if url not in grounded_urls:
                raise ValueError(f"Source URL was not present in Gemini's grounded citations: {url}")
            if not source.get("source_name") or not source.get("description"):
                raise ValueError("A source is missing its name or evidence description.")
        if not any(official(source["url"]) for source in sources):
            raise ValueError("No official/government source was supplied.")
    except (ValueError, TypeError, KeyError) as exc:
        return stop("needs_review", f"Proposed update failed safety validation: {exc}", **common)

    if force_research:
        return stop(
            "test_complete",
            "Gemini research and all automatic-update safety checks passed in test mode; no repository files were changed.",
            **common,
            validation="passed",
            proposed_start_date=start.isoformat(),
        )

    target.update({
        "gregorian_start_date": start.isoformat(),
        "status": "verified",
        "confidence": "high",
        "sources": [{
            key: source[key]
            for key in ("source_name", "title", "description", "url", "published_at")
            if key in source and source[key] is not None
        } for source in sources],
        "notes": proposal.get("evidence_summary", ""),
    })
    year_path.write_text(json.dumps(year_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    latest.update({
        "hijri_year": current_year,
        "month": next_month,
        "month_name": MONTH_NAMES[next_month],
        "month_start": start.isoformat(),
        "status": "verified",
        "confidence": "high",
        "updated_at": today.isoformat(),
        "source": f"data/{current_year}.json",
        "notes": proposal.get("evidence_summary", ""),
    })
    LATEST_PATH.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return stop(
        "update_month",
        "A source-backed month update passed validation; the workflow will open a pull request, not push directly to main.",
        **common,
        changed_files=[f"data/{current_year}.json", "data/latest.json"],
    )


if __name__ == "__main__":
    sys.exit(main())
