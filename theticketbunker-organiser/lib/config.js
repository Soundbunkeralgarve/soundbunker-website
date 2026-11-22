// Everything the app shows comes from the live site; its API proxies the ticket service.
export const SITE = 'https://theticketbunker.com';
export const siteUrl = path => /^https:\/\//.test(path) ? path : SITE + path;
