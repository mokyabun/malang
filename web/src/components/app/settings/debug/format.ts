export function formatTimestamp(value: string) {
    return new Intl.DateTimeFormat('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date(value))
}

export function chainPhaseLabel(phase: 'pre' | 'post') {
    return phase === 'pre' ? '사전 처리' : '후처리'
}
