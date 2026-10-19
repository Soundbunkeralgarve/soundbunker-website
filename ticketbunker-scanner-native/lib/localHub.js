import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import {createHubProtocol} from './hubProtocol';
import {createHubClient} from './hubClient';
import {secureSessionStorage} from './secureStorage';
import {deviceKey} from './offlineStore';
import {requestJson} from './request';
const digest=value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value);
export const localHub=createHubClient({
 storage:secureSessionStorage,protocol:createHubProtocol(nacl,n=>Crypto.getRandomBytes(n)),
 request:(url,body)=>requestJson(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},fetch,3000),
 randomId:()=>Crypto.randomUUID(),deviceIdentity:async()=>digest(await deviceKey()),digest
});
