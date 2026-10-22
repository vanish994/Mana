import Phaser from 'phaser';

const INDEX_URL = 'assets/maps/map-index.json';
const TILESET_PREFIX = 'tileset:';

class MapScene extends Phaser.Scene {
  constructor() {
    super('world');
    this.mapLayers = [];
    this.mapId = null;
    this.mapEntries = [];
    this.mapIndex = 0;
    this.mapTitle = null;
  }

  preload() {
    this.load.json('world-map-index', INDEX_URL);
  }

  create() {
    const index = this.cache.json.get('world-map-index');
    this.mapEntries = index?.maps ?? [];

    if (!this.mapEntries.length) {
      this.add.text(20, 20, 'Nenhum mapa importado. Execute o workflow de importação.', {
        color: '#ffffff', backgroundColor: '#7f1d1d', padding: 10, fontSize: '16px',
      }).setScrollFactor(0).setDepth(10000);
      return;
    }

    const startId = index.start ?? 'tonori/tulimshar/tulimshar';
    const startIndex = this.mapEntries.findIndex(entry => entry.id === startId);
    this.mapIndex = Math.max(0, startIndex);

    const panel = this.add.rectangle(12, 12, 390, 56, 0x111827, 0.9)
      .setOrigin(0).setScrollFactor(0).setDepth(10000);
    this.mapTitle = this.add.text(24, 20, '', {
      color: '#ffffff', fontSize: '14px', fontFamily: 'Arial', maxLines: 1,
    }).setScrollFactor(0).setDepth(10001);

    this.add.text(24, 43, '‹ Anterior', {
      color: '#93c5fd', fontSize: '13px', fontFamily: 'Arial',
    }).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(10001)
      .on('pointerdown', () => this.selectMap(this.mapIndex - 1));

    this.add.text(112, 43, 'Próximo ›', {
      color: '#93c5fd', fontSize: '13px', fontFamily: 'Arial',
    }).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(10001)
      .on('pointerdown', () => this.selectMap(this.mapIndex + 1));

    this.add.text(224, 43, `${this.mapEntries.length} mapas`, {
      color: '#d1d5db', fontSize: '12px', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(10001);

    this.selectMap(this.mapIndex);
  }

  selectMap(nextIndex) {
    const length = this.mapEntries.length;
    this.mapIndex = (nextIndex + length) % length;
    const entry = this.mapEntries[this.mapIndex];
    this.mapTitle.setText(`Mapa ${this.mapIndex + 1}/${length}: ${entry.name}`);
    this.openMap(entry.id);
  }

  openMap(mapId) {
    if (this.mapId === mapId) return;

    for (const layer of this.mapLayers) layer.destroy();
    this.mapLayers = [];
    this.mapId = mapId;

    const mapKey = `map:${mapId}`;
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const source = this.cache.tilemap.get(mapKey)?.data;
      if (!source) {
        this.showMapError(mapId);
        return;
      }

      const map = this.make.tilemap({ key: mapKey });
      const textureKeys = [];

      for (const tilesetData of source.tilesets ?? []) {
        if (!tilesetData.image) continue;
        const key = `${TILESET_PREFIX}${mapId}:${tilesetData.name}`;
        textureKeys.push(key);
        if (!this.textures.exists(key)) {
          const mapDirectory = mapId.includes('/') ? mapId.slice(0, mapId.lastIndexOf('/')) : '';
          this.load.image(key, `assets/maps/${mapDirectory ? `${mapDirectory}/` : ''}${tilesetData.image}`);
        }
      }

      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        const tilesets = [];
        for (const tilesetData of map.tilesets) {
          const key = `${TILESET_PREFIX}${mapId}:${tilesetData.name}`;
          if (!this.textures.exists(key)) continue;
          const tileset = map.addTilesetImage(tilesetData.name, key);
          if (tileset) tilesets.push(tileset);
        }

        this.renderLayers(map, tilesets);
        this.configureCamera(map);
      });

      if (textureKeys.some(key => !this.textures.exists(key))) this.load.start();
      else {
        this.load.emit(Phaser.Loader.Events.COMPLETE);
      }
    });

    this.load.tilemapTiledJSON(mapKey, `assets/maps/${mapId}.json`);
    this.load.start();
  }

  renderLayers(map, tilesets) {
    const render = (layers) => {
      for (const layerData of layers) {
        if (layerData.visible === false) continue;
        if (layerData.type === 'group') {
          render(layerData.layers ?? []);
          continue;
        }
        if (layerData.type !== 'tilelayer') continue;

        const layer = map.createLayer(layerData.name, tilesets, 0, 0);
        if (!layer) continue;
        layer.setDepth(layerData.id ?? this.mapLayers.length);
        this.mapLayers.push(layer);
      }
    };
    render(map.layers);
  }

  configureCamera(map) {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
  }

  showMapError(mapId) {
    this.add.text(20, 90, `Não foi possível carregar o mapa: ${mapId}`, {
      color: '#ffffff', backgroundColor: '#7f1d1d', padding: 10, fontSize: '14px',
    }).setScrollFactor(0).setDepth(10000);
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
