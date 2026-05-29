// Rule-based food-wine pairing engine

const PAIRING_RULES = [
  {
    keywords: ['boeuf','steak','côte','bifteck','hamburger','agneau','gibier','canard','cerf','caribou','wapiti','magret'],
    styles: ['Cabernet Sauvignon','Merlot','Syrah','Shiraz','Malbec','Barolo','Amarone','Nebbiolo','Bordeaux','Cahors'],
    regions: ['Bordeaux','Napa Valley','Mendoza','Toscane','Rhône','Languedoc'],
    grapes: ['Cabernet Sauvignon','Merlot','Syrah','Malbec','Nebbiolo','Sangiovese'],
    tip: 'Vins rouges corsés et tanniques pour les viandes rouges'
  },
  {
    keywords: ['poulet','volaille','dinde','veau','porc','côtelette','lapin'],
    styles: ['Chardonnay','Pinot Noir','Viognier','Côtes du Rhône','Beaujolais'],
    regions: ['Bourgogne','Alsace','Loire','Beaujolais'],
    grapes: ['Chardonnay','Pinot Noir','Gamay','Viognier'],
    tip: 'Vins rouges légers ou blancs avec du corps pour les viandes blanches'
  },
  {
    keywords: ['poisson','saumon','truite','morue','sole','tilapia','thon','espadon'],
    styles: ['Sauvignon Blanc','Chablis','Muscadet','Pinot Grigio','Albariño'],
    regions: ['Bourgogne','Loire','Alsace','Bordeaux Blanc'],
    grapes: ['Sauvignon Blanc','Chardonnay','Pinot Gris','Albariño','Riesling'],
    tip: 'Blancs frais et minéraux avec les poissons'
  },
  {
    keywords: ['fruits de mer','crevettes','homard','crabe','pétoncles','huîtres','moules','palourdes'],
    styles: ['Muscadet','Chablis','Champagne','Sancerre','Sauvignon Blanc'],
    regions: ['Loire','Bourgogne','Champagne','Bordeaux'],
    grapes: ['Sauvignon Blanc','Chardonnay','Muscadet','Pinot Blanc'],
    tip: 'Blancs vifs et minéraux ou bulles pour les fruits de mer'
  },
  {
    keywords: ['pâtes','pizza','lasagne','risotto','tomate','sauce','bolognaise'],
    styles: ['Chianti','Barbera','Sangiovese','Dolcetto','Montepulciano'],
    regions: ['Toscane','Piémont','Sicile'],
    grapes: ['Sangiovese','Barbera','Dolcetto','Montepulciano'],
    tip: 'Vins italiens pour les plats italiens — l\'acidité équilibre la tomate'
  },
  {
    keywords: ['fromage','chèvre','brie','camembert','gruyère','comté','parmesan','bleu','roquefort'],
    styles: ['Sancerre','Pouilly-Fumé','Sauternes','Porto','Gewurztraminer'],
    regions: ['Loire','Bordeaux','Alsace'],
    grapes: ['Sauvignon Blanc','Gewurztraminer','Riesling','Chenin Blanc'],
    tip: 'Le mariage classique : fromage de chèvre et Sauvignon Blanc; fromages forts et vins doux'
  },
  {
    keywords: ['chocolat','dessert','gâteau','tarte','crème brûlée','mousse'],
    styles: ['Sauternes','Banyuls','Porto','Muscat','Amarone'],
    regions: ['Bordeaux','Roussillon','Porto','Alsace'],
    grapes: ['Sémillon','Muscadelle','Muscat','Grenache'],
    tip: 'Vins doux naturels ou liquoreux pour les desserts'
  },
  {
    keywords: ['végétarien','végétalien','légumes','salade','quinoa','tofu','lentilles'],
    styles: ['Pinot Noir','Grenache','Sauvignon Blanc','Riesling','Rosé'],
    regions: ['Bourgogne','Provence','Alsace','Loire'],
    grapes: ['Pinot Noir','Grenache','Sauvignon Blanc','Riesling'],
    tip: 'Vins légers, rouges peu tanniques ou blancs aromatiques pour les plats végétariens'
  },
  {
    keywords: ['épicé','indien','thai','mexicain','cari','curry','piment','sriracha'],
    styles: ['Gewurztraminer','Riesling demi-sec','Rosé','Grenache'],
    regions: ['Alsace','Allemagne','Provence'],
    grapes: ['Gewurztraminer','Riesling','Pinot Gris'],
    tip: 'Vins légèrement sucrés pour équilibrer le piquant des plats épicés'
  },
  {
    keywords: ['charcuterie','jambon','prosciutto','saucisse','pâté','terrine'],
    styles: ['Beaujolais','Pinot Noir','Gamay','Rosé','Grenache'],
    regions: ['Beaujolais','Bourgogne','Loire','Provence'],
    grapes: ['Gamay','Pinot Noir','Grenache'],
    tip: 'Vins fruités et peu tanniques avec la charcuterie'
  }
];

