import {wireShare} from './event-share.js?v=20261124-adventures';
const data = document.getElementById('listing-data');
if (data) wireShare(document.querySelector('.social-share'), JSON.parse(data.textContent));
