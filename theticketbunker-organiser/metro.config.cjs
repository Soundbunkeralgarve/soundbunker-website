// Watch the shared pricing and pure venue-time conversion used by the website/API.
const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../ticketbunker-site'), path.resolve(__dirname, '../api/lib')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
