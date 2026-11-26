// Chez Johanna — calendrier de disponibilité et demande de réservation.
// Les dates prises viennent de dispo.json (synchronisé depuis Airbnb), les prix de prix.json.
(() => {
  const root = document.querySelector('[data-logement]');
  if (!root) return;
  const key = root.dataset.logement;
  const $ = s => root.querySelector(s);
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS = ['L','M','M','J','V','S','D'];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = s => parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const eur = n => n.toLocaleString('fr-FR') + ' €';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let busy = new Set(), prix = null, majLe = null;
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let arr = null, dep = null;

  const nuitPrix = d => {
    const s = iso(d);
    const p = (prix.periodes || []).find(p => s >= p.du && s < p.au);
    if (p) return { prix: p.nuit, nom: p.nom };
    return { prix: prix.nuit, nom: null };
  };
  const isBusy = d => busy.has(iso(d));
  const rangeFree = (a, b) => { for (let d = parse(a); iso(d) < b; d = addDays(d, 1)) if (isBusy(d)) return false; return true; };

  function render() {
    const cal = $('.cal-grid');
    const y = view.getFullYear(), m = view.getMonth();
    $('.cal-title').textContent = `${MOIS[m]} ${y}`;
    $('.cal-prev').disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    let html = JOURS.map(j => `<span class="cal-dow" aria-hidden="true">${j}</span>`).join('');
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) html += '<span></span>';
    const days = new Date(y, m + 1, 0).getDate();
    for (let n = 1; n <= days; n++) {
      const d = new Date(y, m, n), s = iso(d);
      const past = d < today;
      // Un jour pris peut quand même servir de jour de départ (le voyageur suivant arrive l'après-midi).
      const canDepart = arr && !dep && s > arr && rangeFree(arr, s);
      const disabled = past || (isBusy(d) && !canDepart);
      const cls = ['cal-day'];
      if (isBusy(d)) cls.push('is-busy');
      if (s === arr || s === dep) cls.push('is-sel');
      if (arr && dep && s > arr && s < dep) cls.push('is-range');
      html += `<button type="button" class="${cls.join(' ')}" data-d="${s}" ${disabled ? 'disabled' : ''} aria-label="${n} ${MOIS[m]} ${y}${isBusy(d) ? ', indisponible' : ''}">${n}</button>`;
    }
    cal.innerHTML = html;
    summary();
  }

  function pick(s) {
    if (!arr || dep || s <= arr) { arr = s; dep = null; }
    else if (rangeFree(arr, s)) { dep = s; }
    else { arr = s; dep = null; }
    render();
  }

  function summary() {
    const lines = $('.lines'), btn = $('.btn-demande'), msg = $('.cal-msg');
    $('.d-arr').value = arr ? fmt(arr) : '';
    $('.d-dep').value = dep ? fmt(dep) : '';
    btn.disabled = true; lines.innerHTML = ''; msg.textContent = '';
    if (!arr) { msg.textContent = 'Choisissez votre date d’arrivée.'; updateBar(); return; }
    if (!dep) { msg.textContent = 'Choisissez votre date de départ.'; updateBar(); return; }
    const nights = Math.round((parse(dep) - parse(arr)) / 864e5);
    if (nights < (prix.minNuits || 1)) { msg.textContent = `Minimum ${prix.minNuits} nuits pour ce logement.`; updateBar(); return; }
    let total = 0, surDemande = null;
    for (let d = parse(arr); iso(d) < dep; d = addDays(d, 1)) {
      const p = nuitPrix(d);
      if (p.prix == null) { surDemande = p.nom || 'ces dates'; break; }
      total += p.prix;
    }
    if (surDemande) {
      lines.innerHTML = `<dt>${nights} nuits</dt><dd>sur demande</dd>`;
      msg.textContent = `Tarif ${surDemande} sur demande : envoyez votre demande, nous vous répondons avec un prix.`;
    } else {
      const menage = prix.menage || 0;
      lines.innerHTML = `<dt>${nights} nuits</dt><dd>${eur(total)}</dd>`
        + (menage ? `<dt>Ménage</dt><dd>${eur(menage)}</dd>` : '')
        + `<dt>Taxe de séjour</dt><dd>[À CALCULER]</dd>`
        + `<dt class="tot">Total</dt><dd class="tot">${eur(total + menage)}</dd>`;
    }
    btn.disabled = false;
    updateBar(surDemande ? null : total + (prix.menage || 0), nights);
  }

  function updateBar(total, nights) {
    const bar = document.querySelector('.sticky-bar p');
    if (!bar) return;
    bar.innerHTML = total
      ? `<strong>${eur(total)}</strong><br><span class="muted">${nights} nuits · ménage inclus</span>`
      : `<strong>${prix && prix.nuit ? 'Dès ' + eur(prix.nuit) + ' / nuit' : 'Prix sur demande'}</strong><br><span class="muted">Choisissez vos dates</span>`;
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('.cal-day');
    if (b && !b.disabled) pick(b.dataset.d);
    if (e.target.closest('.cal-prev')) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); }
    if (e.target.closest('.cal-next')) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); }
    if (e.target.closest('.cal-reset')) { arr = dep = null; render(); }
    if (e.target.closest('.btn-demande')) {
      // Le paiement Stripe (pré-autorisation) sera branché ici.
      $('.demande-ok').hidden = false;
      $('.demande-ok').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  Promise.all([
    fetch('dispo.json?' + Date.now()).then(r => r.json()).catch(() => ({ logements: {} })),
    fetch('prix.json?' + Date.now()).then(r => r.json())
  ]).then(([dispo, p]) => {
    prix = p[key];
    majLe = dispo.majLe;
    for (const [a, b] of (dispo.logements[key] || []))
      for (let d = parse(a); iso(d) < b; d = addDays(d, 1)) busy.add(iso(d));
    const from = $('.price strong');
    if (from) from.textContent = prix.nuit ? eur(prix.nuit) : 'Sur demande';
    $('.d-voy').max = prix.voyageursMax;
    $('.cal-maj').textContent = majLe
      ? `Disponibilités mises à jour le ${new Date(majLe).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
      : 'Synchronisation avec Airbnb en cours d’activation';
    render();
  });
})();
