/**
 * Re-export shim for contract path compatibility.
 *
 * `docs/contracts/quest_schema.contract.md` Section 6 names
 * `src/data/quests/quest_types.ts` as the canonical location. Nyx ships the
 * implementation in `_schema.ts` per agent prompt Output Files spec; this
 * module re-exports so downstream consumers (Linus `dialogue_types.ts` imports
 * `EffectSchema` from `@/data/quests/quest_types`, etc.) resolve without
 * requiring Linus or other agents to change import paths.
 */
export * from './_schema';
