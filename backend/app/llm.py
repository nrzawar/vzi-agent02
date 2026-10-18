"""LLM layer. Uses Google Gemini when GEMINI_API_KEY is set, otherwise a demo mode
that returns clearly marked placeholder text so the UI can be tried without a key.

Every call returns plain Python data (dicts / lists) validated against the block schema.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

BLOCK_TYPES = {"paragraph", "subheading", "bullets", "steps", "table", "warning"}

BLOCK_SCHEMA_TEXT = """
Return JSON only, in this exact shape:
{"blocks": [ BLOCK, BLOCK, ... ]}
where each BLOCK is one of:
  {"type": "paragraph",  "text": "..."}
  {"type": "subheading", "text": "..."}
  {"type": "bullets",    "items": ["...", "..."]}
  {"type": "steps",      "items": ["...", "..."]}          (numbered steps, one action each)
  {"type": "warning",    "text": "DANGER - ..." }          (or "CAUTION - ...")
  {"type": "table",      "columns": ["..",".."], "rows": [["..",".."], ...]}   (every row has len(columns) cells)
"""

STYLE_RULES = """
Writing rules:
- Audience: mine workers, artisans and supervisors. Use short, plain sentences. Avoid jargon unless it is standard on a mine.
- South African mining context and terminology (permit to work, lockout, pre-use inspection, PTO, IBRA, SHE).
- Imperative voice for steps ("Inspect the ...", "Ensure ...").
- Do not invent people's names, phone numbers or document numbers. Use placeholders like [Emergency number] or [Doc number] instead.
- No markdown symbols (no **, no #). Plain text inside JSON strings.
"""


class LLMError(Exception):
    pass


def _model_name() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def is_live() -> bool:
    return bool(os.getenv("GEMINI_API_KEY", "").strip())


_client = None


def _client_get():
    global _client
    if _client is None:
        from google import genai  # imported lazily so demo mode needs no key

        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].strip())
    return _client


def _call_json(prompt: str, temperature: float = 0.4) -> Any:
    from google.genai import types

    client = _client_get()
    last_err = None
    for _ in range(2):
        try:
            resp = client.models.generate_content(
                model=_model_name(),
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                ),
            )
            text = (resp.text or "").strip()
            text = re.sub(r"^```(?:json)?|```$", "", text).strip()
            return json.loads(text)
        except Exception as e:  # retry once on bad JSON / transient error
            last_err = e
    raise LLMError(f"Gemini call failed: {last_err}")


# ---------------------------------------------------------------- validation

def clean_blocks(raw: Any) -> list[dict]:
    if isinstance(raw, dict):
        raw = raw.get("blocks", [])
    out: list[dict] = []
    for b in raw or []:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t not in BLOCK_TYPES:
            continue
        if t in ("paragraph", "subheading", "warning"):
            txt = str(b.get("text", "")).strip()
            if txt:
                out.append({"type": t, "text": txt})
        elif t in ("bullets", "steps"):
            items = [str(i).strip() for i in b.get("items", []) if str(i).strip()]
            if items:
                out.append({"type": t, "items": items})
        elif t == "table":
            cols = [str(c).strip() for c in b.get("columns", [])]
            if not cols:
                continue
            rows = []
            for r in b.get("rows", []):
                if not isinstance(r, list):
                    continue
                r = [str(c).strip() for c in r][: len(cols)]
                r += [""] * (len(cols) - len(r))
                rows.append(r)
            out.append({"type": "table", "columns": cols, "rows": rows})
    return out


# ---------------------------------------------------------------- prompts

def _job_text(job: dict) -> str:
    lines = [
        f"Activity / SOP title: {job.get('title') or '(not given)'}",
        f"Department: {job.get('department') or '-'}",
        f"Area: {job.get('area') or '-'}",
        f"Equipment: {', '.join(job.get('equipment') or []) or '-'}",
        f"How often: {job.get('frequency') or '-'}",
        f"People involved: {', '.join(job.get('roles') or []) or '-'}",
        f"Main hazards: {', '.join(job.get('hazards') or []) or '-'}",
    ]
    if job.get("notes"):
        lines.append(f"Extra notes from the author: {job['notes']}")
    return "\n".join(lines)


def _existing_text(job: dict) -> str:
    ex = (job.get("existing_text") or "").strip()
    if not ex:
        return ""
    return (
        "\nAn EXISTING SOP for this activity was uploaded. Use it as the primary source: keep its real "
        "steps, roles, equipment and controls, rewrite them into this section's format, and only add "
        "what is clearly missing.\n----- EXISTING SOP (extract) -----\n" + ex[:40000] + "\n----- END -----\n"
    )


def draft_section(template: dict, job: dict, section: dict, all_titles: list[str]) -> list[dict]:
    if not is_live():
        return demo_section(job, section)
    prompt = f"""You are a senior Safety, Health and Environment (SHE) practitioner drafting a Standard Operating Procedure.

Site context: {template['context']}

THE JOB:
{_job_text(job)}
{_existing_text(job)}
All sections in this SOP (in order): {', '.join(all_titles)}
Write ONLY the section: "{section['heading']}". Do not repeat content that clearly belongs in another section.

Section instruction: {section.get('instruction') or 'Write appropriate content for a section with this title in a mining SOP. ' + (section.get('help') or '')}
{STYLE_RULES}
{BLOCK_SCHEMA_TEXT}"""
    blocks = clean_blocks(_call_json(prompt))
    if not blocks:
        raise LLMError("The AI returned an empty section. Please try again.")
    return blocks


def revise_section(template: dict, job: dict, section: dict, blocks: list[dict], instruction: str) -> list[dict]:
    if not is_live():
        return demo_revise(blocks, instruction)
    prompt = f"""You are a senior SHE practitioner editing one section of a mining Standard Operating Procedure.

Site context: {template['context']}

THE JOB:
{_job_text(job)}
{_existing_text(job)}
Section: "{section['heading']}"
Section purpose: {section.get('instruction') or section.get('help') or ''}

CURRENT CONTENT (JSON):
{json.dumps({'blocks': blocks}, ensure_ascii=False)}

CHANGE REQUESTED BY THE USER: {instruction}

Apply the change and return the full updated section. Keep everything the user did not ask to change.
{STYLE_RULES}
{BLOCK_SCHEMA_TEXT}"""
    out = clean_blocks(_call_json(prompt, temperature=0.3))
    if not out:
        raise LLMError("The AI returned an empty section. Please try again.")
    return out


def suggest(template: dict, job: dict, kind: str) -> list:
    if kind == "hazards":
        options = template["hazards"]
        if not is_live():
            return demo_hazards(job, options)
        prompt = f"""Site context: {template['context']}
THE JOB:\n{_job_text(job)}\n{_existing_text(job)[:6000]}
From this fixed list of hazard / energy categories, pick the ones that clearly apply to this job:
{json.dumps(options)}
Return JSON: {{"items": [exact names from the list]}}"""
        items = _call_json(prompt, 0.2).get("items", [])
        return [i for i in items if i in options]

    if kind == "sections":
        current = job.get("current_sections") or []
        if not is_live():
            return [{"title": "Permit Requirements", "why": "Demo suggestion"},
                    {"title": "Training and Competency", "why": "Demo suggestion"}]
        prompt = f"""Site context: {template['context']}
THE JOB:\n{_job_text(job)}
The SOP already has these sections: {json.dumps(current)}
Suggest 2 to 5 EXTRA sections that a good mining SOP for this specific job should have and that are not already covered.
Return JSON: {{"items": [{{"title": "short section title", "why": "one short reason"}}]}}"""
        items = _call_json(prompt, 0.4).get("items", [])
        return [i for i in items if isinstance(i, dict) and i.get("title")][:5]

    if kind == "title":
        if not is_live():
            return ["GMB " + (job.get("title") or "Task") + " Procedure"]
        prompt = f"""THE JOB:\n{_job_text(job)}
Suggest 3 clear SOP titles in the Gamsberg style, e.g. "GMB Welding Procedure", "GMB Crusher Replace and Installation of the Jaw Liners".
Return JSON: {{"items": ["...", "...", "..."]}}"""
        return [str(i) for i in _call_json(prompt, 0.5).get("items", [])][:3]

    if kind == "from_existing":
        # Read an uploaded SOP and pre-fill the job form.
        if not is_live():
            return [{"title": job.get("title") or "Uploaded SOP", "notes": "Demo mode: details not extracted."}]
        prompt = f"""Read this existing SOP and extract details for a new draft.
{_existing_text(job)}
Return JSON: {{"items": [{{"title": "SOP title without doc number", "equipment": ["..."], "roles": ["..."], "frequency": "", "notes": "one sentence summary of the task", "sections": ["the section headings used in this SOP, in order"]}}]}}"""
        return _call_json(prompt, 0.2).get("items", [])[:1]

    raise LLMError(f"Unknown suggestion type: {kind}")


# ---------------------------------------------------------------- demo mode

def demo_section(job: dict, section: dict) -> list[dict]:
    t = job.get("title") or "this task"
    tag = "[Demo text - add a Gemini API key for real drafting]"
    sid = section.get("id", "")
    if sid == "definitions":
        return [{"type": "table", "columns": ["Word / Phrase / Abbreviation", "Definition"],
                 "rows": [["PPE", "Personal Protective Equipment"], ["PTW", "Permit to Work"],
                          ["IBRA", "Issue Based Risk Assessment"], ["SHE", "Safety, Health and Environment"]]}]
    if sid == "process_map":
        return [{"type": "table", "columns": ["Stage", "What happens", "Who"],
                 "rows": [["Plan the job", "Work order, permit and risk assessment", "Supervisor"],
                          ["Isolate", "Isolate and lock out energy sources", "Artisan"],
                          ["Do the work", f"Carry out {t}", "Artisan"],
                          ["Close out", "Remove locks, test and hand back", "Supervisor"]]}]
    if sid == "raci":
        return [{"type": "paragraph", "text": f"Roles for {t}. {tag}"},
                {"type": "table", "columns": ["Activity", "Supervisor", "Artisan", "Safety Officer"],
                 "rows": [["Issue permit", "RA", "I", "C"], ["Isolate equipment", "A", "R", "I"], ["Do the work", "A", "R", "C"]]},
                {"type": "paragraph", "text": "R = Responsible, A = Accountable, C = Consult, I = Inform."}]
    if sid == "procedure":
        return [{"type": "subheading", "text": "Preparation and planning"},
                {"type": "steps", "items": ["Obtain a work order.", "Complete the permit to work.", "Complete the risk assessment."]},
                {"type": "subheading", "text": "Task execution"},
                {"type": "steps", "items": [f"Carry out {t} as trained.", "Keep the area barricaded."]},
                {"type": "warning", "text": "DANGER - Never work on equipment that is not isolated and locked out."},
                {"type": "subheading", "text": "Post operational tasks"},
                {"type": "steps", "items": ["Clean the work area.", "Remove locks and hand back the permit."]},
                {"type": "paragraph", "text": tag}]
    if sid == "controls":
        return [{"type": "bullets", "items": ["Barricade the work area.", "Use only inspected tools.", tag]},
                {"type": "subheading", "text": "List of Do's and Don'ts"},
                {"type": "table", "columns": ["I will never", "I will always"],
                 "rows": [["Work without a permit", "Wear the correct PPE"], ["Bypass a safety device", "Stop work if unsafe"]]}]
    if sid == "tools_ppe":
        return [{"type": "table", "columns": ["PPE", "Equipment", "Materials"],
                 "rows": [["Hard hat", "Mobile radio", "Cleaning rags"], ["Safety glasses", "Torch", "Spill kit"], ["Safety boots", "", ""]]}]
    if sid == "emergency":
        return [{"type": "table", "columns": ["Emergency", "What to do"],
                 "rows": [["Injury", "Stop work, call [Emergency number], give first aid if trained."], ["Fire", "Raise the alarm, use extinguisher if safe, evacuate."]]}]
    return [{"type": "paragraph", "text": f"{section.get('heading')} for {t}. {tag}"},
            {"type": "bullets", "items": ["First point", "Second point", "Third point"]}]


def demo_revise(blocks: list[dict], instruction: str) -> list[dict]:
    return blocks + [{"type": "paragraph", "text": f"[Demo] Change requested: {instruction}"}]


def demo_hazards(job: dict, options: list[str]) -> list[str]:
    picks = ["Mechanical (Fixed)", "Gravitational (Objects)", "Noise", "Personal / Behaviour"]
    text = " ".join([job.get("title") or ""] + (job.get("equipment") or [])).lower()
    if any(w in text for w in ("electric", "mcc", "wiring", "transformer")):
        picks.append("Electrical")
    if any(w in text for w in ("weld", "cut", "hot")):
        picks.append("Fire")
    return [p for p in picks if p in options]
