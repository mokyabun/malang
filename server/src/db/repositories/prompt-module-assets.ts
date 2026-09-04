import { eq } from 'drizzle-orm'

import { promptModuleAssets } from '../schema'
import { RepositoryBase } from './base'

export interface PromptModuleAssetRecord {
    id: string
    moduleId: string
    assetId: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export class PromptModuleAssetRepository extends RepositoryBase {
    replace(moduleId: string, links: PromptModuleAssetRecord[]): void {
        this.db.transaction((tx) => {
            tx.delete(promptModuleAssets).where(eq(promptModuleAssets.moduleId, moduleId)).run()
            if (links.length) tx.insert(promptModuleAssets).values(links).run()
        })
    }

    list(moduleId: string) {
        return this.db
            .select()
            .from(promptModuleAssets)
            .where(eq(promptModuleAssets.moduleId, moduleId))
            .all()
    }
}
