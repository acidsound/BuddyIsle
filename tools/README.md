# Pokémon asset fetch

poly.pizza sits behind Cloudflare, which blocks datacenter IPs — so model downloads
must run from a residential machine (your PC), not from CI or a cloud box.

## One-time setup

```bash
cd tools
npm init -y
npm i puppeteer-core
```

Uses your locally installed Chrome automatically.

## Fetch models

```bash
node fetch-pokemon.mjs              # all 12 (pikachu, charmander, squirtle, bulbasaur,
                                    # snorlax, eevee, jigglypuff, mew, haunter, magikarp,
                                    # magnemite, pokeball)
node fetch-pokemon.mjs pikachu snorlax   # subset
```

A Chrome window will open and navigate each model page. If Cloudflare shows a
"Verify you are human" checkbox, click it once — the script waits for you.
GLBs land in `assets/monsters/<slug>.glb`.

## Ship them back

```bash
git add ../assets/monsters
git commit -m "assets: pokemon glb pack"
git push
```

Already-downloaded files are skipped, so re-running is cheap.
