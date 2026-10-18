import { useEffect, useMemo, useState } from 'react'
import { downloadDocx, getJSON, postJSON, runPool, uploadFile } from './api.js'
import BlockEditor from './BlockEditor.jsx'
import { AutoTextarea, Chips, ChipsWithAdd, Icon, MicButton, Question, Spinner, TextField } from './ui.jsx'

const TEMPLATE_ID = 'gamsberg_sop'
const STORE_KEY = 'vzi-sop-draft-v1'
const STEPS = ['Start', 'About the job', 'Choose sections', 'Review the draft', 'Download']

const EMPTY_JOB = { title: '', department: '', area: '', equipment: [], frequency: '', roles: [], hazards: [], notes: '', existing_text: '', existing_name: '' }

// Map headings found in an uploaded SOP onto the template's standard sections.
const SYNONYMS = {
  definitions: ['definition', 'abbreviation', 'glossary'],
  purpose: ['purpose', 'aim', 'objective'],
  scope: ['scope', 'general', 'application'],
  process_map: ['process map', 'flow'],
  legal: ['legal', 'standards and rules', 'references', 'legislation', 'regulation'],
  raci: ['responsib', 'roles', 'people', 'raci'],
  procedure: ['procedure', 'process', 'task description', 'method', 'operation'],
  controls: ['controls', 'precaution', 'safety awareness', 'safety systems'],
  tools_ppe: ['ppe', 'tools', 'equipment', 'protective'],
  emergency: ['emergency'],
  communication: ['communication', 'distribution', 'access', 'records', 'reporting'],
  annexures: ['annex', 'append'],
}
const SKIP_HEADINGS = ['change history', 'validity', 'document management', 'violation', 'disclaimer', 'review and approval', 'table of contents', 'history of changes']

function matchSection(heading) {
  const h = heading.toLowerCase()
  for (const [id, words] of Object.entries(SYNONYMS)) if (words.some((w) => h.includes(w))) return id
  return null
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
  } catch {
    return null
  }
}

export default function App() {
  const saved = useMemo(load, [])
  const [tpl, setTpl] = useState(null)
  const [health, setHealth] = useState(null)
  const [step, setStep] = useState(saved?.step ?? 0)
  const [mode, setMode] = useState(saved?.mode ?? '')
  const [job, setJob] = useState(saved?.job ?? EMPTY_JOB)
  const [meta, setMeta] = useState(saved?.meta ?? {})
  const [sections, setSections] = useState(saved?.sections ?? null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    getJSON(`/api/templates/${TEMPLATE_ID}`).then(setTpl).catch((e) => setToast(e.message))
    getJSON('/api/health').then(setHealth).catch(() => {})
  }, [])

  // first load: build the default section list from the template
  useEffect(() => {
    if (tpl && !sections) setSections(defaultSections(tpl))
  }, [tpl, sections])

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ step, mode, job, meta, sections }))
    } catch {}
  }, [step, mode, job, meta, sections])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 6000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [step])

  const startOver = () => {
    if (!confirm('Start a new SOP? The current draft will be cleared.')) return
    setStep(0)
    setMode('')
    setJob(EMPTY_JOB)
    setMeta({})
    setSections(defaultSections(tpl))
  }

  if (!tpl || !sections) {
    return (
      <div className="loading">
        <Spinner /> Loading…
      </div>
    )
  }

  const canNext = [mode !== '' && (mode === 'new' || job.existing_text), job.title.trim().length > 2, sections.some((s) => s.on), true, false][step]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Icon name="helmet" size={22} />
          </div>
          <div>
            <div className="brand-title">SOP Drafting Assistant</div>
            <div className="brand-sub">{tpl.name} template</div>
          </div>
        </div>
        <div className="top-right">
          {health && (
            <span className={'mode ' + (health.mode === 'gemini' ? 'mode-live' : 'mode-demo')} title={health.model || ''}>
              {health.mode === 'gemini' ? 'AI connected' : 'Demo mode (no AI key)'}
            </span>
          )}
          <button className="btn btn-ghost" onClick={startOver}>
            New SOP
          </button>
        </div>
      </header>

      <Stepper step={step} setStep={setStep} maxStep={job.title ? 4 : step} />

      <main className="main">
        {step === 0 && <StartStep mode={mode} setMode={setMode} job={job} setJob={setJob} tpl={tpl} setSections={setSections} setToast={setToast} />}
        {step === 1 && <JobStep tpl={tpl} job={job} setJob={setJob} meta={meta} setMeta={setMeta} setToast={setToast} />}
        {step === 2 && <SectionsStep tpl={tpl} job={job} sections={sections} setSections={setSections} setToast={setToast} />}
        {step === 3 && <DraftStep tpl={tpl} job={job} sections={sections} setSections={setSections} setToast={setToast} />}
        {step === 4 && <DownloadStep tpl={tpl} job={job} meta={meta} sections={sections} setToast={setToast} setStep={setStep} />}
      </main>

      {step < 4 && (
        <footer className="navbar">
          <button className="btn btn-light btn-lg" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <Icon name="back" /> Back
          </button>
          <div className="nav-hint">{!canNext && step === 1 ? 'Tell us what the job is to continue' : ''}</div>
          <button className="btn btn-primary btn-lg" onClick={() => setStep(step + 1)} disabled={!canNext}>
            {step === 2 ? 'Write my draft' : step === 3 ? 'Go to download' : 'Next'} <Icon name="next" />
          </button>
        </footer>
      )}

      {toast && (
        <div className="toast" onClick={() => setToast('')}>
          <Icon name="warn" /> {toast}
        </div>
      )}
    </div>
  )
}

