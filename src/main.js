import Phaser from 'phaser';

const MAP_KEY = 'tulimshar';
const MAP_URL = 'assets/maps/tulimshar.json';

class MapScene extends Phaser.Scene {
  constructor() {
    super(MAP_KEY);
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_URL);
  }

  create() {
    const map = this.make.tilemap({ key: MAP_KEY });
    const tilesets = [];

    // The converter keeps each tileset image next to the generated map.
    // Load every image before creating the tile layers so Phaser can resolve
    // the Tiled tileset names correctly.
    for (const tilesetData of map.tilesets) {
      const imagePath = tilesetData.data?.image;
      if (!imagePath) continue;

      const key = `tileset:${tilesetData.name}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, `assets/maps/${imagePath}`);
      }
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const tilesetData of map.tilesets) {
        const key = `tileset:${tilesetData.name}`;
        const tileset = map.addTilesetImage(tilesetData.name, key);
        if (tileset) tilesets.push(tileset);
      }

      this.renderLayers(map, tilesets);
      this.configureCamera(map);
    });

    this.load.start();
  }

  renderLayers(map, tilesets) {
    for (const layerData of map.layers) {
      if (layerData.type !== 'tilelayer' || !layerData.visible) continue;

      const layer = map.createLayer(layerData.name, tilesets, 0, 0);
      if (!layer) continue;

      layer.setDepth(layerData.id);
    }
  }

  configureCamera(map) {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  backgroundColor: '#111111',
  pixelArt: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 450,
  },
  scene: [MapScene],
});
