# Pokémon survival — art direction

The game is pivoting from dinosaurs to a **Pokémon island survival** theme:
same survival loop (gather / craft / build / hunger / thirst / day-night),
but the creatures are low-poly Pokémon with catch-and-party mechanics.

## Models

- Source: poly.pizza (Tipatat Chennavasin's low-poly Pokémon set, CC-BY style attribution on page)
- Format: `.glb` in `assets/monsters/<slug>.glb`
- Fetch: see `tools/README.md` (must run on a residential machine)

## Roster plan

| slug | role | biome |
|------|------|-------|
| pikachu | fast neutral, tameable | plains |
| charmander | hostile-ish, fire | jungle |
| squirtle | tameable water starter | coast |
| bulbasaur | passive grazer | jungle |
| snorlax | big neutral, blocks paths | plains |
| eevee | skittish, tameable | plains |
| jigglypuff | sings (sleep debuff) | jungle night |
| mew | rare, flees fast | highland |
| haunter | night-only hostile | anywhere at night |
| magikarp | shallow-water ambient | water |
| magnemite | mineral-area guardian | highland rocks |
| pokeball | capture item (thrown) | crafted |

## Rendering notes

- GLTFLoader + AnimationMixer; Quaternius-style flat toon shading via MeshToonMaterial override.
- Keep the hand-painted cel pipeline: ink outlines (inverted hull) are added per-mesh at load time.
