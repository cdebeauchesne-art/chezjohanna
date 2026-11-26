// Lit les calendriers Airbnb (iCal) et publie uniquement les dates occupées dans dispo.json.
// Aucune donnée voyageur n'est écrite : seulement des plages de dates.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const urls = JSON.parse(process.env.ICAL_URLS || '{}');
const out = { logements: {} };

const toIso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

for (const [key, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'chezjohanna-sync' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = (await res.text()).replace(/\r\n[ \t]/g, '');
    const ranges = [];
    for (const block of text.split('BEGIN:VEVENT').slice(1)) {
      const start = block.match(/DTSTART[^:]*:(\d{8})/);
      const end = block.match(/DTEND[^:]*:(\d{8})/);
      if (start && end) ranges.push([toIso(start[1]), toIso(end[1])]); // fin exclue (jour du départ libre)
    }
    ranges.sort((a, b) => a[0].localeCompare(b[0]));
    out.logements[key] = ranges;
  } catch (e) {
    console.error(`Échec pour ${key} : ${e.message}`);
    process.exitCode = 1;
  }
}

// On ne réécrit le fichier que si les dates ont changé (évite un commit toutes les 15 min).
const previous = existsSync('dispo.json') ? JSON.parse(readFileSync('dispo.json', 'utf8')) : null;
if (previous && JSON.stringify(previous.logements) === JSON.stringify(out.logements)) {
  console.log('Aucun changement.');
} else {
  out.majLe = new Date().toISOString();
  writeFileSync('dispo.json', JSON.stringify(out, null, 1) + '\n');
  console.log('dispo.json mis à jour.');
}
