import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceRoute } from '@/components/app/workspace-route'

export const Route = createFileRoute('/_workspace/characters/$characterId/chats/$conversationId')({
    component: ConversationPage,
})

function ConversationPage() {
    const { characterId, conversationId } = Route.useParams()
    return <WorkspaceRoute page={{ kind: 'chat', characterId, conversationId }} />
}
