import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceRoute } from '@/components/app/workspace-route'

export const Route = createFileRoute('/_workspace/characters/')({ component: CharactersPage })

function CharactersPage() {
    return <WorkspaceRoute page={{ kind: 'chat' }} />
}
