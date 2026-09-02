import type { AppSettings, RequestDebugRecord } from '@malang/shared'
import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'

export type RequestDebugSectionProps = {
    settings: AppSettings | null
    onSettingsChange: (settings: AppSettings) => void
}

export function useRequestDebug({ settings, onSettingsChange }: RequestDebugSectionProps) {
    const [requests, setRequests] = useState<RequestDebugRecord[]>([])
    const [selectedId, setSelectedId] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState<'object' | 'body' | null>(null)
    const [clearOpen, setClearOpen] = useState(false)
    const selected = requests.find((request) => request.id === selectedId) || requests[0] || null
    const refresh = useCallback(async () => {
        try {
            const result = await api.requestDebugHistory()
            setRequests(result.requests)
            setSelectedId((current) =>
                result.requests.some((request) => request.id === current)
                    ? current
                    : result.requests[0]?.id || '',
            )
            setError('')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '요청 이력을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => {
        queueMicrotask(() => void refresh())
    }, [refresh])
    useEffect(() => {
        if (!settings?.requestDebugEnabled) return
        const timer = window.setInterval(() => void refresh(), 4_000)
        return () => window.clearInterval(timer)
    }, [refresh, settings?.requestDebugEnabled])
    async function toggleDebug(enabled: boolean) {
        try {
            onSettingsChange(await api.updateSettings({ requestDebugEnabled: enabled }))
            setError('')
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : '요청 디버그 설정을 저장하지 못했습니다.',
            )
        }
    }
    async function clearHistory() {
        try {
            await api.clearRequestDebugHistory()
            setRequests([])
            setSelectedId('')
            setError('')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '요청 이력을 비우지 못했습니다.')
        } finally {
            setClearOpen(false)
        }
    }
    async function copy(kind: 'object' | 'body') {
        if (!selected) return
        const text =
            kind === 'object'
                ? `const providerRequest = ${JSON.stringify(selected.request, null, 2)}\n`
                : JSON.stringify(selected.request.body, null, 2)
        try {
            await navigator.clipboard.writeText(text)
            setCopied(kind)
            setError('')
            window.setTimeout(
                () => setCopied((current) => (current === kind ? null : current)),
                1600,
            )
        } catch {
            setError('클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.')
        }
    }
    return {
        requests,
        setSelectedId,
        loading,
        error,
        copied,
        clearOpen,
        setClearOpen,
        selected,
        refresh,
        toggleDebug,
        clearHistory,
        copy,
    }
}
