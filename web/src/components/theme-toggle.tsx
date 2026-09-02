import { Moon, Sun } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useTheme } from './theme-provider'

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()
    const nextTheme = theme === 'dark' ? 'light' : 'dark'

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('text-muted-foreground hover:text-foreground', className)}
            onClick={() => setTheme(nextTheme)}
            aria-label={`${nextTheme === 'dark' ? '다크' : '라이트'} 테마로 전환`}
            title={`${nextTheme === 'dark' ? '다크' : '라이트'} 테마로 전환`}
        >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </Button>
    )
}
