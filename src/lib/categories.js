// src/lib/categories.js

// Every category, in the order it is shown.
export const CATEGORIES = [
  { key: 'groceries', label: 'Groceries' },
  { key: 'eating_out', label: 'Eating out' },
  { key: 'transport', label: 'Transport' },
  { key: 'bills', label: 'Bills' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'health', label: 'Health' },
  { key: 'income', label: 'Income' },
  { key: 'other', label: 'Other' },
];

// The shop names that belong to each category.
const SHOPS = {
  groceries: ['Greenbarrow Fresh', 'Pennywhistle Market', 'Lowtide Grocers', 'Harvest Lane Foods'],
  eating_out: ['Pasta, Pizza & Co', 'Kestrel Coffee Bar', 'Saltbush Noodle House', 'Ember Grill'],
  transport: ['Waverly Fuel Stop', 'Tramline Fares', 'Lantern Rideshare', 'Northgate Parking'],
  bills: ['Brightfield Power', 'Clearwater Utilities', 'Skyline Broadband', 'Hollis Insurance'],
  shopping: ['Marlowe Homewares', 'Quillon Books', 'Fernhill Outfitters', 'Pixel Parade Tech'],
  health: ['Larkspur Pharmacy', 'Elmgrove Physio', 'Cobalt Dental', 'Sunnyvale Optical'],
  income: ['Brightwave Payroll', 'Tidepool Interest', 'Oakridge Dividends'],
};

// Returns the key of the category whose shop name appears in the description,
// ignoring case. A description with no known shop is 'other'.
export function categoryOf(description) {
  const text = String(description).toLowerCase();
  for (const [key, shops] of Object.entries(SHOPS)) {
    if (shops.some((shop) => text.includes(shop.toLowerCase()))) {
      return key;
    }
  }
  return 'other';
}
