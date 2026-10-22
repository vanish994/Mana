import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const sourceRoot = path.resolve(getArg('--source', '../sourceofmana'));
const mapRelative = getArg('--map', 'data/maps/tonori/tulimshar/tulimshar.tmx');
const outRelative = getArg('--out', 'public/assets/maps/tulimshar.json');
const outputRoot = path.resolve(path.dirname(outRelative));
const mapFile = path.join(sourceRoot, mapRelative);
const imageRoot = path.join(outputRoot, 'tilesets');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: false,
});

const arr = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const num = (value, fallback = 0) => value == null || value === '' ? fallback : Number(value);

function properties(node) {
  const result = {};
  for (const p of arr(node?.properties?.property)) {
    if (p['@_name'] == null) continue;
    const type = p['@_type'];
    let value = p['@_value'] ?? p['#text'] ?? '';
    if (type === 'int' || type === 'float') value = Number(value);
    if (type === 'bool') value = value === true || value === 'true';
    result[p['@_name']] = value;
  }
  return result;
}

function tiledProperties(node) {
  const ps = properties(node);
  return Object.entries(ps).map(([name, value]) => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
    value,
  }));
}

function decodeCsv(text) {
  return String(text ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(Number);
}

function convertObject(o) {
  const out = {
    id: num(o['@_id']),
    name: o['@_name'] ?? '',
    type: o['@_type'] ?? '',
    x: num(o['@_x']),
    y: num(o['@_y']),
    width: num(o['@_width']),
    height: num(o['@_height']),
    rotation: num(o['@_rotation']),
    visible: o['@_visible'] !== '0',
  };
  if (o['@_gid'] != null) out.gid = num(o['@_gid']);
  if (o.ellipse != null) out.ellipse = {};
  if (o.point != null) out.point = {};
  if (o.polygon?.polygon?.['@_points']) out.polygon = { points: parsePoints(o.polygon.polygon['@_points']) };
  if (o.polyline?.polyline?.['@_points']) out.polyline = { points: parsePoints(o.polyline.polyline['@_points']) };
  if (o.text != null) {
    out.text = { text: o.text['#text'] ?? '', ...o.text['@_'] };
  }
  const props = tiledProperties(o);
  if (props.length) out.properties = props;
  return out;
}

function parsePoints(text) {
  return String(text).trim().split(' ').filter(Boolean).map(pair => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
}

function convertLayer(layer) {
  const type = layer['@_type'] === 'objectgroup' ? 'objectgroup' : layer['@_type'] === 'imagelayer' ? 'imagelayer' : layer['@_type'] === 'group' ? 'group' : 'tilelayer';
  const out = {
    id: num(layer['@_id']),
    name: layer['@_name'] ?? '',
    type,
    x: num(layer['@_x']),
    y: num(layer['@_y']),
    width: num(layer['@_width']),
    height: num(layer['@_height']),
    opacity: num(layer['@_opacity'], 1),
    visible: layer['@_visible'] !== '0',
  };
  const props = tiledProperties(layer);
  if (props.length) out.properties = props;
  if (type === 'tilelayer') {
    const data = layer.data;
    if (data?.['@_encoding'] === 'csv') out.data = decodeCsv(data['#text']);
    else if (data?.['#text']) {
      throw new Error(`Layer "${out.name}" is not CSV. Export uncompressed CSV before conversion.`);
    } else out.data = [];
  } else if (type === 'objectgroup') {
    out.objects = arr(layer.objectgroup?.object).map(convertObject);
  } else if (type === 'group') {
    out.layers = arr(layer.layer).map(convertLayer);
  } else if (type === 'imagelayer') {
    const image = layer.image;
    if (image) out.image = image['@_source'];
  }
  return out;
}

async function readXml(file) {
  return parser.parse(await fs.readFile(file, 'utf8'));
}

async function copyImage(sourceFile, targetFile) {
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.copyFile(sourceFile, targetFile);
}

async function convertTileset(tsxFile, firstgid, mapDir) {
  const xml = await readXml(tsxFile);
  const root = xml.tileset;
  const image = root.image;
  const tiles = arr(root.tile).map(tile => {
    const t = { id: num(tile['@_id']) };
    const props = tiledProperties(tile);
    if (props.length) t.properties = props;
    if (tile.objectgroup) t.objectgroup = { objects: arr(tile.objectgroup.object).map(convertObject) };
    if (tile.image) {
      t.image = tile.image['@_source'];
      t.imagewidth = num(tile.image['@_width']);
      t.imageheight = num(tile.image['@_height']);
    }
    if (tile.animation) t.animation = arr(tile.animation.frame).map(f => ({ tileid: num(f['@_tileid']), duration: num(f['@_duration']) }));
    return t;
  });

  const out = {
    firstgid,
    name: root['@_name'] ?? path.basename(tsxFile, path.extname(tsxFile)),
    tilewidth: num(root['@_tilewidth'], 32),
    tileheight: num(root['@_tileheight'], 32),
    tilecount: num(root['@_tilecount']),
    columns: num(root['@_columns']),
    margin: num(root['@_margin']),
    spacing: num(root['@_spacing']),
  };
  if (root['@_objectalignment']) out.objectalignment = root['@_objectalignment'];
  if (root['@_backgroundcolor']) out.backgroundcolor = root['@_backgroundcolor'];
  const props = tiledProperties(root);
  if (props.length) out.properties = props;
  if (image) {
    const relative = image['@_source'];
    const absolute = path.resolve(path.dirname(tsxFile), relative);
    const target = path.join(imageRoot, path.basename(absolute));
    await copyImage(absolute, target);
    out.image = `tilesets/${path.basename(absolute)}`;
    out.imagewidth = num(image['@_width']);
    out.imageheight = num(image['@_height']);
  }
  if (tiles.length) out.tiles = tiles;
  return out;
}

async function main() {
  const mapXml = await readXml(mapFile);
  const map = mapXml.map;
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(imageRoot, { recursive: true });

  const tilesets = [];
  for (const ts of arr(map.tileset)) {
    const firstgid = num(ts['@_firstgid']);
    if (!ts['@_source']) throw new Error('Embedded tilesets are not expected in this source map.');
    const tsxFile = path.resolve(path.dirname(mapFile), ts['@_source']);
    tilesets.push(await convertTileset(tsxFile, firstgid, path.dirname(mapFile)));
  }

  const out = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.12.2',
    orientation: map['@_orientation'] ?? 'orthogonal',
    renderorder: map['@_renderorder'] ?? 'right-down',
    width: num(map['@_width']),
    height: num(map['@_height']),
    tilewidth: num(map['@_tilewidth']),
    tileheight: num(map['@_tileheight']),
    infinite: num(map['@_infinite']),
    nextlayerid: num(map['@_nextlayerid']),
    nextobjectid: num(map['@_nextobjectid']),
    properties: tiledProperties(map),
    layers: arr(map.layer).map(convertLayer),
    tilesets,
  };

  await fs.writeFile(path.resolve(outRelative), JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Converted ${mapRelative}`);
  console.log(`Output: ${path.resolve(outRelative)}`);
  console.log(`Map: ${out.width}x${out.height} @ ${out.tilewidth}x${out.tileheight}`);
  console.log(`Tilesets embedded: ${tilesets.length}`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
