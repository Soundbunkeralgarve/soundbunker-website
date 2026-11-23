import {wireShare} from './event-share.js?v=20261123';
const data = document.getElementById('listing-data');
if (data) wireShare(document.querySelector('.social-share'), JSON.parse(data.textContent));
