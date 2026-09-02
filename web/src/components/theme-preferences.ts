export const CHAT_APPEARANCE_DEFAULTS = {
    fontSize: 16,
    maxWidth: 1024,
    quickSettingsButton: true,
} as const

export const CHAT_APPEARANCE_LIMITS = {
    fontSize: { min: 13, max: 22, step: 1 },
    maxWidth: { min: 560, max: 1440, step: 16 },
} as const
