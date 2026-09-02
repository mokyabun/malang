import type { Message } from '@malang/shared'

export function relativeTime(value: string): string {
    const difference = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(difference / 60_000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
}

export function formatClock(value: string): string {
    return new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

export function statusLabel(status: Message['status']): string {
    if (status === 'streaming') return '작성 중'
    if (status === 'cancelled') return '중단됨'
    if (status === 'failed') return '실패'
    return '완료'
}
