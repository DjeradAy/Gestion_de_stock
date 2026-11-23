export const storageKey = 'le-fournil-v1';
export const labels = { entry: 'Entrée', sale: 'Vente', loss: 'Perte', adjustment: 'Inventaire' };

export function dayOf(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
}

export function initialData() {
  const products = [
    { id: 'baguette', name: 'Baguette tradition', price: 130, threshold: 15 },
    { id: 'croissant', name: 'Croissant', price: 120, threshold: 10 },
    { id: 'chocolat', name: 'Pain au chocolat', price: 150, threshold: 10 },
    { id: 'campagne', name: 'Pain de campagne', price: 380, threshold: 5 },
  ];
  const time = new Date().toISOString();
  const movements = [60, 40, 35, 4].map((quantity, index) => ({
    productId: products[index].id, quantity, type: 'entry', time, day: dayOf(),
  }));
  return { products, movements, demo: true };
}

export function loadData() {
  const saved = localStorage.getItem(storageKey);
  return saved ? JSON.parse(saved) : initialData();
}

export function summarize(data, day) {
  const quantities = new Map();
  const sales = new Map();
  let revenue = 0;
  let units = 0;
  let losses = 0;
  for (const movement of data.movements) {
    const { productId, quantity, type, price } = movement;
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    if (movement.day !== day) continue;
    if (type === 'loss') losses -= quantity;
    if (type !== 'sale') continue;
    const previous = sales.get(productId) ?? { units: 0, revenue: 0 };
    sales.set(productId, { units: previous.units - quantity, revenue: previous.revenue - quantity * price });
    units -= quantity;
    revenue -= quantity * price;
  }
  return { quantities, sales, revenue, units, losses };
}

export function integer(value, label, minimum = 0) {
  const parsed = Number(value);
  if (String(value).trim() === '' || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > 999999) {
    throw new Error(label + ' doit être un entier entre ' + minimum + ' et 999 999.');
  }
  return parsed;
}

export function saleBatch(data, input, mode, now = new Date()) {
  const day = dayOf(now);
  const summary = summarize(data, day);
  const batch = [];
  for (const product of data.products) {
    const value = input[product.id];
    if (value === undefined || value === '') continue;
    const entered = integer(value, product.name);
    const sold = summary.sales.get(product.id)?.units ?? 0;
    const quantity = mode === 'total' ? entered - sold : entered;
    if (quantity < 0) throw new Error(product.name + ' : le total est inférieur aux ventes déjà enregistrées.');
    if (quantity > (summary.quantities.get(product.id) ?? 0)) {
      throw new Error(product.name + ' : stock insuffisant.');
    }
    if (quantity > 0) {
      batch.push({ productId: product.id, quantity: -quantity, type: 'sale',
        price: product.price, day, time: now.toISOString() });
    }
  }
  if (!batch.length) throw new Error('Saisis au moins une nouvelle quantité vendue.');
  return { ...data, movements: [...data.movements, ...batch] };
}

export function inventoryMovement(data, { productId, type, value }, now = new Date()) {
  if (!data.products.some(product => product.id === productId)) throw new Error('Choisis un produit.');
  const day = dayOf(now);
  const stock = summarize(data, day).quantities.get(productId) ?? 0;
  const amount = integer(value, 'La quantité', type === 'adjustment' ? 0 : 1);
  const quantity = { entry: amount, loss: -amount, adjustment: amount - stock }[type];
  if (stock + quantity < 0) throw new Error('Stock insuffisant.');
  if (!quantity) throw new Error('Le stock est déjà à cette quantité.');
  return { ...data, movements: [...data.movements, { productId, type, quantity, day, time: now.toISOString() }] };
}

export function createProduct(data, { name, price, threshold }) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Saisis le nom du produit.');
  if (data.products.some(product => product.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Ce produit existe déjà.');
  }
  const normalized = price.trim().replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(normalized)) throw new Error('Saisis un prix valide en euros.');
  const product = { id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), name: trimmed,
    price: Math.round(Number(normalized) * 100), threshold: integer(threshold, 'Le seuil') };
  return { ...data, products: [...data.products, product] };
}
