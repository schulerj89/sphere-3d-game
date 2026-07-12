# Asset source plan

This repository uses only assets whose source page and license were checked on 2026-07-12.  Every selected external asset is under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); credit is not legally required, but the project keeps voluntary credits in `ATTRIBUTIONS.md`.

## Selected runtime assets

| ID | Source and license | Intended use | Source size | Planned runtime path | Integration notes |
| --- | --- | --- | ---: | --- | --- |
| `kaykit-rogue` | [KayKit Character Pack: Adventures](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), [CC0 license](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/LICENSE.txt) | Primary player character | `Rogue.glb`: 3,616,284 bytes (3.45 MiB) | `public/assets/characters/kaykit-rogue.glb` | Official KayKit source. The pack describes four low-poly, textured, rigged characters with 75 animations and GLTF support. Load with `GLTFLoader`, inspect actual clip names at startup/build time, and map idle/run/jump/pounce only after that inspection. Keep the procedural capsule player as the synchronous fallback if the request fails. |
| `space-flight` | [Space Flight by wipics](https://opengameart.org/content/space-flight), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Ambient title screen and sphere-transfer cinematic loop | `space_flight_0.mp3`: 897.5 KB | `public/assets/audio/music/space-flight.mp3` | The source labels this a space/galaxy ambient loop. Start only after a user gesture, set `loop = true`, and keep it out of the first render path. |
| `orbital-action` | [8-bit Epic Space Shooter Music by HydroGene](https://opengameart.org/content/8-bit-epic-space-shooter-music), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Upbeat exploratory gameplay loop | `8bit-spaceshooter.mp3`: 2 MB | `public/assets/audio/music/orbital-action.mp3` | The source states that the track loops seamlessly. Use a single `HTMLAudioElement` or Web Audio buffer; do not create an instance per scene. Its energetic space tone is a compact demo-safe substitute while bespoke music is evaluated. |
| `ui-confirm` | [8-bit Platformer SFX by MoxieCat](https://opengameart.org/content/8-bit-platformer-sfx-0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Title/menu confirmation | `button.wav`: 25.5 KB | `public/assets/audio/sfx/ui-confirm.wav` | Decode once, then reuse the buffer. |
| `jump` | [8-bit Platformer SFX by MoxieCat](https://opengameart.org/content/8-bit-platformer-sfx-0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Player jump | `jump_1.wav`: 25.4 KB | `public/assets/audio/sfx/jump.wav` | Play only on the grounded-to-jump transition. |
| `dash` | [8-bit Platformer SFX by MoxieCat](https://opengameart.org/content/8-bit-platformer-sfx-0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Fast run / sphere-launch whoosh | `dashwoosh.wav`: 202.9 KB | `public/assets/audio/sfx/dash.wav` | Rate-limit to prevent a sound on every movement frame. |
| `hurt` | [8-bit Platformer SFX by MoxieCat](https://opengameart.org/content/8-bit-platformer-sfx-0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Player damage | `playerhurt.wav`: 44.2 KB | `public/assets/audio/sfx/hurt.wav` | Respect the player damage-invulnerability timer. |
| `enemy-pounce` | [8-bit Platformer SFX by MoxieCat](https://opengameart.org/content/8-bit-platformer-sfx-0), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Enemy defeat / pounce impact | `warlockhurt.wav`: 248.8 KB | `public/assets/audio/sfx/enemy-pounce.wav` | Reuse once per enemy defeat. The filename is retained only upstream; the local neutral name avoids leaking theme into gameplay code. |
| `coin` | [Coin sound effect - Harmonica by Chadderbox](https://opengameart.org/content/coin-sound-effect-harmonica), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Coin collection | `harmonicaCoin.mp3`: 55.4 KB | `public/assets/audio/sfx/coin.mp3` | Use on a successful collect only; slightly vary playback rate if repeated coins sound too uniform. |

## Direct source files

These exact URLs are the download provenance recorded in the asset manifest:

- `https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue.glb`
- `https://opengameart.org/sites/default/files/space_flight_0.mp3`
- `https://opengameart.org/sites/default/files/8bit-spaceshooter.mp3`
- `https://opengameart.org/sites/default/files/button.wav`
- `https://opengameart.org/sites/default/files/jump_1.wav`
- `https://opengameart.org/sites/default/files/dashwoosh.wav`
- `https://opengameart.org/sites/default/files/playerhurt.wav`
- `https://opengameart.org/sites/default/files/warlockhurt.wav`
- `https://opengameart.org/sites/default/files/harmonicaCoin.mp3`

## Browser budget and loading contract

The selected set is about 7.1 MB before HTTP compression. It is deliberately below the 40 MB initial-GLB guideline and keeps the only GLB below the 6 MB reusable-prop ceiling.

1. Render the procedural player, HUD, and title screen first.
2. Load `kaykit-rogue` after the playable scene is constructed. If it rejects or contains no usable clips, retain the procedural player and log the manifest ID.
3. Unlock and begin audio only after the first tap/click; preload the compact SFX buffers after the title screen becomes interactive.
4. Load the cinematic/title loop only when that state is entered. Keep one gameplay music instance alive rather than overlapping copies.
5. Expose loaded asset IDs, HTTP load failures, and `renderer.info` metrics through the game's debug/test API.

## Approved fallback sources (not bundled)

- [Kenney Animated Characters 1](https://kenney.nl/assets/animated-characters-1) is an official CC0 fallback with four skins and three relevant clips (idle, jump, running). Its [OpenGameArt mirror](https://opengameart.org/content/animated-characters-1) identifies the 718 KB ZIP from Kenney. It needs conversion from its source format before use in Three.js, so it is not the first choice.
- [Space Echo by Centurion_of_war](https://opengameart.org/content/space-echo) is a 2 MB CC0 OGG loop for a quieter title/credits state.

Do not add marketplace, "free for non-commercial use", attribution-only, unclear, or generated-audio assets without adding their source, applicable license, filesize, and deployment review to this document first.