function findPairings(meal, cellarWines) {
  const mealLower = meal.toLowerCase();
  let matchedRule = null;
  let bestScore = 0;

  for (const rule of PAIRING_RULES) {
    const score = rule.keywords.filter(k => mealLower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      matchedRule = rule;
    }
  }

  if (!matchedRule) {
    return {
      tip: 'Essayez un vin polyvalent comme un Pinot Noir ou un Chardonnay.',
      cellarMatches: [],
      suggestedStyles: ['Pinot Noir', 'Chardonnay', 'Rosé'],
      rule: null
    };
  }

  // Score cellar wines against matched rule
  const scored = cellarWines
    .filter(w => w.quantity > 0)
    .map(w => {
      let score = 0;
      const wineName = (w.name || '').toLowerCase();
      const wineGrape = (w.grape || '').toLowerCase();
      const wineRegion = (w.region || '').toLowerCase();

      for (const style of matchedRule.styles) {
        if (wineName.includes(style.toLowerCase()) || wineGrape.toLowerCase() === style.toLowerCase()) score += 3;
      }
      for (const grape of matchedRule.grapes) {
        if (wineGrape === grape.toLowerCase() || wineName.includes(grape.toLowerCase())) score += 2;
      }
      for (const region of matchedRule.regions) {
        if (wineRegion.includes(region.toLowerCase())) score += 1;
      }
      return { wine: w, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    tip: matchedRule.tip,
    cellarMatches: scored,
    suggestedStyles: matchedRule.styles.slice(0, 4),
    suggestedRegions: matchedRule.regions.slice(0, 3),
    rule: matchedRule
  };
}

function generateCellarInsights(wines) {
  const insights = [];
  const regions = {};
  const grapes = {};
  const types = { rouge: 0, blanc: 0, rosé: 0, bulles: 0, autre: 0 };
  let totalBottles = 0;

  for (const w of wines) {
    const qty = w.quantity || 0;
    totalBottles += qty;
    const r = (w.region || 'Inconnue').toLowerCase();
    const g = (w.grape || 'Inconnu').toLowerCase();
    regions[r] = (regions[r] || 0) + qty;
    grapes[g] = (grapes[g] || 0) + qty;

    const type = (w.type || '').toLowerCase();
    if (type.includes('rouge')) types.rouge += qty;
    else if (type.includes('blanc')) types.blanc += qty;
    else if (type.includes('rosé') || type.includes('rose')) types.rosé += qty;
    else if (type.includes('mousseux') || type.includes('champagne') || type.includes('crémant')) types.bulles += qty;
    else types.autre += qty;
  }

  if (totalBottles === 0) {
    return [{ icon: '🍾', text: 'Votre cellier est vide — commencez par ajouter des bouteilles!' }];
  }

  // Type balance
  if (types.blanc === 0) insights.push({ icon: '🥂', text: 'Aucun vin blanc — pensez à en ajouter pour la polyvalence.' });
  if (types.rosé === 0) insights.push({ icon: '🌸', text: 'Aucun rosé — idéal pour l\'été et les repas légers.' });
  if (types.bulles === 0) insights.push({ icon: '✨', text: 'Aucun vin mousseux — parfait pour les célébrations!' });
  if (types.rouge > totalBottles * 0.8) insights.push({ icon: '⚖️', text: 'Cellier très dominé par les rouges — diversifiez avec des blancs.' });

  // Region diversity
  const uniqueRegions = Object.keys(regions).filter(r => r !== 'inconnue');
  if (uniqueRegions.length < 3 && wines.length > 5) {
    insights.push({ icon: '🗺️', text: 'Peu de diversité régionale — explorez de nouvelles appellations.' });
  }
  if (!uniqueRegions.some(r => r.includes('bourgogne') || r.includes('burgundy'))) {
    insights.push({ icon: '🏆', text: 'Pas de Bourgogne — une référence incontournable à découvrir.' });
  }
  if (!uniqueRegions.some(r => r.includes('alsace'))) {
    insights.push({ icon: '🌿', text: 'Pas d\'Alsace — des blancs aromatiques exceptionnels vous attendent.' });
  }

  // Vintage analysis
  const currentYear = new Date().getFullYear();
  const hasOldVintages = wines.some(w => w.vintage && (currentYear - parseInt(w.vintage)) > 10);
  const hasYoungWines = wines.some(w => w.vintage && (currentYear - parseInt(w.vintage)) < 3);
  if (!hasOldVintages) insights.push({ icon: '⏳', text: 'Aucun vin de plus de 10 ans — pensez à quelques bouteilles de garde.' });
  if (!hasYoungWines) insights.push({ icon: '🌱', text: 'Aucun vin récent — ajoutez des millésimes jeunes pour varier.' });

  if (insights.length === 0) {
    insights.push({ icon: '🎉', text: 'Cellier bien équilibré — continuez comme ça!' });
    insights.push({ icon: '📈', text: `${totalBottles} bouteilles en cave, ${uniqueRegions.length} régions représentées.` });
  }

  return insights.slice(0, 5);
}

window.Pairing = { findPairings, generateCellarInsights };
