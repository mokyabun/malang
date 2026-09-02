import type {
    ProviderApiFormat,
    ProviderKind,
    ProviderSettings,
    ProviderSettingsInput,
} from '@malang/shared'
import { type ChangeEvent, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { providers } from './provider-catalog'

export type ProviderSectionProps = {
    provider: ProviderSettings | null
    onSaved: (provider: ProviderSettings) => void
}

export function useProviderSettings({ provider, onSaved }: ProviderSectionProps) {
    const initial = providers.find((item) => item.id === provider?.provider) || providers[0]!
    const [providerKind, setProviderKind] = useState<ProviderKind>(initial.id)
    const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || initial.baseUrl || '')
    const [modelId, setModelId] = useState(provider?.modelId || initial.model)
    const [auxiliaryModelId, setAuxiliaryModelId] = useState(provider?.auxiliaryModelId || '')
    const [apiFormat, setApiFormat] = useState<ProviderApiFormat>(
        provider?.apiFormat || 'openai-chat',
    )
    const [apiKey, setApiKey] = useState('')
    const [projectId, setProjectId] = useState(
        provider?.provider === 'vertex' ? provider.projectId : '',
    )
    const [location, setLocation] = useState(
        provider?.provider === 'vertex' ? provider.location : 'global',
    )
    const [credentialType, setCredentialType] = useState<'adc' | 'apiKey' | 'serviceAccount'>(
        provider?.provider === 'vertex' &&
            ['adc', 'apiKey', 'serviceAccount'].includes(provider.credentialType)
            ? (provider.credentialType as 'adc' | 'apiKey' | 'serviceAccount')
            : 'adc',
    )
    const [serviceAccountJson, setServiceAccountJson] = useState('')
    const [serviceAccountFile, setServiceAccountFile] = useState('')
    const [region, setRegion] = useState(
        provider?.provider === 'aws' ? provider.region : 'us-east-1',
    )
    const [accessKeyId, setAccessKeyId] = useState(
        provider?.provider === 'aws' ? provider.accessKeyId || '' : '',
    )
    const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
    const [awsSessionToken, setAwsSessionToken] = useState('')
    const [clearCredentials, setClearCredentials] = useState(false)
    const [providerOptions, setProviderOptions] = useState(
        JSON.stringify(provider?.providerOptions || {}, null, 2),
    )
    const [temperature, setTemperature] = useState(String(provider?.defaults.temperature ?? 0.8))
    const [maxOutputTokens, setMaxOutputTokens] = useState(
        String(provider?.defaults.maxOutputTokens ?? 2048),
    )
    const [providerTab, setProviderTab] = useState<'connection' | 'parameters' | 'advanced'>(
        'connection',
    )
    const [message, setMessage] = useState<{
        tone: 'success' | 'error'
        text: string
    } | null>(null)
    const selected = providers.find((item) => item.id === providerKind) || initial
    const draft = useMemo(
        () => ({
            providerKind,
            baseUrl,
            modelId,
            auxiliaryModelId,
            apiFormat,
            apiKey,
            projectId,
            location,
            credentialType,
            serviceAccountJson,
            region,
            accessKeyId,
            awsSecretAccessKey,
            awsSessionToken,
            clearCredentials,
            providerOptions,
            temperature,
            maxOutputTokens,
        }),
        [
            providerKind,
            baseUrl,
            modelId,
            auxiliaryModelId,
            apiFormat,
            apiKey,
            projectId,
            location,
            credentialType,
            serviceAccountJson,
            region,
            accessKeyId,
            awsSecretAccessKey,
            awsSessionToken,
            clearCredentials,
            providerOptions,
            temperature,
            maxOutputTokens,
        ],
    )
    function providerInput(value = draft): ProviderSettingsInput {
        const meta = providers.find((item) => item.id === value.providerKind) || selected
        let options: Record<string, unknown> = {}
        try {
            options = JSON.parse(value.providerOptions || '{}') as Record<string, unknown>
        } catch {
            throw new Error('Provider options가 올바른 JSON이 아닙니다.')
        }
        const common = {
            provider: value.providerKind,
            modelId: value.modelId,
            auxiliaryModelId: value.auxiliaryModelId || undefined,
            defaults: {
                temperature: Number(value.temperature),
                maxOutputTokens: Number(value.maxOutputTokens),
            },
            ...(value.baseUrl ? { baseUrl: value.baseUrl } : {}),
            ...(meta.formats ? { apiFormat: value.apiFormat } : {}),
            providerOptions: options,
            ...(value.apiKey.trim() ? { apiKey: value.apiKey.trim() } : {}),
            clearApiKey: false,
            clearCredentials: value.clearCredentials,
        }
        if (value.providerKind === 'vertex')
            return {
                ...common,
                provider: 'vertex',
                projectId: value.projectId,
                location: value.location,
                credentialType: value.credentialType,
                ...(value.serviceAccountJson
                    ? { serviceAccountJson: value.serviceAccountJson }
                    : {}),
            }
        if (value.providerKind === 'aws')
            return {
                ...common,
                provider: 'aws',
                region: value.region,
                accessKeyId: value.accessKeyId || undefined,
                ...(value.awsSecretAccessKey
                    ? { awsSecretAccessKey: value.awsSecretAccessKey }
                    : {}),
                ...(value.awsSessionToken ? { awsSessionToken: value.awsSessionToken } : {}),
            }
        return common as ProviderSettingsInput
    }
    const canSave =
        Boolean(modelId.trim()) &&
        Boolean(temperature) &&
        Boolean(maxOutputTokens) &&
        (!['ollama', 'kobold', 'ooba', 'mancer', 'openai-compatible'].includes(providerKind) ||
            Boolean(baseUrl.trim()))
    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            const saved = await api.updateProvider(providerInput(next))
            onSaved(saved)
            setApiKey('')
            setServiceAccountJson('')
            setAwsSecretAccessKey('')
            setAwsSessionToken('')
            setClearCredentials(false)
            setMessage({ tone: 'success', text: '설정을 자동 저장했습니다.' })
        },
        { enabled: canSave },
    )
    function chooseProvider(id: ProviderKind) {
        const meta = providers.find((item) => item.id === id)!
        setProviderKind(id)
        setBaseUrl(meta.baseUrl || '')
        setModelId(meta.model)
        setApiFormat(meta.formats?.[0] || 'openai-chat')
        setMessage(null)
    }
    async function handleServiceAccount(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
            const value = await file.text()
            const parsed = JSON.parse(value) as {
                type?: string
                project_id?: string
            }
            if (parsed.type !== 'service_account' || !parsed.project_id) throw new Error()
            setServiceAccountJson(value)
            setServiceAccountFile(file.name)
            setProjectId(parsed.project_id)
            setCredentialType('serviceAccount')
            setClearCredentials(false)
        } catch {
            setMessage({
                tone: 'error',
                text: 'Google Cloud 서비스 계정 JSON 파일이 아닙니다.',
            })
        }
    }
    async function handleTest() {
        setMessage(null)
        try {
            await autoSave.flush()
            const result = await api.testProvider()
            setMessage({ tone: 'success', text: result.message })
        } catch (cause) {
            setMessage({
                tone: 'error',
                text: cause instanceof Error ? cause.message : '연결을 확인하지 못했습니다.',
            })
        }
    }
    return {
        providerKind,
        baseUrl,
        setBaseUrl,
        modelId,
        setModelId,
        auxiliaryModelId,
        setAuxiliaryModelId,
        apiFormat,
        setApiFormat,
        apiKey,
        setApiKey,
        projectId,
        setProjectId,
        location,
        setLocation,
        credentialType,
        setCredentialType,
        serviceAccountFile,
        region,
        setRegion,
        accessKeyId,
        setAccessKeyId,
        awsSecretAccessKey,
        setAwsSecretAccessKey,
        awsSessionToken,
        setAwsSessionToken,
        clearCredentials,
        setClearCredentials,
        providerOptions,
        setProviderOptions,
        temperature,
        setTemperature,
        maxOutputTokens,
        setMaxOutputTokens,
        providerTab,
        setProviderTab,
        message,
        selected,
        autoSave,
        chooseProvider,
        handleServiceAccount,
        handleTest,
    }
}
