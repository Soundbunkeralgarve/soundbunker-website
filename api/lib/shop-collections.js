// Explicit assignment of the uploaded catalogue. Unknown products stay unpublished
// until assigned, so a newly uploaded adult design cannot leak into the family shop.
export const collectionProducts = {
 standard: [475187578,422179281,413293723,413283381,413282240,413282118,413281983,413281652,413281449,413279423,413278892],
 slogans: [475033389,475033342,475033316,475033293,475033270,475033253,475033228,475033196,475033099,475032727,475032797,475032684,475032615,475032829,475032634,475032986,475032265,475032775,475033049,475032431],
 rave: [475187361,475187212,475185407,475185384,475185349,475185188,475185126,475185087,475185071,475184928],
 kids: [475184534,475184507,475184443,475184289,475184250,475183711,475181951,475181285,475181217,475181120],
 christmas: [475186347,475186223,475186142,475186071,475185948,475185873,475185852,475185759,475185686],
 'crude-city': [475188683,475188616,475188577,475188515,475188413,475188366,475188276,475188058,475187845]
};
// These seven exact supplier names are the new designs approved by the owner.
// Recognise colour/size suffixes on variants, but never publish arbitrary new names.
export function approvedCrudeDesign(name='') {
 return /^Unisex classic tee (SEX WORKER|ONLY FANS|LEGS|HORNY|GYNO|STD|DEEP)(?:\s*\/.*)?$/i.exec(String(name).trim())?.[1].toUpperCase() || null;
}
export function collectionFor(id, name='') {
 return Object.keys(collectionProducts).find(key=>collectionProducts[key].includes(Number(id))) || (approvedCrudeDesign(name) ? 'crude-city' : null);
}
export function visibleProduct(id, adult=false, name='') { const c=collectionFor(id,name);return Boolean(c && (c!=='crude-city'||adult)); }
export function displayProductTitle(id, name) {
 const design=approvedCrudeDesign(name);
 return productTitles[id] || (design ? `${design} · Crude City T-Shirt` : null);
}

export const productTitles={
475188683:'Go to Bed · Crude City T-Shirt',475188616:'Coke Head · Crude City T-Shirt',475188577:'Finger Dip · Crude City T-Shirt',475188515:'The Minivan · Crude City T-Shirt',475188413:'I’m Mixing · Crude City T-Shirt',475188366:'Horny Bitch · Crude City T-Shirt',475188276:'Horny Bastard · Crude City T-Shirt',475188058:'Rum & Bass · Crude City T-Shirt',475187845:'Sausage · Crude City T-Shirt',
475185188:'Show Me Your Bass Face T-Shirt',475185126:'Bassline Junkie T-Shirt',475185087:'Junglist T-Shirt',475185071:'Ravin’ n Misbehavin’ T-Shirt',475184928:'On Vinyl T-Shirt',
475185407:'Junglist Hoodie',475185384:'Bassline Junkie Hoodie',475185349:'Bass Face Hoodie',
475184534:'Record My Songs · Kids’ Hoodie',475184507:'Squishes, Not Records · Kids’ Hoodie',475184443:'Keep Calm · Kids’ Hoodie',475184289:'Singing & Chicken Nuggets · Kids’ T-Shirt',475184250:'Record My Songs · Kids’ T-Shirt',475183711:'Squishes, Not Records · Kids’ T-Shirt',475181951:'My Dad Is a DJ · Kids’ T-Shirt',475181285:'Bad Singing · Kids’ T-Shirt',475181217:'Keep Calm · Kids’ T-Shirt',475181120:'My First Real Loves · Kids’ T-Shirt',
475186347:'Jingle Beats · Kids’ Sweatshirt',475186223:'Sleigh the Mic · Kids’ Sweatshirt',475186142:'Fa La La Loud · Kids’ T-Shirt',475186071:'Santa’s Little Producer · Kids’ T-Shirt',475185948:'SoundBunker Christmas Sweatshirt',475185873:'More Gear · Christmas Sweatshirt',475185852:'Silent Night · Christmas Sweatshirt',475185759:'Waveform Tree · Christmas Sweatshirt',475185686:'Deck the Halls · Christmas Sweatshirt'
};

export const couplesComboIds=[475188276,475188366];
export function validateCouplesCombo(items){
 const counts=couplesComboIds.map(id=>items.filter(i=>Number(i.product_id)===id).reduce((n,i)=>n+i.quantity,0));
 if(counts[0]!==counts[1])throw new Error('Please select both shirts in the Crude City couples’ combo, with matching quantities.');
}
