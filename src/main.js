import Phaser from 'phaser';

class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  preload() {
    this.load.tilemapTiledJSON('tulimshar', 'assets/maps/tulimshar.json');
  }

  create() {
    const source = this.cache.tilemap.get('tulimshar').data;
    const tilesets = source.tilesets ?? [];

    for (const tileset of tilesets) {
      if (!tileset.image) continue;
      const key = `tileset:${tileset.name}`;
      this.load.image(key, `assets/maps/${tileset.image}`);
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.renderMap());
    this.load.start();
  }

  renderMap() {
    const map = this.make.tilemap({ key: 'tulimshar' });
    const tilesets = [];

    for (const tilesetData of map.tilesets) {
      const key = `tileset:${tilesetData.name}`;
      const tileset = map.addTilesetImage(tilesetData.name, key);
      if (tileset) tilesets.push(tileset);
    }

    for (const layerData of map.layers) {
      if (layerData.type !== 'tilelayer') continue;
      const layer = map.createLayer(layerData.name, tilesets, 0, 0);
      if (layer) layer.setDepth(layerData.id);
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene],
});
