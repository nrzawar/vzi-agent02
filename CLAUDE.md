# CLAUDE.md: context for Claude Code

## What this is
Prototype of **Agent 02 (document drafting)** for the VZI AI Safety engagement (Zensar for Vedanta Zinc International).
Scope of this demo: **Gamsberg SOPs only**. Users are mining staff, not technical: keep the UI tap-based, plain-language, minimal typing.

## Key design decisions (keep these)
- **Document as data.** Each section is JSON `blocks`; Word is only a render target. Never let the LLM write docx XML.
- Block types: `paragraph`, `subheading`, `bullets`, `steps`, `warning`, `table` (see `backend/app/llm.py` BLOCK_SCHEMA_TEXT and `clean_blocks`).
- **Template config drives everything**: `backend/templates/gamsberg_sop.json` (sections, instructions, hazards, departments, roles). The template's own bracketed author instructions are reused as section prompts.
- **Renderer** (`render_docx.py`) fills Word content controls by tag (`VZI_DocNo`, `txtStatus`, ...), removes SharePoint data bindings, deletes the example body between "Purpose Scope and Users" and "Validity and Document Management", and inserts sections by cloning the template's numbered paragraphs (numId 8: ilvl 0 heading, 1 sub-heading, 2 step) so numbering matches real SOPs (1., 1.1, 1.1.1). Definitions and Annexures fill fixed slots. Hazards grid is the template table with ticks.
- Users can add custom sections (no instruction or a one-line "what should it cover").
- Upload of an existing SOP: text extracted (pypdf / python-docx), passed to every section prompt as primary source; user can keep the uploaded SOP's own section layout (frontend `matchSection` synonym map).
- Demo mode when `GEMINI_API_KEY` is missing.

## Rules
- Do not invent legal section numbers; Legal Compliance items end with "[verify]".
- Status is always "Draft"; nothing is ever published. Human checks each section ("I have checked this").
- No real VZI data to Gemini until approved. Production LLM target: Microsoft Foundry (Azure). Keep `llm.py` the only place that talks to a model so it can be swapped.
- No em dashes in client-facing text.

## Planned next steps
1. Retrieval: index Gamsberg SOPs per canonical section (Azure AI Search) and pass retrieved evidence with citations into `draft_section`.
2. Legal register lookup instead of model knowledge for Legal Compliance.
3. IBRA input feeding Procedure, Controls and the hazards grid.
4. Process map image from procedure steps.
5. Second template (BMM).

## Commands
- Run: `./start.sh` (venv + uvicorn on :8000, serves `frontend/dist`)
- UI dev: `cd frontend && npm run dev` (port 5173, proxies /api)
- Rebuild UI: `cd frontend && npm run build`

Background docs live in the claude.ai Project "VZI AI Safety": `claude/agent02_drafting_plan.md`, `claude/agent02_sop_build_spec.md`, `claude/product_architecture.md`.
