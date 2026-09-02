import { ArrowRight, Key, WarningCircle } from '@phosphor-icons/react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

interface LoginScreenProps {
    onAuthenticated: () => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError('')
        setSubmitting(true)
        try {
            await api.login(password)
            onAuthenticated()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '로그인하지 못했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="relative grid min-h-full place-items-center overflow-hidden bg-background p-6 sm:p-8">
            <div
                className="absolute left-6 top-6 flex gap-5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground"
                aria-hidden="true"
            >
                <span>MLN</span>
                <span>01</span>
                <span>SELF HOST</span>
            </div>
            <section
                className="relative w-full max-w-md border border-border bg-card p-8 shadow-2xl sm:p-12 [&_h1]:mt-2 [&_h1]:font-serif [&_h1]:text-3xl [&_h1]:leading-tight"
                aria-labelledby="login-title"
            >
                <div
                    className="mb-8 grid size-12 place-items-center bg-primary font-serif text-2xl font-bold text-primary-foreground"
                    aria-hidden="true"
                >
                    M
                </div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    PRIVATE CHARACTER ARCHIVE
                </p>
                <h1 id="login-title">다시 이야기를 시작하세요.</h1>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    캐릭터 카드, 프롬프트와 대화 기록은 이 서버에만 보관됩니다.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
                    <Label htmlFor="admin-password">관리자 비밀번호</Label>
                    <div className="grid gap-2">
                        <Key aria-hidden="true" weight="duotone" />
                        <Input
                            id="admin-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="비밀번호 입력"
                            required
                        />
                    </div>
                    {error ? (
                        <p className="m-0 text-xs leading-5 text-destructive" role="alert">
                            <WarningCircle aria-hidden="true" />
                            {error}
                        </p>
                    ) : null}
                    <Button
                        size="lg"
                        variant="default"
                        type="submit"
                        className="gap-2 mt-1 w-full"
                        disabled={submitting}
                    >
                        {submitting ? '확인 중…' : 'Malang 열기'}
                        <ArrowRight aria-hidden="true" />
                    </Button>
                </form>
            </section>
            <p className="absolute bottom-6 right-8 hidden font-mono text-[10px] text-muted-foreground sm:block">
                Malang · self-hosted AI chat workspace
            </p>
        </main>
    )
}
