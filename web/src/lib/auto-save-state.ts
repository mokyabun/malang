import { atom } from 'jotai'

export type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface AutoSaveReport {
    state: AutoSaveState
    error: string
    updatedAt: number
}

export const autoSaveReportsAtom = atom<Record<string, AutoSaveReport>>({})

export const autoSaveStatusAtom = atom((get) => {
    const reports = Object.values(get(autoSaveReportsAtom))
    const priority: Record<AutoSaveState, number> = {
        idle: 0,
        saved: 1,
        pending: 2,
        saving: 3,
        error: 4,
    }
    return (
        reports.sort(
            (left, right) =>
                priority[right.state] - priority[left.state] || right.updatedAt - left.updatedAt,
        )[0] ?? null
    )
})
