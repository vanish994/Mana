import Phaser from 'phaser';

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
const INDEX_URL = assetUrl('assets/maps/map-index.json');
const TILESET_PREFIX = 'tileset:';
const PLAYER_SPEED = 150;

const normalizeMapId = (value) => String(value ?? '')
  .replace(/^.*data\/maps\//, '')
  .replace(/\.tmx$/i, '')
  .replace(/\.json$/i, '')
  .replace(/^\/+|\/+$/g, '')
  .replaceAll('\\', '/');

const objectProperties = (object) => {
  if (Array.isArray(object?.properties)) {
    return Object.fromEntries(object.properties.map((property) => [property.name, property.value]));
  }
  return object?.properties ?? {};
};

class MapScene extends Phaser.Scene {
  constructor() {
    super('world');
    this.mapLayers = [];
    this.mapId = null;
    this.mapEntries = [];
    this.mapLookup = new Map();
    this.mapIndex = 0;
    this.mapTitle = null;
    this.player = null;
    this.playerMarker = null;
    this.cursors = null;
    this.keys = null;
    this.moveTarget = null;
    this.portals = [];
    this.portalPrompt = null;
    this.currentPortal = null;
    this.portalCooldownUntil = 0;
    this.travelButtons = [];
    this.mapLoadToken = 0;
  }

  preload() {
    this.load.json('world-map-index', INDEX_URL);
  }

  create() {
    const index = this.cache.json.get('world-map-index');
    this.mapEntries = (index?.maps ?? []).map((entry) => ({
      ...entry,
      id: normalizeMapId(entry.id),
      name: String(entry.name ?? entry.id).replace(/\.json$/i, '').replaceAll('-', ' ').replaceAll('_', ' '),
    })).filter((entry) => entry.id);
    this.mapLookup = new Map(this.mapEntries.map((entry) => [entry.id, entry]));

    if (!this.mapEntries.length) {
      this.add.text(20, 20, 'Nenhum mapa importado. Execute o workflow de importação.', {
        color: '#ffffff', backgroundColor: '#7f1d1d', padding: 10, fontSize: '16px',
      }).setScrollFactor(0).setDepth(10000);
      return;
    }

    const panel = this.add.rectangle(12, 12, 390, 68, 0x111827, 0.9)
      .setOrigin(0).setScrollFactor(0).setDepth(10000);
    this.mapTitle = this.add.text(24, 18, '', {
      color: '#ffffff', fontSize: '14px', fontFamily: 'Arial', maxLines: 1,
    }).setScrollFactor(0).setDepth(10001);

    this.add.text(24, 43, '‹ Mapa', {
      color: '#93c5fd', fontSize: '13px', fontFamily: 'Arial',
    }).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(10001)
      .on('pointerdown', () => this.selectMap(this.mapIndex - 1));

    this.add.text(112, 43, 'Próximo ›', {
      color: '#93c5fd', fontSize: '13px', fontFamily: 'Arial',
    }).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(10001)
      .on('pointerdown', () => this.selectMap(this.mapIndex + 1));

    this.add.text(224, 43, 'Mundo', {
      color: '#a7f3d0', fontSize: '13px', fontFamily: 'Arial',
    }).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(10001)
      .on('pointerdown', () => {
        const world = this.mapEntries.findIndex((entry) => /(^|\/)overworld$/.test(entry.id));
        if (world >= 0) this.selectMap(world);
      });

    this.add.text(24, 62, 'Toque para andar • aproxime-se de uma saída para viajar', {
      color: '#d1d5db', fontSize: '11px', fontFamily: 'Arial',
    }).setScrollFactor(0).setDepth(10001);

    this.portalPrompt = this.add.text(0, 0, '', {
      color: '#ffffff', backgroundColor: '#065f46', padding: { x: 8, y: 5 },
      fontSize: '13px', fontFamily: 'Arial',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setVisible(false);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,E');

    this.input.on('pointerdown', (pointer) => {
      if (pointer.y < 88) return;
      if (!this.player || this.currentPortal) return;
      this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
    });

    this.input.keyboard?.on('keydown-E', () => this.enterCurrentPortal());

    const startId = normalizeMapId(index.start ?? 'tonori/tulimshar/tulimshar');
    const startIndex = this.mapEntries.findIndex((entry) => entry.id === startId);
    this.selectMap(startIndex >= 0 ? startIndex : 0);
  }

  selectMap(nextIndex, spawn = null) {
    const length = this.mapEntries.length;
    this.mapIndex = (nextIndex + length) % length;
    const entry = this.mapEntries[this.mapIndex];
    this.mapTitle.setText(`${entry.name}  (${this.mapIndex + 1}/${length})`);
    this.openMap(entry.id, spawn);
  }

  openMap(mapId, spawn = null) {
    mapId = normalizeMapId(mapId);
    if (!this.mapLookup.has(mapId)) {
      this.showMapError(`Mapa não encontrado: ${mapId}`);
      return;
    }
    const token = ++this.mapLoadToken;
    for (const layer of this.mapLayers) layer.destroy();
    this.mapLayers = [];
    this.portals = [];
    this.currentPortal = null;
    this.moveTarget = null;
    this.portalPrompt?.setVisible(false);
    this.player?.destroy();
    this.player = null;
    this.playerMarker?.destroy();
    this.playerMarker = null;
    this.mapId = mapId;

    const mapKey = `map:${mapId}`;
    this.load.tilemapTiledJSON(mapKey, assetUrl(`assets/maps/${mapId}.json`));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (token !== this.mapLoadToken) return;
      const source = this.cache.tilemap.get(mapKey)?.data;
      if (!source) {
        this.showMapError(`Não foi possível carregar: ${mapId}`);
        return;
      }

      const map = this.make.tilemap({ key: mapKey });
      const missing = [];
      for (const tilesetData of source.tilesets ?? []) {
        if (!tilesetData.image) continue;
        const key = `${TILESET_PREFIX}${mapId}:${tilesetData.name}`;
        if (!this.textures.exists(key)) {
          const mapDirectory = mapId.includes('/') ? mapId.slice(0, mapId.lastIndexOf('/')) : '';
          this.load.image(key, assetUrl(`assets/maps/${mapDirectory ? `${mapDirectory}/` : ''}${tilesetData.image}`));
          missing.push(key);
        }
      }

      const finishRender = () => {
        if (token !== this.mapLoadToken) return;
        const tilesets = [];
        for (const tilesetData of map.tilesets) {
          const key = `${TILESET_PREFIX}${mapId}:${tilesetData.name}`;
          if (!this.textures.exists(key)) continue;
          const tileset = map.addTilesetImage(tilesetData.name, key);
          if (tileset) tilesets.push(tileset);
        }

        this.renderLayers(map, tilesets);
        this.configureCamera(map);
        this.createPlayer(map, spawn);
        this.collectPortals(map);
      };

      if (missing.length) this.load.once(Phaser.Loader.Events.COMPLETE, finishRender);
      else finishRender();
      if (missing.length) this.load.start();
    });
    this.load.once(Phaser.Loader.Events.LOAD_ERROR, (file) => {
      if (token === this.mapLoadToken) this.showMapError(`Falha ao carregar arquivo: ${file.key}`);
    });
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
        // Collision tiles are gameplay metadata, not visible terrain. Drawing this layer
        // last can cover the entire world with the collision tileset's dark pixels.
        if (/^collision(s)?$/i.test(layerData.name?.trim() ?? '')) continue;
        const layer = map.createLayer(layerData.name, tilesets, 0, 0);
        if (!layer) continue;
        layer.setDepth(layerData.id ?? this.mapLayers.length);
        this.mapLayers.push(layer);
      }
    };
    render(map.layers);
  }

  createPlayer(map, spawn) {
    const x = Phaser.Math.Clamp(spawn?.x ?? map.widthInPixels / 2, 12, map.widthInPixels - 12);
    const y = Phaser.Math.Clamp(spawn?.y ?? map.heightInPixels / 2, 12, map.heightInPixels - 12);
    this.player = this.add.container(x, y).setDepth(9000);
    const shadow = this.add.ellipse(0, 8, 17, 8, 0x000000, 0.45);
    const body = this.add.rectangle(0, 0, 14, 18, 0x38bdf8).setStrokeStyle(2, 0x0c4a6e);
    const head = this.add.circle(0, -12, 6, 0xf4c7a1).setStrokeStyle(1, 0x78350f);
    const marker = this.add.triangle(0, -23, 0, 7, 6, -4, -6, -4, 0xfef08a);
    this.player.add([shadow, body, head, marker]);
    this.playerMarker = this.add.circle(x, y, 15, 0x38bdf8, 0.08)
      .setStrokeStyle(1, 0x7dd3fc).setDepth(8999);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
  }

  collectPortals(map) {
    const layers = [];
    const walk = (items) => {
      for (const layer of items ?? []) {
        if (layer.type === 'group') walk(layer.layers);
        if (layer.type === 'objectgroup') layers.push(layer);
      }
    };
    walk(map.layers);

    for (const layer of layers) {
      for (const object of layer.objects ?? []) {
        const props = objectProperties(object);
        const values = [
          props.dest_map, props.destMap, props.destination_map, props.destinationMap,
          props.target_map, props.targetMap, props.map, props.destination, props.target,
          object.type, object.class, object.name,
        ].filter((value) => typeof value === 'string' && value.trim());
        const rawTarget = values.map(normalizeMapId).find((value) => this.mapLookup.has(value));
        const portalLike = /warp|portal|teleport|exit|entrance|door|transition|cave|town|map/i
          .test(`${object.name} ${object.type} ${object.class ?? ''} ${Object.keys(props).join(' ')}`);
        if (!rawTarget && !portalLike) continue;
        const width = Math.max(object.width || 32, 24);
        const height = Math.max(object.height || 32, 24);
        this.portals.push({
          x: object.x + width / 2,
          y: object.y + height / 2,
          width,
          height,
          target: rawTarget ?? null,
          name: object.name || rawTarget || 'Saída',
          props,
        });
      }
    }
  }

  update(_time, delta) {
    if (!this.player) return;
    const dt = Math.min(delta / 1000, 0.05);
    let dx = 0;
    let dy = 0;
    if (this.cursors?.left.isDown || this.keys?.A?.isDown) dx -= 1;
    if (this.cursors?.right.isDown || this.keys?.D?.isDown) dx += 1;
    if (this.cursors?.up.isDown || this.keys?.W?.isDown) dy -= 1;
    if (this.cursors?.down.isDown || this.keys?.S?.isDown) dy += 1;

    if (dx || dy) {
      const length = Math.hypot(dx, dy) || 1;
      this.player.x += (dx / length) * PLAYER_SPEED * dt;
      this.player.y += (dy / length) * PLAYER_SPEED * dt;
      this.moveTarget = null;
    } else if (this.moveTarget) {
      const vx = this.moveTarget.x - this.player.x;
      const vy = this.moveTarget.y - this.player.y;
      const distance = Math.hypot(vx, vy);
      if (distance < 5) this.moveTarget = null;
      else {
        this.player.x += (vx / distance) * PLAYER_SPEED * dt;
        this.player.y += (vy / distance) * PLAYER_SPEED * dt;
      }
    }

    const bounds = this.cameras.main.getBounds();
    this.player.x = Phaser.Math.Clamp(this.player.x, 8, bounds.width - 8);
    this.player.y = Phaser.Math.Clamp(this.player.y, 8, bounds.height - 8);
    this.playerMarker?.setPosition(this.player.x, this.player.y);

    const portal = this.portals.find((entry) => {
      const dx = entry.x - this.player.x;
      const dy = entry.y - this.player.y;
      return Math.hypot(dx, dy) < Math.max(34, Math.min(entry.width, entry.height) / 2 + 12);
    });
    this.currentPortal = portal ?? null;
    if (portal) {
      this.portalPrompt.setText(portal.target ? `Entrar: ${portal.name} (toque aqui)` : `Saída: ${portal.name}`);
      this.portalPrompt.setPosition(this.scale.width / 2, this.scale.height - 40).setVisible(true);
      this.portalPrompt.removeAllListeners('pointerdown');
      this.portalPrompt.setInteractive().once('pointerdown', () => this.enterCurrentPortal());
    } else {
      this.portalPrompt.setVisible(false);
    }
  }

  enterCurrentPortal() {
    const portal = this.currentPortal;
    if (!portal || this.time.now < this.portalCooldownUntil) return;
    this.portalCooldownUntil = this.time.now + 800;
    if (portal.target && this.mapLookup.has(portal.target)) {
      const targetX = Number(portal.props?.spawn_x ?? portal.props?.spawnX);
      const targetY = Number(portal.props?.spawn_y ?? portal.props?.spawnY);
      const spawn = Number.isFinite(targetX) && Number.isFinite(targetY) ? { x: targetX, y: targetY } : null;
      const targetIndex = this.mapEntries.findIndex((entry) => entry.id === portal.target);
      if (targetIndex >= 0) this.selectMap(targetIndex, spawn);
      return;
    }

    const candidates = this.mapEntries.filter((entry) => entry.id !== this.mapId && (
      this.mapId.startsWith(entry.id.split('/').slice(0, -1).join('/') + '/') ||
      entry.id.startsWith(this.mapId.split('/').slice(0, -1).join('/') + '/') ||
      entry.id.split('/').slice(0, -1).join('/') === this.mapId.split('/').slice(0, -1).join('/')
    ));
    const next = candidates[0];
    if (next) {
      const targetIndex = this.mapEntries.findIndex((entry) => entry.id === next.id);
      this.selectMap(targetIndex);
    } else {
      this.portalPrompt.setText('Esta saída ainda não tem destino configurado.');
    }
  }

  configureCamera(map) {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.centerOn(this.player?.x ?? map.widthInPixels / 2, this.player?.y ?? map.heightInPixels / 2);
  }

  showMapError(message) {
    this.add.text(20, 100, message, {
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
