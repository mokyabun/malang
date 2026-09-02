import { ArrowLeft } from '@phosphor-icons/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { AppSearchInput } from '../app-search-input'
import { SETTINGS_NAV } from './navigation'
import type { SettingsPanelProps } from './types'

export function SettingsNavigation({
    section,
    onBack,
    onSectionChange,
}: Pick<SettingsPanelProps, 'section' | 'onBack' | 'onSectionChange'>) {
    const [query, setQuery] = useState('')
    const visibleNavigation = SETTINGS_NAV.filter(({ label }) =>
        label.toLocaleLowerCase('ko').includes(query.trim().toLocaleLowerCase('ko')),
    )

    return (
        <nav
            className="relative flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 max-[720px]:flex-row max-[720px]:items-center max-[720px]:gap-1 max-[720px]:overflow-x-auto max-[720px]:border-b max-[720px]:border-r-0 max-[720px]:px-2 max-[720px]:py-2"
            aria-label="설정 카테고리"
        >
            <div className="px-2 max-[720px]:hidden">
                <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-primary">
                    MALANG
                </p>
                <h1 className="mt-1 font-serif text-xl leading-tight">설정</h1>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    대화 환경을 구성합니다.
                </p>
            </div>

            <AppSearchInput
                label="설정 검색"
                className="mt-5 max-[720px]:hidden"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="설정 검색…"
            />

            <div className="mt-6 grid gap-0.5 max-[720px]:contents">
                {visibleNavigation.map(({ section: target, label, icon: Icon }) => (
                    <Button
                        key={target}
                        type="button"
                        variant="ghost"
                        className="relative justify-start text-left text-muted-foreground hover:bg-selection hover:text-foreground data-active:bg-selection data-active:font-medium data-active:text-foreground data-active:after:absolute data-active:after:inset-y-2 data-active:after:-right-3 data-active:after:w-px data-active:after:bg-foreground/60 max-[720px]:shrink-0 max-[720px]:data-active:after:inset-x-3 max-[720px]:data-active:after:bottom-[-9px] max-[720px]:data-active:after:top-auto max-[720px]:data-active:after:h-px max-[720px]:data-active:after:w-auto [&_svg]:size-[1.1rem] [&_svg]:shrink-0"
                        data-active={section === target ? '' : undefined}
                        aria-current={section === target ? 'page' : undefined}
                        onClick={() => onSectionChange(target)}
                    >
                        <Icon aria-hidden="true" />
                        {label}
                    </Button>
                ))}
            </div>
            {!visibleNavigation.length ? (
                <p className="px-2 py-5 text-xs leading-5 text-muted-foreground max-[720px]:hidden">
                    일치하는 설정이 없습니다.
                </p>
            ) : null}

            <div className="mt-auto border-t border-sidebar-border pt-3 max-[720px]:hidden">
                <p className="mb-2 px-2 text-[10px] leading-4 text-muted-foreground">
                    설정은 자동 저장되거나 화면의 저장 버튼으로 반영됩니다.
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2 px-2 text-muted-foreground"
                    onClick={onBack}
                >
                    <ArrowLeft aria-hidden="true" />
                    작업공간으로 돌아가기
                </Button>
            </div>
        </nav>
    )
}
