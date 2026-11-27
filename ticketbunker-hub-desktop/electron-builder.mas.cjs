// Explicit Mac App Store build. The normal DMG/Windows release configuration stays separate.
const base=require('./package.json').build;
const sandbox={hardenedRuntime:false,entitlements:'entitlements.mas.plist',entitlementsInherit:'entitlements.mas.inherit.plist'};
module.exports={
 ...base,
 forceCodeSigning:true,
 files:base.files.filter(file=>file!=='mac-network.cjs'),
 mac:{...base.mac,target:[{target:'mas',arch:['arm64','x64']}],notarize:false},
 mas:{...sandbox},
 masDev:{...sandbox}
};
