import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_workspace/prompts')({
    beforeLoad: () => {
        throw redirect({ to: '/settings/$section', params: { section: 'prompts' } })
    },
})
