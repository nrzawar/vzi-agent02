import { AutoTextarea, Icon } from './ui.jsx'

/* Editable view of a section's content blocks.
   Block types: paragraph, subheading, warning, bullets, steps, table */
export default function BlockEditor({ blocks, onChange }) {
  const set = (i, b) => onChange(blocks.map((x, k) => (k === i ? b : x)))
  const remove = (i) => onChange(blocks.filter((_, k) => k !== i))

  let stepNo = 0
  return (
    <div className="blocks">
      {blocks.map((b, i) => {
        if (b.type === 'subheading') stepNo = 0
        const start = stepNo
        if (b.type === 'steps') stepNo += b.items.length
        return (
          <div key={i} className={'block block-' + b.type}>
            <BlockBody b={b} set={(nb) => set(i, nb)} start={start} />
            <button className="block-del" title="Remove this part" onClick={() => remove(i)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )
      })}
      <AddBlock onAdd={(b) => onChange([...blocks, b])} />
    </div>
  )
}

function BlockBody({ b, set, start }) {
  switch (b.type) {
    case 'subheading':
      return <AutoTextarea className="ed ed-sub" value={b.text} onChange={(t) => set({ ...b, text: t })} />
    case 'paragraph':
      return <AutoTextarea className="ed" value={b.text} onChange={(t) => set({ ...b, text: t })} />
    case 'warning':
      return (
        <div className="warnbox">
          <Icon name="warn" />
          <AutoTextarea className="ed ed-warn" value={b.text} onChange={(t) => set({ ...b, text: t })} />
        </div>
      )
    case 'bullets':
    case 'steps':
      return <ListEd b={b} set={set} start={start} />
    case 'table':
      return <TableEd b={b} set={set} />
    default:
      return null
  }
}

function ListEd({ b, set, start }) {
  const items = b.items
  const upd = (i, t) => set({ ...b, items: items.map((x, k) => (k === i ? t : x)) })
  const del = (i) => set({ ...b, items: items.filter((_, k) => k !== i) })
  const add = () => set({ ...b, items: [...items, ''] })
  return (
    <div className="list-ed">
      {items.map((it, i) => (
        <div className="li" key={i}>
          <span className="li-mark">{b.type === 'steps' ? start + i + 1 + '.' : '•'}</span>
          <AutoTextarea className="ed" value={it} onChange={(t) => upd(i, t)} />
          <button className="mini-x" title="Remove line" onClick={() => del(i)}>
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
      <button className="link-btn" onClick={add}>
        <Icon name="plus" size={14} /> Add {b.type === 'steps' ? 'a step' : 'a point'}
      </button>
    </div>
  )
}

function TableEd({ b, set }) {
  const cols = b.columns
  const rows = b.rows
  const updCell = (r, c, t) => set({ ...b, rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? t : x)) : row)) })
  const updCol = (c, t) => set({ ...b, columns: cols.map((x, j) => (j === c ? t : x)) })
  const addRow = () => set({ ...b, rows: [...rows, cols.map(() => '')] })
  const delRow = (r) => set({ ...b, rows: rows.filter((_, i) => i !== r) })
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {cols.map((c, j) => (
              <th key={j}>
                <AutoTextarea className="ed ed-th" value={c} onChange={(t) => updCol(j, t)} />
              </th>
            ))}
            <th className="tbl-act" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <AutoTextarea className="ed" value={cell} onChange={(t) => updCell(i, j, t)} />
                </td>
              ))}
              <td className="tbl-act">
                <button className="mini-x" title="Remove row" onClick={() => delRow(i)}>
                  <Icon name="x" size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="link-btn" onClick={addRow}>
        <Icon name="plus" size={14} /> Add a row
      </button>
    </div>
  )
}

function AddBlock({ onAdd }) {
  return (
    <div className="add-block">
      <span>Add:</span>
      <button className="link-btn" onClick={() => onAdd({ type: 'paragraph', text: '' })}>Text</button>
      <button className="link-btn" onClick={() => onAdd({ type: 'steps', items: [''] })}>Steps</button>
      <button className="link-btn" onClick={() => onAdd({ type: 'bullets', items: [''] })}>Points</button>
      <button className="link-btn" onClick={() => onAdd({ type: 'warning', text: 'DANGER - ' })}>Danger note</button>
      <button className="link-btn" onClick={() => onAdd({ type: 'table', columns: ['Column 1', 'Column 2'], rows: [['', '']] })}>Table</button>
    </div>
  )
}
