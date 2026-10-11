'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, WifiOff, Building2 } from 'lucide-react'
import clsx from 'clsx'
import { fetchHealth, fetchHospitals, type NetworkHospital } from '@/lib/api'
import { connection, selectedHospital, selectHospital } from '@/lib/hospital'
import type { HealthResponse } from '@/types'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [time, setTime] = useState(new Date())
  const [loading, setLoading] = useState(false)
  const [hospitals, setHospitals] = useState<NetworkHospital[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [offline, setOffline] = useState(connection.get())

  useEffect(() => connection.subscribe(setOffline), [])
  useEffect(() => {
    fetchHospitals()
      .then((list) => { setHospitals(list); setCurrent(selectedHospital() ?? list[0]?.key ?? null) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const poll = async () => {
      const h = await fetchHealth()
      setHealth(h)
    }
    poll()
    const healthInterval = setInterval(poll, 15000)
    const timeInterval = setInterval(() => setTime(new Date()), 1000)
    return () => {
      clearInterval(healthInterval)
      clearInterval(timeInterval)
    }
  }, [])

  const handleRefresh = async () => {
    setLoading(true)
    const h = await fetchHealth()
    setHealth(h)
    setTimeout(() => setLoading(false), 600)
  }

  const statusColor =
    health?.status === 'healthy'
      ? 'text-status-ok'
      : health?.status === 'degraded'
      ? 'text-status-warn'
      : 'text-status-critical'

  const StatusIcon =
    health?.status === 'healthy' ? CheckCircle2 : health ? AlertTriangle : WifiOff

  return (
    <header className="h-14 border-b border-surface-border bg-surface-1/80 backdrop-blur-sm sticky top-0 z-30 flex items-center px-6 gap-6">
      {/* Title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-text-primary truncate">{title}</h1>
          {subtitle && (
            <span suppressHydrationWarning className="text-xs text-text-muted hidden sm:block">{subtitle}</span>
          )}
        </div>
      </div>

      {/* Sahhanito: Grand Tunis hospital shown by every page */}
      {hospitals.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <Building2 className="w-3.5 h-3.5 text-brand-cyan" />
          <select
            value={current ?? ''}
            onChange={(e) => selectHospital(e.target.value)}
            className="max-w-[260px] px-2 py-1.5 rounded-md text-xs bg-surface-3 border border-surface-border text-text-primary focus:border-brand-cyan/50 focus:outline-none"
            aria-label="Hospital"
          >
            {hospitals.map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}
          </select>
        </label>
      )}
      {offline && (
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-status-critical/10 border border-status-critical/30 text-status-critical text-[11px] font-semibold">
          <WifiOff className="w-3.5 h-3.5" /> Simulator unreachable: demo data shown
        </span>
      )}

      {/* Actions */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}

      {/* System status */}
      <div className="flex items-center gap-4 border-l border-surface-border pl-4">
        {/* Time */}
        <div className="flex items-center gap-1.5 text-text-muted">
          <Clock className="w-3.5 h-3.5" />
          <span suppressHydrationWarning className="text-xs font-mono tabular-nums">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        {/* Backend health */}
        <div className="flex items-center gap-1.5">
          {health ? (
            <StatusIcon className={clsx('w-3.5 h-3.5', statusColor)} />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-text-muted" />
          )}
          <span className={clsx('text-xs font-medium hidden sm:block', statusColor)}>
            {health?.status ?? 'connecting'}
          </span>
        </div>


        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>
    </header>
  )
}
