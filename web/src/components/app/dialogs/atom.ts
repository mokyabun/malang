import { atom } from 'jotai'

export interface AppConfirmation {
    title: string
    description: string
    confirmLabel: string
    action: () => void | Promise<void>
}

export const confirmationAtom = atom<AppConfirmation | null>(null)
