import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createProduct, dayOf, inventoryMovement, labels, loadData, saleBatch, storageKey, summarize } from './stock.js';
import './style.css';

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = cents => euros.format(cents / 100);
const dateLabel = date => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(date);
const timeLabel = date => new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(date));
const tabs = ['Stock', 'Ventes', 'Bilan'];

function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState('Stock');
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState(null);
  const day = dayOf(now);
  const summary = summarize(data, day);
  const low = data.products.filter(product => (summary.quantities.get(product.id) ?? 0) <= product.threshold).length;

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15000);
    const sync = event => {
      if (event.key === storageKey && event.newValue) setData(JSON.parse(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => {
      clearInterval(tick);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function save(update, success) {
    try {
      const next = update(localStorage.getItem(storageKey) ? loadData() : data);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setData(next);
      setNow(new Date());
      setMessage({ text: success });
      return true;
    } catch (error) {
      setMessage({ text: error.message, error: true });
      return false;
    }
  }

  return <>
    <header className="site-header">
      <div className="shell header-inner">
        <div className="brand"><span className="brand-icon" aria-hidden="true">✦</span><span>Le Fournil<small>Gestion de stock</small></span></div>
        <nav aria-label="Navigation principale">
          {tabs.map(item => <button key={item} aria-current={tab === item ? 'page' : undefined}
            onClick={() => { setTab(item); setMessage(null); }}>{item}</button>)}
        </nav>
      </div>
    </header>
    <main className="shell">
      <div className="heading">
        <div><p className="date">{dateLabel(now)}</p><h1>{{ Stock: 'Stock disponible', Ventes: 'Enregistrer des ventes', Bilan: 'Bilan des ventes' }[tab]}</h1></div>
        {tab === 'Stock' && <button className="primary" onClick={() => { setTab('Ventes'); setMessage(null); }}>Enregistrer des ventes</button>}
      </div>
      {data.demo && <div className="demo">
        <span>Produits et stock de démonstration</span>
        <button className="text-button" onClick={() => {
          if (window.confirm('Effacer les données actuelles et démarrer avec un stock vide ?')) {
            save(() => ({ products: [], movements: [], demo: false }), 'Stock vide prêt à configurer.');
          }
        }}>Démarrer à vide</button>
      </div>}
      {message && <p className={message.error ? 'notice error' : 'notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      {tab === 'Stock' && <Stock data={data} summary={summary} low={low} save={save} />}
      {tab === 'Ventes' && <Sales key={day} data={data} summary={summary} save={save} />}
      {tab === 'Bilan' && <Report data={data} today={day} />}
    </main>
  </>;
}

function Metrics({ items }) {
  return <div className="metrics">{items.map(([label, value]) =>
    <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>
  )}</div>;
}

function Stock({ data, summary, low, save }) {
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);
  const visible = data.products.filter(product => product.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return <>
    <Metrics items={[['Références', data.products.length], ['Stocks bas ou épuisés', low], ['Ventes aujourd’hui', money(summary.revenue)]]} />
    <section className="panel">
      <div className="toolbar">
        <h2>Produits</h2>
        <input type="search" aria-label="Rechercher un produit" placeholder="Rechercher un produit" value={filter} onChange={event => setFilter(event.target.value)} />
        <button onClick={() => setForm({ type: 'product' })}>Ajouter un produit</button>
      </div>
      {form?.type === 'product' && <form className="inline-form" onSubmit={event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        if (save(state => createProduct(state, fields), 'Produit ajouté.')) setForm(null);
      }}>
        <label>Nom<input name="name" required maxLength="80" /></label>
        <label>Prix de vente (€)<input name="price" inputMode="decimal" placeholder="1,20" required /></label>
        <label>Seuil d’alerte<input name="threshold" type="number" min="0" max="999999" defaultValue="5" required /></label>
        <button className="primary">Ajouter</button><button type="button" onClick={() => setForm(null)}>Annuler</button>
      </form>}
      {form?.type === 'movement' && <MovementForm key={form.product.id} product={form.product} save={save} close={() => setForm(null)} />}
      {visible.length ? <div className="table-wrap"><table>
        <thead><tr><th>Produit</th><th>Prix</th><th>En stock</th><th>État</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{visible.map(product => {
          const quantity = summary.quantities.get(product.id) ?? 0;
          return <tr key={product.id}><th scope="row">{product.name}</th><td>{money(product.price)}</td><td className="number">{quantity}</td>
            <td><span className={'badge ' + (quantity <= product.threshold ? 'low' : '')}>{quantity === 0 ? 'Épuisé' : quantity <= product.threshold ? 'Stock bas' : 'Disponible'}</span></td>
            <td><button aria-label={'Ajuster le stock de ' + product.name} onClick={() => setForm({ type: 'movement', product })}>Ajuster</button></td></tr>;
        })}</tbody>
      </table></div> : <p className="empty">{filter ? 'Aucun produit trouvé.' : 'Ajoute un produit pour commencer.'}</p>}
    </section>
  </>;
}

function MovementForm({ product, save, close }) {
  const [type, setType] = useState('entry');
  return <form className="inline-form" onSubmit={event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('value');
    if (save(state => inventoryMovement(state, { productId: product.id, type, value }), 'Stock mis à jour.')) close();
  }}>
    <strong>{product.name}</strong>
    <label>Mouvement<select value={type} onChange={event => setType(event.target.value)}>
      <option value="entry">Entrée / fournée</option><option value="loss">Perte / invendu jeté</option><option value="adjustment">Correction d’inventaire</option>
    </select></label>
    <label>{type === 'adjustment' ? 'Quantité réellement en stock' : 'Quantité'}<input name="value" type="number" min={type === 'adjustment' ? 0 : 1} max="999999" required /></label>
    <button className="primary">Valider</button><button type="button" onClick={close}>Annuler</button>
  </form>;
}

function Sales({ data, summary, save }) {
  const [mode, setMode] = useState('additional');
  const [values, setValues] = useState({});
  const preview = data.products.reduce((total, product) => {
    const value = values[product.id];
    if (!value) return total;
    const sold = summary.sales.get(product.id)?.units ?? 0;
    const quantity = Number(value) - (mode === 'total' ? sold : 0);
    return total + Math.max(0, quantity) * product.price;
  }, 0);
  if (!data.products.length) return <p className="panel empty">Ajoute d’abord tes produits dans l’onglet Stock.</p>;
  return <form className="panel" onSubmit={event => {
    event.preventDefault();
    if (save(state => saleBatch(state, values, mode), 'Ventes enregistrées. Le stock a été mis à jour.')) setValues({});
  }}>
    <fieldset className="mode"><legend>Mode de saisie</legend>
      {[['additional', 'Au fil du service'], ['total', 'Total de la journée']].map(([id, title]) =>
        <label key={id}><input type="radio" name="mode" checked={mode === id} onChange={() => { setMode(id); setValues({}); }} />{title}</label>
      )}
    </fieldset>
    <p className="form-help">{mode === 'total'
      ? 'Saisis le total vendu par produit. Les quantités déjà enregistrées sont déduites automatiquement.'
      : 'Saisis les nouvelles quantités vendues depuis ta dernière saisie.'} Laisse les autres champs vides.</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Produit</th><th>Prix</th><th>En stock</th><th>Déjà vendu</th><th>{mode === 'total' ? 'Total vendu' : 'À ajouter'}</th></tr></thead>
      <tbody>{data.products.map(product => {
        const sold = summary.sales.get(product.id)?.units ?? 0;
        const stock = summary.quantities.get(product.id) ?? 0;
        return <tr key={product.id}><th scope="row">{product.name}</th><td>{money(product.price)}</td><td>{stock}</td><td>{sold}</td>
          <td><input className="quantity" type="number" inputMode="numeric" min={mode === 'total' ? sold : 0}
            max={Math.min(999999, stock + (mode === 'total' ? sold : 0))} step="1"
            aria-label={(mode === 'total' ? 'Total vendu : ' : 'Quantité à ajouter : ') + product.name}
            value={values[product.id] ?? ''} placeholder="—"
            onChange={event => setValues({ ...values, [product.id]: event.target.value })} /></td></tr>;
      })}</tbody>
    </table></div>
    <div className="toolbar sales-footer"><span>Montant à enregistrer <strong>{money(preview)}</strong></span><button className="primary">Valider les ventes</button></div>
  </form>;
}

function Report({ data, today }) {
  const [selected, setSelected] = useState('');
  const day = selected || today;
  const { sales, revenue, units, losses } = summarize(data, day);
  const productNames = new Map(data.products.map(product => [product.id, product.name]));
  const movements = data.movements.filter(movement => movement.day === day).reverse();
  return <>
    <div className="report-date"><label>Journée<input type="date" value={day} max={today} onChange={event => setSelected(event.target.value)} /></label></div>
    <Metrics items={[['Chiffre d’affaires', money(revenue)], ['Unités vendues', units], ['Unités perdues', losses]]} />
    <section className="panel">
      <div className="toolbar"><h2>Ventes par produit</h2></div>
      {sales.size ? <div className="table-wrap"><table>
        <thead><tr><th>Produit</th><th>Unités vendues</th><th>Chiffre d’affaires</th></tr></thead>
        <tbody>{[...sales].map(([id, sale]) => <tr key={id}><th scope="row">{productNames.get(id)}</th><td>{sale.units}</td><td>{money(sale.revenue)}</td></tr>)}</tbody>
      </table></div> : <p className="empty">Aucune vente enregistrée pour cette journée.</p>}
    </section>
    <section className="panel">
      <div className="toolbar"><h2>Mouvements de stock</h2></div>
      {movements.length ? <div className="table-wrap"><table>
        <thead><tr><th>Heure</th><th>Produit</th><th>Mouvement</th><th>Quantité</th></tr></thead>
        <tbody>{movements.map((movement, index) => <tr key={index}><td>{timeLabel(movement.time)}</td><th scope="row">{productNames.get(movement.productId)}</th><td>{labels[movement.type]}</td><td>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td></tr>)}</tbody>
      </table></div> : <p className="empty">Aucun mouvement pour cette journée.</p>}
    </section>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
