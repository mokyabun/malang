import { z } from 'zod'

export const POCKET_RISU_PROFILE_OPTION = '__pocketRisuProfile'

export const PocketRisuProfileEnumOptionSchema = z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string(),
})

export const PocketRisuProfileFieldSchema = z
    .object({
        key: z.string().min(1).max(200),
        type: z.enum(['string', 'number', 'integer', 'boolean', 'stringArray', 'json']),
        label: z.string().min(1).max(200),
        description: z.string().max(10_000).optional(),
        descriptionI18n: z.record(z.string(), z.string()).optional(),
        required: z.boolean().optional(),
        secret: z.boolean().optional(),
        default: z.unknown().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        enum: z.array(PocketRisuProfileEnumOptionSchema).optional(),
        mapsTo: z
            .object({
                target: z.enum(['auth', 'custom', 'body', 'header']),
                path: z.string().min(1).max(500),
            })
            .optional(),
    })
    .loose()

export const PocketRisuProfileUiSchema = z
    .object({
        groups: z
            .array(
                z
                    .object({
                        id: z.string().min(1).max(200),
                        label: z.string().min(1).max(200),
                        order: z.number().optional(),
                        labelI18n: z.record(z.string(), z.string()).optional(),
                    })
                    .loose(),
            )
            .default([]),
        fields: z
            .array(
                z
                    .object({
                        key: z.string().min(1).max(200),
                        widget: z.string().max(100).optional(),
                        visibility: z.enum(['basic', 'advanced']).default('basic'),
                        group: z.string().max(200).optional(),
                        order: z.number().optional(),
                        placeholder: z.string().max(1_000).optional(),
                    })
                    .loose(),
            )
            .default([]),
    })
    .loose()

export const PocketRisuModelProfileSchema = z
    .object({
        id: z.string().min(1).max(500),
        updatedAt: z.number().optional(),
        displayName: z.string().min(1).max(200),
        providerBaseId: z.string().min(1).max(200),
        profileStatus: z.string().max(100).optional(),
        modelId: z.string().min(1).max(512),
        endpoint: z.object({ kind: z.string().min(1).max(200) }).loose(),
        auth: z
            .object({
                kind: z.string().min(1).max(200),
                fields: z.array(z.string().max(200)).default([]),
            })
            .loose(),
        defaults: z.record(z.string(), z.unknown()).default({}),
        schema: z.array(PocketRisuProfileFieldSchema).default([]),
        uiSchema: PocketRisuProfileUiSchema.default({ groups: [], fields: [] }),
        headerTemplate: z.record(z.string(), z.string()).optional(),
        capabilities: z.array(z.string().max(100)).default([]),
        limits: z.record(z.string(), z.unknown()).optional(),
        recommendedTokenizer: z.string().max(100).optional(),
        sourceUrls: z.array(z.url()).default([]),
    })
    .loose()

export const PocketRisuModelProfileEnvelopeSchema = z
    .object({
        schemaVersion: z.literal(1),
        exportedAt: z.number().optional(),
        profile: PocketRisuModelProfileSchema,
        baseProvider: z
            .object({
                id: z.string().min(1).max(200),
                displayName: z.string().min(1).max(200),
                adapterKind: z.string().min(1).max(200),
                authKinds: z.array(z.string().max(200)).default([]),
                endpointKinds: z.array(z.string().max(200)).default([]),
                requestSchema: z.array(z.unknown()).default([]),
                uiSchema: PocketRisuProfileUiSchema.default({ groups: [], fields: [] }),
                sourceUrls: z.array(z.url()).default([]),
            })
            .loose(),
    })
    .loose()

export const PocketRisuProfileBindingSchema = z.object({
    envelope: PocketRisuModelProfileEnvelopeSchema,
    values: z.record(z.string(), z.unknown()).default({}),
})
