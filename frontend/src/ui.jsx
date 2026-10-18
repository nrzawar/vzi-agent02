import { useEffect, useRef, useState } from 'react'

/* ---------------- speech to text (Chrome, Edge, Safari) ---------------- */
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export function MicButton({ onText, label = 'Speak' }) {
  const [on, setOn] = useState(false)
  const rec = useRef(null)
  if (!SR) return null
  const toggle = () => {
    if (on) {
      rec.current?.stop()
      return
    }
    const r = new SR()
    r.lang = 'en-ZA'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '))
    r.onend = () => setOn(false)
    r.onerror = () => setOn(false)
    rec.current = r
    r.start()
    setOn(true)
  }
  return (
    <button type="button" className={'mic' + (on ? ' mic-on' : '')} onClick={toggle} title={on ? 'Stop' : 'Speak instead of typing'}>
      <Icon name="mic" /> <span>{on ? 'Listening… tap to stop' : label}</span>
    </button>
  )
}

/* ---------------- text input with mic ---------------- */
export function TextField({ value, onChange, placeholder, multiline, big }) {
  const append = (t) => onChange(value ? value.trim() + ' ' + t : t)
  return (
    <div className="field">
      {multiline ? (
        <AutoTextarea className={'input' + (big ? ' input-big' : '')} value={value} onChange={onChange} placeholder={placeholder} minRows={2} />
      ) : (
        <input className={'input' + (big ? ' input-big' : '')} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      <MicButton onText={append} />
    </div>
  )
}

export function AutoTextarea({ value, onChange, className = '', minRows = 1, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={ref} rows={minRows} className={'autota ' + className} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}

/* ---------------- chips ---------------- */
export function Chips({ options, value, onChange, multi = false }) {
  const isOn = (o) => (multi ? (value || []).includes(o) : value === o)
  const click = (o) => {
    if (multi) {
      const v = value || []
      onChange(v.includes(o) ? v.filter((x) => x !== o) : [...v, o])
    } else onChange(value === o ? '' : o)
  }
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={'chip' + (isOn(o) ? ' chip-on' : '')} onClick={() => click(o)}>
          {isOn(o) && <Icon name="check" />} {o}
        </button>
      ))}
    </div>
  )
}

/* chips plus "add your own" */
export function ChipsWithAdd({ options, value, onChange, addLabel = 'Add another' }) {
  const [draft, setDraft] = useState('')
  const all = Array.from(new Set([...(options || []), ...(value || [])]))
  const add = (t) => {
    const s = (t ?? draft).trim()
    if (!s) return
    if (!(value || []).includes(s)) onChange([...(value || []), s])
    setDraft('')
  }
  return (
    <div>
      <Chips options={all} value={value} onChange={onChange} multi />
      <div className="add-row">
        <input className="input input-sm" value={draft} placeholder={addLabel + '…'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="btn btn-light" onClick={() => add()} disabled={!draft.trim()}>
          <Icon name="plus" /> Add
        </button>
        <MicButton onText={(t) => add(t)} label="" />
      </div>
    </div>
  )
}

export function Question({ n, title, hint, children, optional }) {
  return (
    <section className="question">
      <div className="q-head">
        {n && <span className="q-num">{n}</span>}
        <div>
          <h3>
            {title} {optional && <span className="optional">optional</span>}
          </h3>
          {hint && <p className="hint">{hint}</p>}
        </div>
      </div>
      <div className="q-body">{children}</div>
    </section>
  )
}

export function Spinner() {
  return <span className="spinner" aria-label="working" />
}

/* ---------------- icons (inline SVG, no dependencies) ---------------- */
const PATHS = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  check: 'M5 12l5 5L20 7',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  back: 'M19 12H5M11 6l-6 6 6 6',
  next: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  grow: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  simple: 'M4 6h16M4 12h10M4 18h7',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M12 8v.5M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  helmet: 'M3 17h18M5 17a7 7 0 0 1 14 0M12 10V6',
}
export function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] || PATHS.info} />
    </svg>
  )
}
