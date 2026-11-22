// The app imports the website's own discovery, directions and trip modules from
// ../ticketbunker-site so the phone and the site always list and route the same way.
const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../ticketbunker-site')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