function defaultSections(tpl) {
  return tpl.sections.map((s) => ({ ...s, on: s.default_on !== false, blocks: [], status: 'empty', checked: false, history: [] }))
}

/* ------------------------------------------------------------------ stepper */
function Stepper({ step, setStep, maxStep }) {
  return (
    <nav className="stepper">
      {STEPS.map((s, i) => (
        <button key={s} className={'stp' + (i === step ? ' stp-on' : '') + (i < step ? ' stp-done' : '')} onClick={() => i <= maxStep && setStep(i)} disabled={i > maxStep}>
          <span className="stp-n">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
          <span className="stp-l">{s}</span>
        </button>
      ))}
    </nav>
  )
}

/* ------------------------------------------------------------------ step 1 */
function StartStep({ mode, setMode, job, setJob, tpl, setSections, setToast }) {
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState(null)

  const onFile = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const r = await uploadFile(file)
      const nextJob = { ...job, existing_text: r.text, existing_name: r.filename }
      let info = {}
      try {
        const s = await postJSON('/api/suggest', { template_id: TEMPLATE_ID, job: nextJob, kind: 'from_existing' })
        info = s.items?.[0] || {}
      } catch (e) {
        setToast('File read, but the AI could not summarise it: ' + e.message)
      }
      setJob({
        ...nextJob,
        title: info.title || nextJob.title || file.name.replace(/\.[^.]+$/, ''),
        equipment: info.equipment?.length ? info.equipment : nextJob.equipment,
        roles: info.roles?.length ? info.roles : nextJob.roles,
        frequency: info.frequency || nextJob.frequency,
        notes: info.notes || nextJob.notes,
      })
      setFound(info.sections || [])
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const keepOwnStructure = () => {
    const base = defaultSections(tpl)
    const used = new Set()
    const out = []
    for (const h of found || []) {
      if (SKIP_HEADINGS.some((k) => h.toLowerCase().includes(k))) continue
      const id = matchSection(h)
      if (id && !used.has(id)) {
        used.add(id)
        out.push({ ...base.find((s) => s.id === id), on: true })
      } else if (!id) {
        out.push(customSection(h))
      }
    }
    // keep the fixed template sections available but switched off if not in the uploaded SOP
    for (const s of base) if (!used.has(s.id)) out.push({ ...s, on: s.fixed ? s.on : false })
    setSections(out)
    setToast('Sections set to match your uploaded SOP. You can change them on step 3.')
  }

  return (
    <div className="stack">
      <h1>What would you like to do?</h1>
      <div className="tiles">
        <button className={'tile' + (mode === 'new' ? ' tile-on' : '')} onClick={() => setMode('new')}>
          <Icon name="pen" size={34} />
          <strong>Write a new SOP</strong>
          <span>Start from the Gamsberg template. Answer a few quick questions and the assistant writes the first draft.</span>
        </button>
        <button className={'tile' + (mode === 'update' ? ' tile-on' : '')} onClick={() => setMode('update')}>
          <Icon name="file" size={34} />
          <strong>Improve an existing SOP</strong>
          <span>Upload an old SOP (PDF or Word). The assistant rewrites it into the template and fills the gaps.</span>
        </button>
      </div>

      {mode === 'update' && (
        <div className="card">
          <label className={'drop' + (busy ? ' drop-busy' : '')}>
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => onFile(e.target.files?.[0])} hidden />
            {busy ? (
              <>
                <Spinner /> Reading your SOP…
              </>
            ) : job.existing_name ? (
              <>
                <Icon name="check" size={28} /> <strong>{job.existing_name}</strong>
                <span>Tap to choose a different file</span>
              </>
            ) : (
              <>
                <Icon name="upload" size={30} /> <strong>Tap to choose your SOP file</strong>
                <span>PDF or Word (.docx)</span>
              </>
            )}
          </label>
          {found && found.length > 0 && (
            <div className="found">
              <p>
                <strong>We found {found.length} sections in your SOP.</strong> How should the new draft be laid out?
              </p>
              <div className="row">
                <button className="btn btn-primary" onClick={() => setToast('Using the Gamsberg template layout.')}>
                  Use the Gamsberg template (recommended)
                </button>
                <button className="btn btn-light" onClick={keepOwnStructure}>
                  Keep my SOP's own layout
                </button>
              </div>
              <details>
                <summary>Show the sections we found</summary>
                <ol>
                  {found.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function customSection(title, why = '') {
  return {
    id: 'custom_' + Math.random().toString(36).slice(2, 8),
    label: title,
    heading: title,
    help: why || 'Your own section',
    instruction: '',
    custom: true,
    on: true,
    blocks: [],
    status: 'empty',
    checked: false,
    history: [],
  }
}

/* ------------------------------------------------------------------ step 2 */
function JobStep({ tpl, job, setJob, meta, setMeta, setToast }) {
  const set = (k) => (v) => setJob({ ...job, [k]: v })
  const dept = tpl.departments[job.department] || {}
  const [titles, setTitles] = useState([])
  const [busy, setBusy] = useState('')

  const suggestTitle = async () => {
    setBusy('title')
    try {
      setTitles((await postJSON('/api/suggest', { template_id: TEMPLATE_ID, job, kind: 'title' })).items)
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy('')
    }
  }
  const suggestHazards = async () => {
    setBusy('hazards')
    try {
      const items = (await postJSON('/api/suggest', { template_id: TEMPLATE_ID, job, kind: 'hazards' })).items
      setJob({ ...job, hazards: Array.from(new Set([...(job.hazards || []), ...items])) })
      if (!items.length) setToast('No extra hazards suggested.')
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <h1>Tell us about the job</h1>
      <p className="lead">Tap the options that fit. You can speak instead of typing by pressing the microphone.</p>

      <Question n="1" title="What job is this SOP for?" hint="For example: Replace the jaw liners on the primary crusher">
        <TextField value={job.title} onChange={set('title')} placeholder="Describe the job in a few words" big />
        <div className="row">
          <button className="btn btn-light" onClick={suggestTitle} disabled={!job.title.trim() || busy === 'title'}>
            {busy === 'title' ? <Spinner /> : <Icon name="spark" />} Suggest a proper SOP title
          </button>
        </div>
        {titles.length > 0 && (
          <div className="chips">
            {titles.map((t) => (
              <button key={t} className="chip chip-suggest" onClick={() => (setJob({ ...job, title: t }), setTitles([]))}>
                {t}
              </button>
            ))}
          </div>
        )}
      </Question>

      <Question n="2" title="Which department?">
        <Chips options={Object.keys(tpl.departments)} value={job.department} onChange={(v) => setJob({ ...job, department: v, area: '' })} />
      </Question>

      {job.department && (
        <Question n="3" title="Which area?">
          <Chips options={dept.areas || []} value={job.area} onChange={set('area')} />
          <input className="input input-sm" placeholder="Or type another area…" value={(dept.areas || []).includes(job.area) ? '' : job.area} onChange={(e) => set('area')(e.target.value)} />
        </Question>
      )}

      <Question n={job.department ? '4' : '3'} title="Which equipment or machines?" hint="Tap all that apply, or add your own">
        <ChipsWithAdd options={dept.equipment || []} value={job.equipment} onChange={set('equipment')} addLabel="Add equipment" />
      </Question>

      <Question title="How often is this job done?">
        <Chips options={tpl.frequencies} value={job.frequency} onChange={set('frequency')} />
      </Question>

      <Question title="Who does the work?" hint="Tap everyone involved">
        <ChipsWithAdd options={tpl.roles} value={job.roles} onChange={set('roles')} addLabel="Add a role" />
      </Question>

      <Question title="What are the main hazards?" hint="Tap the hazards and energies present. These are ticked on the hazards grid in the SOP.">
        <div className="row">
          <button className="btn btn-light" onClick={suggestHazards} disabled={!job.title.trim() || busy === 'hazards'}>
            {busy === 'hazards' ? <Spinner /> : <Icon name="spark" />} Let the assistant pick likely hazards
          </button>
        </div>
        <Chips options={tpl.hazards} value={job.hazards} onChange={set('hazards')} multi />
      </Question>

      <Question title="Anything else we should know?" optional hint="Special conditions, lessons from incidents, OEM requirements…">
        <TextField value={job.notes} onChange={set('notes')} placeholder="Type or speak" multiline />
      </Question>

      <details className="card details">
        <summary>
          Document details <span className="optional">optional, can be filled later</span>
        </summary>
        <div className="grid2">
          <Labeled label="Document number">
            <input className="input" value={meta.doc_no || ''} onChange={(e) => setMeta({ ...meta, doc_no: e.target.value })} placeholder="e.g. GMB-ENG-PLT-SOP-00XX" />
          </Labeled>
          <Labeled label="Version">
            <input className="input" value={meta.version || ''} onChange={(e) => setMeta({ ...meta, version: e.target.value })} placeholder="0" />
          </Labeled>
          <Labeled label="Content owner">
            <input className="input" value={meta.owner || ''} onChange={(e) => setMeta({ ...meta, owner: e.target.value })} placeholder="Name (Designation | GMB)" />
          </Labeled>
          <Labeled label="Content reviewer">
            <input className="input" value={meta.reviewer || ''} onChange={(e) => setMeta({ ...meta, reviewer: e.target.value })} placeholder="Name (Designation | GMB)" />
          </Labeled>
          <Labeled label="Content approver">
            <input className="input" value={meta.approver || ''} onChange={(e) => setMeta({ ...meta, approver: e.target.value })} placeholder="Name (Designation | GMB)" />
          </Labeled>
          <Labeled label="Head of Department (HOD)">
            <input className="input" value={meta.hod || ''} onChange={(e) => setMeta({ ...meta, hod: e.target.value })} />
          </Labeled>
          <Labeled label="Effective date">
            <input className="input" type="date" value={meta.effective_date || ''} onChange={(e) => setMeta({ ...meta, effective_date: e.target.value })} />
          </Labeled>
          <Labeled label="Review cycle">
            <Chips options={['1 Year', '2 Years', '3 Years']} value={meta.review_cycle || '2 Years'} onChange={(v) => setMeta({ ...meta, review_cycle: v })} />
          </Labeled>
        </div>
      </details>
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label className="labeled">
      <span>{label}</span>
      {children}
    </label>
  )
}

/* ------------------------------------------------------------------ step 3 */
function SectionsStep({ tpl, job, sections, setSections, setToast }) {
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [aiSugg, setAiSugg] = useState([])
  const [busy, setBusy] = useState(false)

  const toggle = (i) => setSections(sections.map((s, k) => (k === i ? { ...s, on: !s.on } : s)))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= sections.length || sections[j].fixed || sections[i].fixed) return
    const next = [...sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSections(next)
  }
  const remove = (i) => setSections(sections.filter((_, k) => k !== i))
  const add = (title, why = '') => {
    const t = title.trim()
    if (!t) return
    if (sections.some((s) => s.heading.toLowerCase() === t.toLowerCase())) {
      setToast(`"${t}" is already in the list.`)
      return
    }
    const s = customSection(t, why)
    if (about.trim()) s.instruction = about.trim()
    // insert before the fixed Annexures section at the end
    const annexIdx = sections.findIndex((x) => x.id === 'annexures')
    const next = [...sections]
    next.splice(annexIdx >= 0 ? annexIdx : next.length, 0, s)
    setSections(next)
    setName('')
    setAbout('')
    setAiSugg(aiSugg.filter((x) => x.title !== t))
  }
  const askAI = async () => {
    setBusy(true)
    try {
      const r = await postJSON('/api/suggest', { template_id: TEMPLATE_ID, job: { ...job, current_sections: sections.filter((s) => s.on).map((s) => s.heading) }, kind: 'sections' })
      setAiSugg(r.items)
      if (!r.items.length) setToast('The assistant thinks the list already covers this job well.')
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy(false)
    }
  }
  const unused = tpl.suggested_extra_sections.filter((t) => !sections.some((s) => s.heading.toLowerCase() === t.toLowerCase()))

  return (
    <div className="stack">
      <h1>Choose the sections</h1>
      <p className="lead">
        All standard sections are ticked. Untick any you do not need, use the arrows to change the order, or add your own at the bottom.
      </p>

      <div className="auto-note">
        <Icon name="lock" /> Added automatically to every SOP: {tpl.auto_sections.join(', ')}.
      </div>

      <div className="sec-list">
        {sections.map((s, i) => (
          <div key={s.id} className={'sec' + (s.on ? '' : ' sec-off')}>
            <button className={'tick' + (s.on ? ' tick-on' : '')} onClick={() => toggle(i)} aria-label={s.on ? 'Remove from SOP' : 'Include in SOP'}>
              {s.on && <Icon name="check" size={20} />}
            </button>
            <div className="sec-text" onClick={() => toggle(i)}>
              <strong>
                {s.label || s.heading} {s.custom && <span className="tag">your section</span>}
              </strong>
              <span>{s.help}</span>
            </div>
            <div className="sec-act">
              {s.fixed ? (
                <span className="fixed-note" title="This section has a fixed place in the template">fixed place</span>
              ) : (
                <>
                  <button className="icon-btn" onClick={() => move(i, -1)} title="Move up">
                    <Icon name="up" />
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} title="Move down">
                    <Icon name="down" />
                  </button>
                </>
              )}
              {s.custom && (
                <button className="icon-btn danger" onClick={() => remove(i)} title="Delete this section">
                  <Icon name="trash" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card add-sec">
        <h3>
          <Icon name="plus" /> Add a section that is not in the list
        </h3>
        <p className="hint">Tap a suggestion, or type your own.</p>
        <div className="chips">
          {unused.map((t) => (
            <button key={t} className="chip" onClick={() => add(t)}>
              <Icon name="plus" size={14} /> {t}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn btn-light" onClick={askAI} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="spark" />} Ask the assistant what is missing for this job
          </button>
        </div>
        {aiSugg.length > 0 && (
          <div className="ai-sugg">
            {aiSugg.map((x) => (
              <button key={x.title} className="sugg" onClick={() => add(x.title, x.why)}>
                <strong>
                  <Icon name="plus" size={14} /> {x.title}
                </strong>
                <span>{x.why}</span>
              </button>
            ))}
          </div>
        )}
        <div className="own">
          <TextField value={name} onChange={setName} placeholder="Section name, e.g. Conveyor Belt Tracking Checks" />
          <TextField value={about} onChange={setAbout} placeholder="What should it cover? (optional)" />
          <button className="btn btn-primary" onClick={() => add(name)} disabled={!name.trim()}>
            <Icon name="plus" /> Add my section
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ step 4 */
const QUICK = [
  { label: 'Rewrite', icon: 'refresh', text: 'Rewrite this section with fresh wording, keeping the same meaning and facts.' },
  { label: 'Shorter', icon: 'shrink', text: 'Make this section shorter and more to the point. Remove repetition.' },
  { label: 'More detail', icon: 'grow', text: 'Add more practical detail and any missing safety steps or controls.' },
  { label: 'Simpler words', icon: 'simple', text: 'Use simpler, plainer words that any worker on the mine can understand. Keep all safety content.' },
]

function DraftStep({ tpl, job, sections, setSections, setToast }) {
  const active = sections.filter((s) => s.on)
  const allTitles = active.map((s) => s.heading)
  const [running, setRunning] = useState(false)

  const patch = (id, p) => setSections((cur) => cur.map((s) => (s.id === id ? { ...s, ...(typeof p === 'function' ? p(s) : p) } : s)))

  const writeOne = async (s) => {
    patch(s.id, { status: 'writing', error: '' })
    try {
      const r = await postJSON('/api/draft-section', { template_id: TEMPLATE_ID, job, section: s, all_titles: allTitles })
      patch(s.id, (cur) => ({ status: 'ready', blocks: r.blocks, checked: false, history: cur.blocks.length ? [...cur.history, cur.blocks] : cur.history }))
    } catch (e) {
      patch(s.id, { status: 'error', error: e.message })
    }
  }

  const writeAll = async (onlyMissing = true) => {
    const todo = active.filter((s) => !onlyMissing || s.status !== 'ready')
    if (!todo.length) return
    setRunning(true)
    await runPool(todo, 3, writeOne)
    setRunning(false)
  }

  // start automatically the first time
  useEffect(() => {
    if (active.some((s) => s.status === 'empty' || s.status === 'writing')) writeAll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = active.filter((s) => s.status === 'ready').length
  const checked = active.filter((s) => s.checked).length

  return (
    <div className="draft-layout">
      <aside className="toc">
        <div className="toc-head">Sections</div>
        {active.map((s, i) => (
          <a key={s.id} href={'#sec-' + s.id} className="toc-item">
            <span className={'dot dot-' + (s.checked ? 'checked' : s.status)} />
            <span>
              {i + 1}. {s.label || s.heading}
            </span>
          </a>
        ))}
        <div className="toc-legend">
          <span>
            <span className="dot dot-ready" /> ready
          </span>
          <span>
            <span className="dot dot-checked" /> checked by you
          </span>
        </div>
      </aside>

      <div className="stack draft-main">
        <h1>Review the draft</h1>
        <div className="progress-card card">
          <div className="progress-text">
            {running ? (
              <>
                <Spinner /> Writing your SOP… {done} of {active.length} sections ready
              </>
            ) : (
              <>
                <strong>{done}</strong> of {active.length} sections written · <strong>{checked}</strong> checked by you
              </>
            )}
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(done / Math.max(active.length, 1)) * 100}%` }} />
          </div>
          <p className="hint">
            Everything here is written by AI and must be checked. Click any text to change it. Tick <em>I have checked this</em> when a section is correct.
          </p>
          {!running && done < active.length && (
            <button className="btn btn-primary" onClick={() => writeAll(true)}>
              Write the missing sections
            </button>
          )}
        </div>

        {active.map((s, i) => (
          <SectionCard key={s.id} n={i + 1} s={s} job={job} patch={patch} writeOne={writeOne} setToast={setToast} />
        ))}
      </div>
    </div>
  )
}

function SectionCard({ n, s, job, patch, writeOne, setToast }) {
  const [ask, setAsk] = useState('')
  const [showAsk, setShowAsk] = useState(false)
  const [busy, setBusy] = useState(false)

  const revise = async (instruction) => {
    setBusy(true)
    try {
      const r = await postJSON('/api/revise-section', { template_id: TEMPLATE_ID, job, section: s, instruction })
      patch(s.id, (cur) => ({ blocks: r.blocks, history: [...cur.history, cur.blocks], checked: false }))
      setAsk('')
      setShowAsk(false)
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy(false)
    }
  }
  const undo = () => patch(s.id, (cur) => ({ blocks: cur.history[cur.history.length - 1], history: cur.history.slice(0, -1) }))

  return (
    <section id={'sec-' + s.id} className={'sec-card card' + (s.checked ? ' sec-checked' : '')}>
      <div className="sec-card-head">
        <h2>
          <span className="sec-n">{n}</span> {s.heading}
        </h2>
        {s.status === 'ready' && (
          <label className={'checked-toggle' + (s.checked ? ' on' : '')}>
            <input type="checkbox" checked={!!s.checked} onChange={(e) => patch(s.id, { checked: e.target.checked })} />
            {s.checked ? 'Checked' : 'I have checked this'}
          </label>
        )}
      </div>

      {s.verify && s.status === 'ready' && (
        <div className="verify">
          <Icon name="warn" /> Check every legal reference against the VZI legal register before approval.
        </div>
      )}

      {s.status === 'writing' && (
        <div className="writing">
          <Spinner /> Writing this section…
        </div>
      )}
      {s.status === 'empty' && <div className="writing muted">Waiting to be written…</div>}
      {s.status === 'error' && (
        <div className="err">
          <Icon name="warn" /> {s.error || 'Could not write this section.'}
          <button className="btn btn-light" onClick={() => writeOne(s)}>
            Try again
          </button>
        </div>
      )}

      {s.status === 'ready' && (
        <>
          <div className={busy ? 'dim' : ''}>
            <BlockEditor blocks={s.blocks} onChange={(b) => patch(s.id, { blocks: b, checked: false })} />
          </div>
          <div className="quick">
            <span className="quick-label">Ask the assistant:</span>
            {QUICK.map((q) => (
              <button key={q.label} className="btn btn-chip" disabled={busy} onClick={() => revise(q.text)}>
                <Icon name={q.icon} size={15} /> {q.label}
              </button>
            ))}
            <button className="btn btn-chip" disabled={busy} onClick={() => setShowAsk(!showAsk)}>
              <Icon name="pen" size={15} /> Change something…
            </button>
            {s.history.length > 0 && (
              <button className="btn btn-chip" disabled={busy} onClick={undo}>
                <Icon name="undo" size={15} /> Undo
              </button>
            )}
            {busy && <Spinner />}
          </div>
          {showAsk && (
            <div className="ask">
              <AutoTextarea className="input" value={ask} onChange={setAsk} placeholder="e.g. Add a step to barricade the area before starting" minRows={2} />
              <div className="row">
                <MicButton onText={(t) => setAsk(ask ? ask + ' ' + t : t)} />
                <button className="btn btn-primary" disabled={!ask.trim() || busy} onClick={() => revise(ask)}>
                  Apply change
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ step 5 */
function DownloadStep({ tpl, job, meta, sections, setToast, setStep }) {
  const active = sections.filter((s) => s.on)
  const ready = active.filter((s) => s.status === 'ready')
  const unchecked = ready.filter((s) => !s.checked)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      await downloadDocx({ template_id: TEMPLATE_ID, job, meta: { ...meta, title: job.title }, sections: ready })
    } catch (e) {
      setToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack narrow">
      <h1>Download your draft</h1>
      <div className="card summary">
        <div className="sum-title">{job.title}</div>
        <div className="sum-grid">
          <div>
            <span>Template</span>
            {tpl.name}
          </div>
          <div>
            <span>Department</span>
            {job.department || '-'}
          </div>
          <div>
            <span>Sections</span>
            {ready.length} written
          </div>
          <div>
            <span>Checked by you</span>
            {ready.length - unchecked.length} of {ready.length}
          </div>
        </div>
      </div>

      {unchecked.length > 0 && (
        <div className="verify">
          <Icon name="warn" /> {unchecked.length} section{unchecked.length > 1 ? 's have' : ' has'} not been checked yet: {unchecked.map((s) => s.label || s.heading).join(', ')}.
          <button className="link-btn" onClick={() => setStep(3)}>
            Go back and check
          </button>
        </div>
      )}
      {ready.length < active.length && <div className="verify">Some sections are not written yet and will be left out.</div>}

      <button className="btn btn-primary btn-xl" onClick={go} disabled={busy || !ready.length}>
        {busy ? <Spinner /> : <Icon name="download" size={22} />} Download Word document
      </button>
      <p className="hint center">
        The file uses the Gamsberg SOP template with status <strong>Draft</strong>. Word may ask to update the table of contents when you open it: choose <strong>Yes</strong>.
        <br />
        This draft must still go through the normal review and approval process.
      </p>
    </div>
  )
}
