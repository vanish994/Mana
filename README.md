# Mana

Phaser 4 project prepared to import the Source of Mana Tiled maps.

## Convert the first map

The Source of Mana map files are Tiled TMX files. Phaser 4's tilemap system consumes Tiled JSON, and its Tiled parser does not support external tilesets in the JSON data, so the converter embeds the TSX data into the generated map JSON. citeturn3search0turn3search5

With the Source of Mana repository available next to this repository:

```bash
npm install
npm run convert:sourceofmana -- --source ../sourceofmana --map data/maps/tonori/tulimshar/tulimshar.tmx
npm run dev
```

The converter writes:

```text
public/assets/maps/tulimshar.json
public/assets/maps/tilesets/*.png
```

The original TMX is 186x125 tiles with 32x32 tiles.

## Why JSON

Tiled's TMX and JSON formats contain the same map information; JSON is the format Phaser consumes for Tiled tilemaps. citeturn3search6turn0search0

The converter keeps the original tile GIDs, layers, objects, properties and tileset ordering instead of rebuilding the map by hand.

## Source assets

The generated map and copied tileset images are build artifacts from the Source of Mana repository. They are not committed automatically here because the current `mana` repository only contains the new project scaffold and the available GitHub file interface cannot transfer the original binary PNG assets directly. Run the converter against a local clone of Source of Mana to materialize them.
