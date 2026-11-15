// tests/categories.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, categoryOf } from '../src/lib/categories.js';

const SHOPS = {
  groceries: ['Greenbarrow Fresh', 'Pennywhistle Market', 'Lowtide Grocers', 'Harvest Lane Foods'],
  eating_out: ['Pasta, Pizza & Co', 'Kestrel Coffee Bar', 'Saltbush Noodle House', 'Ember Grill'],
  transport: ['Waverly Fuel Stop', 'Tramline Fares', 'Lantern Rideshare', 'Northgate Parking'],
  bills: ['Brightfield Power', 'Clearwater Utilities', 'Skyline Broadband', 'Hollis Insurance'],
  shopping: ['Marlowe Homewares', 'Quillon Books', 'Fernhill Outfitters', 'Pixel Parade Tech'],
  health: ['Larkspur Pharmacy', 'Elmgrove Physio', 'Cobalt Dental', 'Sunnyvale Optical'],
  income: ['Brightwave Payroll', 'Tidepool Interest', 'Oakridge Dividends'],
};

test('each listed shop name, in a sample description, gives its category', () => {
  for (const [key, shops] of Object.entries(SHOPS)) {
    for (const shop of shops) {
      assert.equal(categoryOf(`CARD PURCHASE ${shop} 1234`), key, shop);
    }
  }
});

test('the match ignores case', () => {
  assert.equal(categoryOf('POS GREENBARROW FRESH'), 'groceries');
  assert.equal(categoryOf('pasta, pizza & co 12/03'), 'eating_out');
});

test('a description with no shop gives other', () => {
  assert.equal(categoryOf('Unknown merchant 1234'), 'other');
  assert.equal(categoryOf(''), 'other');
});

test('every category key has a label', () => {
  for (const key of [...Object.keys(SHOPS), 'other']) {
    const category = CATEGORIES.find((c) => c.key === key);
    assert.ok(category, `no category for ${key}`);
    assert.ok(category.label.length > 0, `no label for ${key}`);
  }
});
