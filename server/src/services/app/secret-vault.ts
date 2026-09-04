import { z } from 'zod'

import type { Store } from '@/db'
import { ValidationError } from '@/errors/app-error'

const iterations = 600_000
const additionalData = new TextEncoder().encode('malang:provider-api-key:v1')
const SecretEnvelopeSchema = z.object({
    version: z.literal(1),
    algorithm: z.literal('AES-256-GCM'),
    iv: z.string(),
    ciphertext: z.string(),
})

type SecretEnvelope = z.infer<typeof SecretEnvelopeSchema>

export class SecretVaultLockedError extends ValidationError {
    constructor() {
        super(
            'Encrypted provider credentials are locked; sign out and sign in again to unlock them',
        )
        this.name = 'SecretVaultLockedError'
    }
}

export class SecretVaultCorruptedError extends Error {
    constructor() {
        super('The encrypted provider credentials could not be decrypted')
        this.name = 'SecretVaultCorruptedError'
    }
}

export interface SecretRotation {
    key: CryptoKey
    salt: string
    providerSecret: string | null
}

export class SecretVault {
    private key: CryptoKey | null = null

    constructor(private readonly store: Store) {}

    isLocked(): boolean {
        return this.hasSecret() && !this.key
    }

    hasSecret(): boolean {
        return this.store.secretStorage.get().providerSecret !== null
    }

    async unlock(password: string): Promise<void> {
        const storage = this.store.secretStorage.get()
        const salt = storage.salt ?? encode(randomBytes(16))
        if (!storage.salt) {
            this.store.secretStorage.setSalt(salt)
        }

        const key = await deriveKey(password, decode(salt))
        if (storage.providerSecret) await decrypt(storage.providerSecret, key)
        this.key = key
    }

    async get(): Promise<string | null> {
        const secret = this.store.secretStorage.get().providerSecret
        if (!secret) return null
        if (!this.key) throw new SecretVaultLockedError()
        return decrypt(secret, this.key)
    }

    async set(value: string): Promise<void> {
        if (!this.key) throw new SecretVaultLockedError()
        this.store.secretStorage.setSecret(await encrypt(value, this.key))
    }

    clear(): void {
        this.store.secretStorage.setSecret(null)
    }

    async prepareRotation(currentPassword: string, newPassword: string): Promise<SecretRotation> {
        const storage = this.store.secretStorage.get()
        const oldSalt = storage.salt
        let value: string | null = null
        if (storage.providerSecret) {
            if (!oldSalt) throw new SecretVaultCorruptedError()
            value = await decrypt(
                storage.providerSecret,
                await deriveKey(currentPassword, decode(oldSalt)),
            )
        }

        const saltBytes = randomBytes(16)
        const key = await deriveKey(newPassword, saltBytes)
        return {
            key,
            salt: encode(saltBytes),
            providerSecret: value === null ? null : await encrypt(value, key),
        }
    }

    completeRotation(rotation: SecretRotation): void {
        this.key = rotation.key
    }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

async function encrypt(value: string, key: CryptoKey): Promise<string> {
    const iv = randomBytes(12)
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData },
        key,
        new TextEncoder().encode(value),
    )
    const envelope: SecretEnvelope = {
        version: 1,
        algorithm: 'AES-256-GCM',
        iv: encode(iv),
        ciphertext: encode(new Uint8Array(ciphertext)),
    }
    return JSON.stringify(envelope)
}

async function decrypt(value: string, key: CryptoKey): Promise<string> {
    try {
        const envelope = SecretEnvelopeSchema.parse(JSON.parse(value))
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: decode(envelope.iv), additionalData },
            key,
            decode(envelope.ciphertext),
        )
        return new TextDecoder().decode(plaintext)
    } catch {
        throw new SecretVaultCorruptedError()
    }
}

function randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length))
}

function encode(value: Uint8Array): string {
    return Buffer.from(value).toString('base64url')
}

function decode(value: string): Uint8Array {
    return new Uint8Array(Buffer.from(value, 'base64url'))
}
