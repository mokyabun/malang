import { eq } from 'drizzle-orm'

import { characterAssets } from '../schema'
import { RepositoryBase } from './base'

export class CharacterAssetRepository extends RepositoryBase {
    list(characterId: string) {
        return this.db
            .select()
            .from(characterAssets)
            .where(eq(characterAssets.characterId, characterId))
            .all()
    }
}
