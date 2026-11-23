// Discovery labels describe the activity being sold, not every word in its title.
// Generic tours, historic venue visits and food experiences stay under days out.
const fold = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const TRANSFER = /\b(?:transfers?|shuttles?|chauffeurs?|limos?|limousines?|private drivers?)\b/;
const ACTIVE_SPORT = /\b(?:surf(?:ing)?|windsurf(?:ing)?|kitesurf(?:ing)?|kayak(?:ing)?|canoe(?:ing)?|paddle\s?board(?:ing)?|stand[ -]up paddl(?:e|ing)|rafting|scuba|snorkel(?:ing|ling)?|canyoning|paragliding|bungee|climbing|abseiling|zip[ -]?lin(?:e|ing)|horseback riding|horse riding)\b/;
const BOAT = /\b(?:boats?|cruises?|catamarans?|yachts?|ferr(?:y|ies)|speedboats?|sail(?:ing|boats?)?|rib)\b/;
const FAMILY = /\b(?:kids?|children|child[ -]friendly|families|toddlers?|zoos?|aquariums?|oceanariums?|water parks?|theme parks?|amusement parks?|legoland)\b|\bfamily[ -](?:friendly|fun|tour|trip|experience|adventure|day|visit|activit(?:y|ies))\b|\b(?:meet|visit) santa\b|\bsanta(?:'s)? grotto\b/;
const SEASONAL = /\b(?:christmas|halloween|new year(?:'s)?(?: eve| day)?|easter|valentine(?:'s)?|bonfire night|hogmanay|oktoberfest)\b/;
const VENUE_TOUR = /\b(?:guided|walking|sightseeing|backstage|museum|stadium|arena|circuit|racecourse|opera house|theatre|theater)\b.*\b(?:tour|visit|walk)\b|\b(?:tour|visit)\b.*\b(?:museum|stadium|arena|circuit|racecourse|opera house|theatre|theater)\b|\b(?:museum|stadium|opera garnier|palais garnier|opera house)\b.*\b(?:entry|admission|access)\b/;
const MUSICAL = /\bmusicals?\b|\b(?:west end|broadway)\b.*\b(?:tickets?|shows?|performances?)\b|\b(?:the lion king|les miserables|mamma mia|wicked|hamilton)\b.*\b(?:tickets?|musical|theatre|theater|shows?|performances?)\b/;
const STAGE = /\b(?:cabaret|ballet|opera|theatre|theater)\b.*\b(?:tickets?|shows?|performances?|concerts?)\b|\b(?:tickets?|performances?)\b.*\b(?:cabaret|ballet|opera|theatre|theater)\b/;
const MUSIC = /\b(?:concerts?|gigs?|live music|live jazz)\b|\b(?:fado|flamenco)\b.*\b(?:shows?|performances?|concerts?|dinner)\b|\b(?:shows?|performances?|concerts?|dinner|live)\b.*\b(?:fado|flamenco)\b/;
const SPORT_EVENT = /\b(?:football|soccer|rugby|tennis|basketball|boxing)\b.*\b(?:match|tickets?|fight|game|tournament)\b|\b(?:formula[ -]?(?:1|one)|motogp|grand prix|horse rac(?:ing|es?)|race day)\b/;

export function limoSearchRelevant(title) {
  const text = fold(title);
  const primary = text.split(/\b(?:with|including)\b/)[0];
  return /\b(?:limos?|limousines?|chauffeurs?)\b/.test(text) || /\bprivate(?:\s+(?:airport|hotel|port|city|one[ -]way|return|round[ -]trip|luxury|vip|car|mini[ -]?van|van))*\s+transfers?\b/.test(primary);
}

export function listingCategory(title) {
  const text = fold(title);
  // A tour's included hotel transfer is not itself a transport booking.
  const primary = text.split(/\b(?:with|including)\b/)[0];
  if (/\b(?:chauffeurs?|limos?|limousines?|private drivers?)\b/.test(text) || TRANSFER.test(primary)) return 'transfer';
  if (ACTIVE_SPORT.test(text)) return 'sport';
  if (BOAT.test(text)) return 'boat';
  if (FAMILY.test(text)) return 'family';
  if (SEASONAL.test(text)) return 'seasonal';
  if (VENUE_TOUR.test(text)) return 'daysout';
  if (/\b(?:cinema tickets?|(?:film|movie) screenings?)\b/.test(text)) return 'cinema';
  if (/\b(?:comedy (?:clubs?|shows?|nights?|tickets?)|stand[ -]?up)\b/.test(text)) return 'comedy';
  if (/\b(?:festivals?)\b/.test(text)) return 'festival';
  // Musicals precede music; a musical is a stage production, not a generic gig.
  if (MUSICAL.test(text) || STAGE.test(text)) return 'shows';
  if (MUSIC.test(text)) return 'music';
  if (SPORT_EVENT.test(text)) return 'sport';
  if (/\b(?:pub crawls?|bar crawls?|club nights?|nightclubs?)\b/.test(text)) return 'club';
  return 'daysout';
}

// Awin's explicit merchant/product category is stronger evidence than title words.
// Broad mixed categories such as "Tours, Sightseeing & Cruises" remain days out.
export function metadataCategory(category) {
  const text = fold(category);
  if (TRANSFER.test(text)) return 'transfer';
  if (/\b(?:musicals?|theatre|theater|shows?|ballet|opera|cabaret)\b/.test(text)) return 'shows';
  if (/\b(?:comedy|stand[ -]?up)\b/.test(text)) return 'comedy';
  if (/\b(?:festivals?)\b/.test(text)) return 'festival';
  if (FAMILY.test(text) || /\bfamily\b/.test(text)) return 'family';
  if (SEASONAL.test(text)) return 'seasonal';
  if (/\b(?:cinema|film|movies?)\b/.test(text)) return 'cinema';
  if (/\b(?:tours?|sightseeing|attractions?|museums?|experiences?)\b/.test(text)) return BOAT.test(text) && !/\bsightseeing\b/.test(text) ? 'boat' : 'daysout';
  if (/\b(?:concerts?|gigs?|music)\b/.test(text)) return 'music';
  if (/\b(?:sports?|racing)\b/.test(text) || ACTIVE_SPORT.test(text)) return 'sport';
  if (/\b(?:clubbing|nightlife|nightclubs?|pub crawls?)\b/.test(text)) return 'club';
  if (BOAT.test(text)) return 'boat';
  return '';
}
