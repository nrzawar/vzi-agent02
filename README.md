# SOP Drafting Assistant (VZI Agent 02 demo)

## What this agent is

**Agent 02 (document drafting)** is part of the VZI AI Safety engagement (Zensar for
Vedanta Zinc International). It helps mining staff draft a **Gamsberg Standard Operating
Procedure (SOP)** without needing to be technical or type much:

1. The user answers a few tap-based questions about the job (department, area, equipment, roles, hazards).
2. They pick which SOP sections to include, or add their own.
3. The AI writes a draft of each section, which the user edits and checks one by one.
4. The app produces a Word file in the real Gamsberg SOP template, with correct numbering,
   hazards grid, definitions and annexures, and status always set to **Draft**.

Users can also upload an existing SOP (PDF or Word). Its text is used as the main source
for every section, and the user can keep that SOP's own section layout.

How it is built:
- **Document as data.** Each section is stored as structured JSON blocks (paragraph,
  sub-heading, bullets, steps, warning, table). Word is only the output format; the AI
  never writes Word XML.
- **Template config drives everything.** `backend/templates/gamsberg_sop.json` holds the
  sections, author instructions, hazards, departments and roles.
- **Human in the loop.** Nothing is published. Every section needs an "I have checked this"
  tick. Legal Compliance items end with "[verify]" and no legal section numbers are invented.
- **Swappable model.** `backend/app/llm.py` is the only file that talks to an LLM. The demo
  uses Google Gemini; the production target is Microsoft Foundry (Azure).

Scope of this demo: Gamsberg SOPs only.

## Run it

### Requirements
- Python 3.10 or newer: https://www.python.org/downloads/
- A Gemini API key (optional). Without one the app runs in **Demo mode** with placeholder text.
- Node.js is **not** needed: a prebuilt UI ships in `frontend/dist`.

### Quick start (Mac / Linux)

```bash
git clone https://github.com/nrzawar/vzi-agent02.git
cd vzi-agent02
cp .env.example .env          # then paste your key: GEMINI_API_KEY=your-key-here
./start.sh
```

The browser opens at http://localhost:8000. The first run takes about a minute to set up.

On a Mac you can also double-click **Start SOP Assistant.command**. If macOS blocks it:
right-click it, choose Open, then Open again.

Optional settings:
- `PORT=9000 ./start.sh` to use a different port.
- `REBUILD_UI=1 ./start.sh` to rebuild the frontend first (needs Node.js).
- `GEMINI_MODEL` in `.env` to pick the model (default `gemini-2.5-flash`).

### Manual start (any OS, including Windows)

```bash
python -m venv .venv
# Mac/Linux:  source .venv/bin/activate
# Windows:    .venv\Scripts\activate
pip install -r backend/requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
cd backend
uvicorn app.main:app --port 8000
```

Then open http://localhost:8000.

## How it works

| Step | What the user does |
|---|---|
| 1. Start | New SOP, or upload an old SOP (PDF/Word) to rewrite it |
| 2. About the job | Taps department, area, equipment, roles, hazards. Mic button for speech |
| 3. Choose sections | Template sections pre-ticked; untick, reorder, or add their own |
| 4. Review the draft | AI writes each section; edit inline; quick buttons (Rewrite, Shorter, More detail, Simpler words, Change something) |
| 5. Download | Word file in the Gamsberg template, status Draft |

## Project layout

```
backend/
  app/main.py          FastAPI routes (also serves the built frontend)
  app/llm.py           Gemini prompts + demo mode (only place that calls a model)
  app/render_docx.py   Fills the real Gamsberg Word template
  templates/gamsberg_sop.json   Section list, hazards, departments (the "template config")
  templates/gamsberg_sop.docx   The Gamsberg SOP master
frontend/              React (Vite). Prebuilt into frontend/dist
start.sh               One-command start (venv + uvicorn on :8000)
```

## Developing the UI

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173, proxies /api to :8000
npm run build                                  # rebuild frontend/dist
```

Run the backend (`./start.sh`) at the same time so the dev UI has an API to talk to.

## Adding another template (e.g. BMM)
Add `templates/bmm_sop.json` + `templates/bmm_sop.docx` with the same structure.
The renderer currently expects Gamsberg-style anchors ("Purpose Scope and Users",
"Validity and Document Management"); see `render_docx.py`.

## Planned next steps
1. Retrieval: index Gamsberg SOPs per section (Azure AI Search) and pass cited evidence into drafting.
2. Legal register lookup instead of model knowledge for Legal Compliance.
3. IBRA input feeding Procedure, Controls and the hazards grid.
4. Process map image from procedure steps.
5. Second template (BMM).

## Important
- Demo only. Content is AI-generated with no source documents yet; every section must be checked.
- Do not paste real VZI documents into the Gemini version until data use is approved.
  Production target is Microsoft Foundry in VZI's Azure tenancy.
- Never commit your `.env` file (it is in `.gitignore`).
