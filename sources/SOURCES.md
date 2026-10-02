# Sources — Collibra product documentation

Every node in the colibri metamodel graph must be traceable to one of these pages. Raw snapshots live in `sources/raw/`; this index maps each snapshot to its origin URL.

- **Pinned doc version**: `2026.02` (chosen over `/latest/` for reproducibility; the fetch script falls back to `/latest/` only if the pinned version fails)
- **Fetched**: 2026-10-02
- **Refetch any time**: `python sources/fetch_sources.py`
- **Verify a snapshot against the live page**: open the origin URL below and diff against the file in `sources/raw/`

| Snapshot | Origin URL | Contents | Rows |
|----------|-----------|----------|------|
| `raw/asset-types-ootb.htm` | https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/AssetTypes/ref_ootb-asset-types.htm | Out-of-the-box asset types, full table with hierarchy | 206 |
| `raw/asset-types-about.htm` | https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/AssetTypes/to_asset-types.htm | About asset types; the main (root) asset types | n/a |
| `raw/attribute-types-ootb.htm` | https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/Characteristics/Attributes/AttributeTypes/ref_attribute-types.htm | Out-of-the-box attribute types, full table | 195 |
| `raw/relation-types-ootb.htm` | https://productresources.collibra.com/docs/collibra/2026.02/Content/Assets/Characteristics/Relations/RelationTypes/ref_relation-types.htm | Out-of-the-box relation types (head role, co-role, tail) | 146 |

## Notes for the build

- Row counts are `<tr>` occurrences, an upper bound on the true node count (headers, section rows included). Actual metamodel size will be confirmed during transcription; the pipeline does not depend on the exact count.
- The OOTB asset type table links to one detail page per asset type (attribute assignments, default attributes, etc.). Those detail pages will be pulled and added to this index during transcription, so every class/property assertion in the RDF also has a source.
- Snapshots are single-page `.htm` files saved verbatim (HTTP body as served); no cleaning or extraction has been applied.
