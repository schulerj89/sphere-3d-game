# External character and relic shortlist

Reviewed 2026-07-12. All of these candidates are released under CC0/public-domain terms on the linked source page. Triangle counts and clip names below were measured from the downloadable model with Three.js loaders; package sizes are the exact downloaded bytes.

## Selected runtime pair

| Asset | Source and direct file | Size | Geometry / animation | Why it fits |
| --- | --- | ---: | --- | --- |
| **Quaternius Character Hazmat** | [Poly Pizza model page](https://poly.pizza/m/z3TSQYx1Kn) · [direct GLB](https://static.poly.pizza/484450a4-b76c-4e76-95d2-352337bb41e8.glb) | 1,401,712 bytes | 20,346 triangles, 76 meshes, 17 clips: Death, Duck, HitReact, Idle, Idle_Shoot, Jump, Jump_Idle, Jump_Land, Punch, Run, Run_Gun, Run_Shoot, Walk, Walk_Shoot, Wave, Yes, No | A bright yellow astronaut silhouette matches the sphere/aurora palette. The loader hides the bundled firearm variants so the game keeps its intentional two-slot loadout. |
| **Quaternius Crown** | [Poly Pizza model page](https://poly.pizza/m/i0PZVuVlYv) · [direct GLB](https://static.poly.pizza/1381b02a-8310-437b-a2a7-82cab0a94a4c.glb) | 47,620 bytes | 840 triangles, 2 meshes, static (no animation) | Small, faceted crown with clean bounds; a cyan/emissive shell can be added at runtime for the Aurora Crown glow. |

## Other character options reviewed

| Candidate | Source / format | Size and measured budget | Animation notes | Tradeoff |
| --- | --- | ---: | --- | --- |
| **Quaternius Character Soldier** | [Poly Pizza model page](https://poly.pizza/m/PpLF4rt4ah) · [direct GLB](https://static.poly.pizza/1083c1d3-d1d4-4682-adf6-bc516d06ac84.glb) | 1,333,700 bytes; 20,712 triangles, 60 meshes | 14 clips: Death, Duck, HitReact, Idle, Idle_Shoot, Jump, Jump_Idle, Jump_Land, Punch, Run, Run_Gun, Wave, Yes, No | Strong platform-hero silhouette, but ships with many visible gun meshes; would require the same weapon filtering as Hazmat. |
| **Quaternius Animated LowPoly Robot** | [OpenGameArt page](https://opengameart.org/content/animated-lowpoly-robot) · [direct ZIP](https://opengameart.org/sites/default/files/Animated%20Robot%20-%20Oct%202018.zip) | FBX 3,297,804 bytes; 3,236 triangles, 14 meshes | 14 clips: idle, walking, running, jump, walk-jump, punch, dance, death, sitting, standing, thumbs-up, wave, yes/no | Best space/robot identity and very low geometry. It is FBX-only, so a Three.js `FBXLoader` path (or an offline GLB conversion) is required before shipping. |
| **Quaternius Animated Human Low Poly** | [OpenGameArt page](https://opengameart.org/content/animated-human-low-poly) · [direct ZIP](https://opengameart.org/sites/default/files/Animated%20Human%20by%20%40Quaternius_0.zip) | FBX 2,399,964 bytes; 1,578 triangles, 1 mesh | 9 clips: idle, run, walk, jump, punch, working, death, plus standing variants | Cheapest runtime option and broad locomotion/death coverage, but its generic human look is less distinctive than the space-suit choice. |
| **Kenney Animated Characters 1** | [OpenGameArt page](https://opengameart.org/content/animated-characters-1) · [direct ZIP](https://opengameart.org/sites/default/files/kenney_animated-characters-1.zip) | ZIP 718,021 bytes; model + idle/run/jump FBX files total 1,910,928 bytes; 1,604 triangles | 3 clips (idle, jump, run) delivered as separate FBX animation files | Smallest download and CC0, but separate animation files need an FBX loader/retarget step and do not include combat, death, or celebration clips. |

Quaternius' newer [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) are another strong future option (six humanoids, average 13k triangles, compatible with the 120+ clip [Universal Animation Library](https://quaternius.itch.io/universal-animation-library)), but the free standard download is roughly 122 MB and needs a retarget/import pass, so it is not bundled in this build.

## Integration notes

`Game.loadCharacterModel()` loads `quaternius-hazmat.glb` with the existing `GLTFLoader`, maps the prefixed Quaternius clips to the game's idle/run/jump/attack/hurt/celebrate actions, and falls back to `kaykit-rogue.glb` if the new asset cannot be fetched. Firearm and tool node prefixes are hidden before bounds calculation so the external model does not reintroduce the previous weapon pile-up. The Crown GLB is intentionally static and should be cloned into each relic instance, with the existing procedural cyan aura retained as a fallback/emissive shell.
