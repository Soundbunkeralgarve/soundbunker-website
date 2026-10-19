const {withAndroidManifest,withInfoPlist}=require('expo/config-plugins');
module.exports=function withLocalHub(config){
 config=withInfoPlist(config,mod=>{
  mod.modResults.NSLocalNetworkUsageDescription='Connect to your event’s TicketBunker check-in hub over local Wi-Fi to validate tickets without internet.';
  const ats=mod.modResults.NSAppTransportSecurity||{};
  ats.NSAllowsArbitraryLoads=false;ats.NSAllowsLocalNetworking=true;
  ats.NSExceptionDomains={...ats.NSExceptionDomains};
  for(const range of ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'])ats.NSExceptionDomains[range]={NSExceptionAllowsInsecureHTTPLoads:true};
  mod.modResults.NSAppTransportSecurity=ats;return mod;
 });
 return withAndroidManifest(config,mod=>{
  const app=mod.modResults.manifest.application[0];app.$['android:usesCleartextTraffic']='true';return mod;
 });
};
