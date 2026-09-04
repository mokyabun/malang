import { eq } from 'drizzle-orm'

import { characterLoreEntries } from '../schema'
import { RepositoryBase } from './base'

export class CharacterLoreRepository extends RepositoryBase {
    extensions(characterId: string): Map<string, Record<string, unknown>> {
        const rows = this.db
            .select({
                id: characterLoreEntries.id,
                extensionsJson: characterLoreEntries.extensionsJson,
            })
            .from(characterLoreEntries)
            .where(eq(characterLoreEntries.characterId, characterId))
            .all()
        return new Map(rows.map((row) => [row.id, row.extensionsJson]))
    }
}
