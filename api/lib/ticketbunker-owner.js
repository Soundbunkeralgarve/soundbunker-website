export function activeClientDiscount(control,now=Date.now()){
 return control&&(!control.valid_until||Date.parse(control.valid_until)>now)?Number(control.listing_discount_percent||0):0;
}
export async function clientControl(db,organiserId){
 const r=await db.from('tb_client_controls').select('listing_discount_percent,valid_until,reason').eq('organiser_id',organiserId).maybeSingle();if(r.error)throw r.error;return r.data;
}
export async function ownerClients(db){
 const r=await db.from('sb_event_organisers').select('id,owner_user_id,display_name,country_code,status,tax_review_complete,stripe_capabilities_ready,created_at').order('created_at',{ascending:false}).limit(500);if(r.error)throw r.error;
 const ids=r.data.map(v=>v.owner_user_id),orgIds=r.data.map(v=>v.id);
 const [profiles,controls,events,billing]=await Promise.all([
 ids.length?db.from('profiles').select('id,email,full_name').in('id',ids):{data:[]},
 orgIds.length?db.from('tb_client_controls').select('*').in('organiser_id',orgIds):{data:[]},
 orgIds.length?db.from('sb_events').select('id,organiser_profile_id,title,slug,status,starts_at').in('organiser_profile_id',orgIds).order('starts_at',{ascending:false}).limit(1000):{data:[]},
 orgIds.length?db.from('tb_organiser_billing').select('organiser_profile_id,legal_name,entity_type,vat_number,billing_email,address_line_1,address_line_2,city,postal_code').in('organiser_profile_id',orgIds):{data:[]}
 ]);if(profiles.error||controls.error||events.error||billing.error)throw Error('Could not load organiser records');
 return r.data.map(c=>({...c,billing:billing.data.find(b=>b.organiser_profile_id===c.id)||null,owner:profiles.data.find(p=>p.id===c.owner_user_id)||{},control:controls.data.find(p=>p.organiser_id===c.id)||null,events:events.data.filter(e=>e.organiser_profile_id===c.id)}));
}
