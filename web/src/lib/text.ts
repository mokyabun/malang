export function initials(value: string): string {
    return value.trim().slice(0, 2).toLocaleUpperCase() || '?'
}
