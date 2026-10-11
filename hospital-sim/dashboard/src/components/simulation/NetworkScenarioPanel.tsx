'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, RotateCcw, Trash2, Zap, Siren } from 'lucide-react'
import clsx from 'clsx'
import { Panel, SectionHeader } from '@/components/shared/MetricCard'
import { networkCall, type NetworkScenario } from '@/lib/api'

/**
 * Sahhanito: scenario controls of the whole Grand Tunis network. Every change goes to the engines the
 * triage platform reads, so referrals and the patient app react to it (beds, waits, closures, outages).
 */

type Kind = 'surge' | 'shortage' | 'outage' | 'closed' | 'holds'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'surge', label: 'Surge of arrivals' },
  { value: 'shortage', label: 'Staff shortage' },
  { value: 'outage', label: 'Equipment outage' },
  { value: 'closed', label: 'Stop receiving patients' },
  { value: 'holds', label: 'Beds occupied at once' },
]
const EQUIPMENT = ['CT', 'MRI', 'CATH_LAB', 'DIALYSIS']
const SPEEDS = [1, 6, 15, 30, 60]

const input = 'px-2 py-1.5 rounded-md text-xs bg-surface-3 border border-surface-border text-text-primary focus:border-brand-cyan/50 focus:outline-none'
const chip = (active: boolean) => clsx('px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
  active ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30' : 'bg-surface-3 text-text-secondary border-surface-border hover:text-text-primary')

function describe(e: { kind: string; factor?: number; fraction?: number; equipment?: string; beds?: number }) {
  if (e.kind === 'surge') return `Surge ×${e.factor}`
  if (e.kind === 'shortage') return `Staff −${Math.round((e.fraction ?? 0) * 100)} %`
  if (e.kind === 'outage') return `${e.equipment} down`
  if (e.kind === 'closed') return 'Not receiving'
  if (e.kind === 'holds') return `${e.beds} bed(s) held`
  return e.kind
}

export function NetworkScenarioPanel({ hospitalKey, onChange }: { hospitalKey: string | null; onChange?: (s: NetworkScenario) => void }) {
  const [scenario, setScenario] = useState<NetworkScenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<Kind>('surge')
  const [target, setTarget] = useState<'selected' | 'all'>('selected')
  const [minutes, setMinutes] = useState(240)
  const [factor, setFactor] = useState(3)
  const [fraction, setFraction] = useState(40)
  const [equipment, setEquipment] = useState('CT')
  const [beds, setBeds] = useState(5)

  const apply = useCallback((s: NetworkScenario) => { setScenario(s); onChange?.(s) }, [onChange])

  const run = useCallback(async (method: string, path: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      apply(await networkCall(method, path, body))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [apply])

  useEffect(() => {
    const load = () => networkCall('GET', '').then(apply).catch((e) => setError((e as Error).message))
    load()
    const timer = setInterval(load, 10_000)   // the clock keeps running: refresh events and log
    return () => clearInterval(timer)
  }, [apply])

  const addEvent = () => run('POST', '/events', {
    kind,
    hospitals: target === 'all' || !hospitalKey ? 'all' : [hospitalKey],
    minutes,
    factor,
    fraction: fraction / 100,
    equipment,
    beds,
  })

  const active = (scenario?.hospitals ?? []).filter((h) => h.events.length > 0)

  return (
    <Panel>
      <SectionHeader
        title="Grand Tunis scenario"
        subtitle="Applies to the engines Sahhanito reads: referrals and the patient app react"
        className="mb-4"
        actions={
          <button onClick={() => run('POST', '/reset')} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-3 border border-surface-border text-text-secondary hover:text-text-primary disabled:opacity-40">
            <RotateCcw className="w-3.5 h-3.5" /> Reset network
          </button>
        }
      />

      {error && <div className="mb-3 p-2 rounded-md bg-status-critical/10 border border-status-critical/30 text-status-critical text-xs">{error}</div>}

      {/* Clock */}
      <div className="space-y-2 mb-4">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Network clock</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => run('PUT', '', { paused: !scenario?.paused })} disabled={busy || !scenario}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all',
              scenario?.paused ? 'bg-status-ok/10 text-status-ok border-status-ok/30' : 'bg-status-warn/10 text-status-warn border-status-warn/30')}>
            {scenario?.paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
          </button>
          {SPEEDS.map((v) => (
            <button key={v} onClick={() => run('PUT', '', { speed: v })} disabled={busy} className={chip(scenario?.speed === v)}>
              ×{v}
            </button>
          ))}
          <label className="flex items-center gap-1.5 ml-2 text-xs text-text-secondary">
            <input type="checkbox" checked={scenario?.autoOutages ?? true} onChange={(e) => run('PUT', '', { autoOutages: e.target.checked })} />
            Random equipment outages
          </label>
        </div>
        <p className="text-[10px] text-text-muted">
          ×{scenario?.speed ?? '?'} = {scenario?.speed ?? '?'} simulated minutes per real minute. ×1 is real time; above ×15 hospitals fill up within minutes.
        </p>
      </div>

      {/* Presets */}
      <div className="space-y-2 mb-4">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Presets</div>
        <div className="flex flex-wrap gap-1.5">
          {(scenario?.presets ?? []).map((p) => (
            <button key={p.id} onClick={() => run('POST', `/preset/${p.id}`)} disabled={busy} className={chip(false)}>
              <Siren className="inline w-3 h-3 mr-1" />{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom event */}
      <div className="space-y-2 mb-4 pt-4 border-t border-surface-border">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Add an event</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] text-text-muted">Event</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={clsx(input, 'w-full')}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-text-muted">Where</span>
            <select value={target} onChange={(e) => setTarget(e.target.value as 'selected' | 'all')} className={clsx(input, 'w-full')}>
              <option value="selected">Selected hospital</option>
              <option value="all">Whole network</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-text-muted">Duration (simulated min)</span>
            <input type="number" min={5} max={10080} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={clsx(input, 'w-full font-mono')} />
          </label>
          {kind === 'surge' && (
            <label className="space-y-1">
              <span className="text-[10px] text-text-muted">Arrivals × (1.2–10)</span>
              <input type="number" min={1.2} max={10} step={0.1} value={factor} onChange={(e) => setFactor(Number(e.target.value))} className={clsx(input, 'w-full font-mono')} />
            </label>
          )}
          {kind === 'shortage' && (
            <label className="space-y-1">
              <span className="text-[10px] text-text-muted">Staff absent (%)</span>
              <input type="number" min={10} max={90} value={fraction} onChange={(e) => setFraction(Number(e.target.value))} className={clsx(input, 'w-full font-mono')} />
            </label>
          )}
          {kind === 'outage' && (
            <label className="space-y-1">
              <span className="text-[10px] text-text-muted">Equipment</span>
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={clsx(input, 'w-full')}>
                {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
          {kind === 'holds' && (
            <label className="space-y-1">
              <span className="text-[10px] text-text-muted">Beds (1–50)</span>
              <input type="number" min={1} max={50} value={beds} onChange={(e) => setBeds(Number(e.target.value))} className={clsx(input, 'w-full font-mono')} />
            </label>
          )}
        </div>
        <button onClick={addEvent} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan text-sm font-semibold hover:bg-brand-cyan/20 disabled:opacity-40">
          <Zap className="w-4 h-4" /> Apply event
        </button>
      </div>

      {/* Active events */}
      <div className="space-y-2 pt-4 border-t border-surface-border">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">Active events</div>
          {active.length > 0 && (
            <button onClick={() => run('DELETE', '/events')} disabled={busy} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-status-critical">
              <Trash2 className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        {active.length === 0 && <p className="text-xs text-text-muted">None.</p>}
        {active.map((h) => (
          <div key={h.key} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={clsx('font-medium', h.key === hospitalKey ? 'text-brand-cyan' : 'text-text-primary')}>{h.name}</span>
            {h.events.map((e, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-status-warn/10 border border-status-warn/30 text-status-warn text-[11px]">
                {describe(e)} · {Math.max(0, e.remainingMinutes)} min
              </span>
            ))}
            <button onClick={() => run('DELETE', `/events?hospital=${encodeURIComponent(h.key)}`)} disabled={busy}
              className="text-text-muted hover:text-status-critical" aria-label={`Clear events of ${h.name}`}>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {(scenario?.log.length ?? 0) > 0 && (
          <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
            {scenario!.log.slice(0, 12).map((l, i) => (
              <div key={i} className="text-[11px] font-mono text-text-muted">
                [{new Date(l.at).toLocaleTimeString()}] {l.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
