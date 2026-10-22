import Phaser from 'phaser';

class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  preload() {
    this.load.tilemapTiledJSON('tulimshar', 'assets/maps/tulimshar.json');
  }

  create() {
    const map = this.make.tilemap({ key: 'tulimshar' });

    for (const tilesetData of map.tilesets) {
      const imageKey = `tileset-${tilesetData.name}`;
      const imagePath = `assets/maps/${tilesetData.name}.png`;
      this.load.image(imageKey, imagePath);
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const tilesetData of map.tilesets) {
        const imageKey = `tileset-${tilesetData.name}`;
        map.addTilesetImage(tilesetData.name, imageKey);
      }
      for (const layerData of map.layers) {
        if (layerData.type === 'tilelayer') {
          map.createLayer(layerData.name, map.tilesets);
        }
      }
      this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    });
    this.load.start();
  }
}

const config = {
  type: Phaser.AUTO,
  parent: document.body,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene],
};

new Phaser.Game(config);
