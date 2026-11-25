// SPDX-License-Identifier: Apache-2.0
import {garageArray, garageInteger, garageRecord} from './garage-data.js';

export const CATALOG_REVISION = 1;
export const INITIAL_CREDITS = 2400;
export const MAX_CREDITS = 99999999;

// Presentation identifiers only. The showroom implements these in CO-013D.
// These are neither module paths nor physical vehicle recipes.
const visuals = Object.freeze({
  coupe:'starter-coupe-v1', compact:'compact-v1', 'grand-tourer':'grand-tourer-v1',
  muscle:'muscle-v1', pickup:'pickup-v1', 'sports-coupe':'sports-coupe-v1'
});
const keys = ['modelId', 'displayName', 'description', 'bodyStyle', 'finish',
  'purchasePrice', 'resalePolicy', 'visualModel', 'catalogRevision'];
function text(value, max, label) {
  if (typeof value !== 'string' || !value.length || value.length > max ||
      value.trim() !== value || /[^\x20-\x7e]|[<>]/.test(value)) {
    throw TypeError(label + ' must be bounded printable text');
  }
  return value;
}
function colour(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/.test(value)) {
    throw TypeError('Stock colours require lowercase six-digit RGB');
  }
  return value;
}

// Validation is for authored catalogue data. Calling it does not install models
// or extend save admission, which always uses the built-in revision below.
export function validateGarageCatalogue(value) {
  const ids = new Set(), names = new Set();
  const entries = garageArray(value, 6, 24, 'Catalogue').map(entry => {
    const data = garageRecord(entry, keys, 'Catalogue model');
    if (typeof data.modelId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(data.modelId) ||
        ids.has(data.modelId)) throw TypeError('Invalid or duplicate catalogue model ID');
    ids.add(data.modelId);
    const displayName = text(data.displayName, 48, 'Model name');
    if (names.has(displayName)) throw TypeError('Duplicate catalogue name');
    names.add(displayName);
    const description = text(data.description, 240, 'Model description');
    if (typeof data.bodyStyle !== 'string' || !Object.hasOwn(visuals, data.bodyStyle) ||
        data.visualModel !== visuals[data.bodyStyle]) throw TypeError('Unsupported cosmetic body model');
    if (data.catalogRevision !== CATALOG_REVISION || data.resalePolicy !== 'stock-60-v1') {
      throw TypeError('Unsupported catalogue revision or resale policy');
    }
    const finish = garageRecord(data.finish, ['name', 'body', 'accent'], 'Stock finish');
    const acceptedFinish = Object.freeze({name:text(finish.name, 48, 'Finish name'),
      body:colour(finish.body), accent:colour(finish.accent)});
    return Object.freeze({modelId:data.modelId, displayName, description, bodyStyle:data.bodyStyle,
      finish:acceptedFinish, purchasePrice:garageInteger(data.purchasePrice, 1, MAX_CREDITS, 'Price'),
      resalePolicy:data.resalePolicy, visualModel:data.visualModel, catalogRevision:CATALOG_REVISION});
  });
  if (!entries.some(model => model.purchasePrice <= INITIAL_CREDITS)) {
    throw RangeError('Catalogue requires an affordable starter');
  }
  return Object.freeze(entries);
}

export const GARAGE_CATALOG = validateGarageCatalogue([
  {modelId:'cinder-two', displayName:'Cinder Two',
    description:'A modest two-door coupe with a square nose, cream roof and twin inset lamps.',
    bodyStyle:'coupe', finish:{name:'Kiln Red', body:'#ad4538', accent:'#e4d9b5'},
    purchasePrice:600, resalePolicy:'stock-60-v1', visualModel:'starter-coupe-v1', catalogRevision:1},
  {modelId:'lilt', displayName:'Lilt',
    description:'A short hatchback silhouette with an upright tail, narrow grille and bright belt stripe.',
    bodyStyle:'compact', finish:{name:'Mint Wire', body:'#66ad94', accent:'#e8edcc'},
    purchasePrice:900, resalePolicy:'stock-60-v1', visualModel:'compact-v1', catalogRevision:1},
  {modelId:'evening-line', displayName:'Evening Line',
    description:'A long grand-tourer shape with a sweeping roof, slim lamps and a copper side band.',
    bodyStyle:'grand-tourer', finish:{name:'Deep Hour', body:'#394e70', accent:'#d39a65'},
    purchasePrice:1400, resalePolicy:'stock-60-v1', visualModel:'grand-tourer-v1', catalogRevision:1},
  {modelId:'rivet-eight', displayName:'Rivet Eight',
    description:'A broad muscle-car silhouette with a raised bonnet centre and paired graphite stripes.',
    bodyStyle:'muscle', finish:{name:'Furnace Ochre', body:'#cf9439', accent:'#34363b'},
    purchasePrice:1800, resalePolicy:'stock-60-v1', visualModel:'muscle-v1', catalogRevision:1},
  {modelId:'yardhand', displayName:'Yardhand',
    description:'A square-cab pickup with an open load bed, pale tailgate and simple work-lamp housings.',
    bodyStyle:'pickup', finish:{name:'Workshop Teal', body:'#367d85', accent:'#c9d6cf'},
    purchasePrice:1200, resalePolicy:'stock-60-v1', visualModel:'pickup-v1', catalogRevision:1},
  {modelId:'glass-comet', displayName:'Glass Comet',
    description:'A premium sports-coupe shape with a low wedge nose, broad glass canopy and split tail lamps.',
    bodyStyle:'sports-coupe', finish:{name:'Violet Current', body:'#79579e', accent:'#d0d9e8'},
    purchasePrice:2400, resalePolicy:'stock-60-v1', visualModel:'sports-coupe-v1', catalogRevision:1}
]);

export function garageModel(modelId) {
  const model = GARAGE_CATALOG.find(entry => entry.modelId === modelId);
  if (!model) throw RangeError('Unknown garage model');
  return model;
}
