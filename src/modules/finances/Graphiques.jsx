import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Filler, Legend } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { compact, moisCourt, fcfa } from '../../lib/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Filler, Legend);
ChartJS.defaults.font.family = "'Outfit', system-ui, sans-serif";
ChartJS.defaults.color = '#5B6B86';

const tooltip = { backgroundColor: '#0B2A66', padding: 10, cornerRadius: 10, titleFont: { weight: '600' }, callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ' : ' : ''}${fcfa(c.parsed.y ?? c.parsed)}` } };
const axes = {
  x: { grid: { display: false }, border: { display: false } },
  y: { grid: { color: '#E6ECF5' }, border: { display: false }, ticks: { callback: (v) => compact(v), maxTicksLimit: 5 } },
};

export function BarresMois({ donnees, hauteur = 190 }) {
  return (
    <div style={{ height: hauteur }}>
      <Bar
        data={{
          labels: donnees.map((d) => moisCourt(d.ym)),
          datasets: [
            { label: 'Recettes', data: donnees.map((d) => d.recettes), backgroundColor: '#1F5FD6', borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
            { label: 'Dépenses', data: donnees.map((d) => d.depenses), backgroundColor: '#F4B42A', borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
          ],
        }}
        options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip }, scales: axes, animation: { duration: 500 } }}
      />
    </div>
  );
}

export function LigneSolde({ donnees, hauteur = 160 }) {
  return (
    <div style={{ height: hauteur }}>
      <Line
        data={{
          labels: donnees.map((d) => moisCourt(d.ym)),
          datasets: [{ label: 'Solde', data: donnees.map((d) => d.cumul), borderColor: '#1F5FD6', backgroundColor: 'rgba(31,95,214,.10)', fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2 }],
        }}
        options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip }, scales: axes }}
      />
    </div>
  );
}

const PALETTE = ['#1F5FD6', '#F4B42A', '#0E9F6E', '#7A4FD6', '#D9475A', '#2D8CF0', '#C98A06', '#5B6B86', '#94A3B8'];
export function Anneau({ items, hauteur = 170 }) {
  const top = items.slice(0, 6);
  const reste = items.slice(6).reduce((s, i) => s + i.total, 0);
  const data = reste ? [...top, { categorie: { nom: 'Autres' }, total: reste }] : top;
  const somme = data.reduce((s, i) => s + i.total, 0) || 1;
  return (
    <div className="anneau">
      <div style={{ height: hauteur, width: hauteur }}>
        <Doughnut
          data={{ labels: data.map((d) => d.categorie?.nom || '—'), datasets: [{ data: data.map((d) => d.total), backgroundColor: PALETTE, borderWidth: 0, cutout: '68%' }] }}
          options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${fcfa(c.parsed)}` } } } }}
        />
      </div>
      <ul className="legende">
        {data.map((d, i) => (
          <li key={i}><i style={{ background: PALETTE[i] }} /><span>{d.categorie?.nom || '—'}</span><b>{Math.round((d.total / somme) * 100)} %</b></li>
        ))}
      </ul>
    </div>
  );
}
