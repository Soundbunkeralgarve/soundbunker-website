import { json } from './lib/http.js';
import { invoiceDB } from './lib/invoice-journal.js';
import { authorisedDeliveryCron, reconcileClientDeliveryFolders, dispatchClientDeliveryNotifications } from './lib/client-delivery-notifications.js';

export const config = { maxDuration: 300 };
export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, { error: 'Method not allowed' },405);
  if (!authorisedDeliveryCron(request.headers.authorization,process.env.CRON_SECRET)) return json(response,{error:'Unauthorized'},401);
  try {
    const deadline = Date.now()+250000;
    const admin = invoiceDB();
    const folders = await reconcileClientDeliveryFolders({ admin });
    const notifications = await dispatchClientDeliveryNotifications({ admin, deadline });
    return json(response,{...folders,notifications});
  } catch (error) {
    console.error('Client delivery reconciliation failed', { message: String(error.message).slice(0,300) });
    return json(response,{error:'Client delivery reconciliation is temporarily unavailable'},503);
  }
}
