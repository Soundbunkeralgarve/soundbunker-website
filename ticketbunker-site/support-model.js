export const supportStatuses = Object.freeze({
  open: 'Open', waiting_customer: 'Your reply needed', waiting_supplier: 'With our team / supplier', resolved: 'Resolved'
});
export const supportCategories = Object.freeze({
  tickets: 'Tickets & admission', payment: 'Payment', refund: 'Refund or change',
  accessibility: 'Accessibility', organiser: 'Organiser help', general: 'General enquiry', complaint: 'Complaint'
});
export const refundStages = Object.freeze({
  requested: ['Request received', 'Your request is awaiting review. No refund payment has been issued.'],
  reviewing: ['Under review', 'We are checking this request. A refund has not yet been confirmed.'],
  approved: ['Approved', 'The request is approved. This does not yet confirm a payment has been returned.'],
  processing: ['Payment processing', 'The refund is being processed. Payment-provider confirmation is still pending.'],
  refunded: ['Refund confirmed', 'The payment provider has confirmed the refund. Your bank may take additional time to show it.'],
  declined: ['Decision available', 'Read the case reply for the reason and contact us here if you want the decision reviewed.']
});
export function refundPresentation(refund) {
  if (!refund) return null;
  const [title, description] = refundStages[refund.status] || ['Status being checked', 'Contact us in this case for the current refund position.'];
  return {title, description, confirmed: refund.status === 'refunded'};
}
export function sortSupportCases(cases = []) {
  return [...cases].sort((a,b) => {
    const resolved = Number(a.status === 'resolved') - Number(b.status === 'resolved');
    const urgent = Number(b.priority === 'urgent') - Number(a.priority === 'urgent');
    return resolved || urgent || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
  });
}
export function filterSupportCases(cases = [], {status = '', query = ''} = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  return sortSupportCases(cases.filter(item => (!status || item.status === status) &&
    (!search || [item.reference,item.subject,item.eventName,item.customerEmail].some(value => String(value || '').toLocaleLowerCase().includes(search)))));
}
export function supportCaseHref(id, admin = false) {
  return `${admin ? '/support-admin' : '/support'}?case=${encodeURIComponent(id)}`;
}
