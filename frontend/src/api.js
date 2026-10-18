async function handle(res) {
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`
    try {
      const j = await res.json()
      if (j.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {}
    throw new Error(msg)
  }
  return res
}

export async function getJSON(url) {
  return (await handle(await fetch(url))).json()
}

export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await handle(res)).json()
}

export async function uploadFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return (await handle(await fetch('/api/extract', { method: 'POST', body: fd }))).json()
}

export async function downloadDocx(body) {
  const res = await handle(
    await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = cd.match(/filename="([^"]+)"/)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = m ? m[1] : 'SOP draft.docx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// Run async jobs with limited parallelism.
export async function runPool(items, limit, worker) {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
}
