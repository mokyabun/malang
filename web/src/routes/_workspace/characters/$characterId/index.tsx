import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceRoute } from '@/components/app/workspace-route'

export const Route = createFileRoute('/_workspace/characters/$characterId/')({
    component: CharacterPage,
})

function CharacterPage() {
    const { characterId } = Route.useParams()
    return <WorkspaceRoute page={{ kind: 'chat', characterId }} />
}
