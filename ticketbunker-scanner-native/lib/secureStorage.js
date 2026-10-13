import * as SecureStore from 'expo-secure-store';
// iOS Keychain historically limits each stored value. Chunk session material
// into small encrypted entries; never send it to application logs or backups.
const keyOf=(key)=>'tbsc.'+String(key).replace(/[^a-zA-Z0-9._-]/g,'_');
const SIZE=1300, LIMIT=40;
export const secureSessionStorage={
 async getItem(key){
  const base=keyOf(key),meta=await SecureStore.getItemAsync(base+'.parts');
  if(!meta)return null;
  const n=Number(meta);
  if(!Number.isInteger(n)||n<1||n>LIMIT)return null;
  const values=[];
  for(let i=0;i<n;i++){const part=await SecureStore.getItemAsync(base+'.'+i);if(part===null)return null;values.push(part);}
  return values.join('');
 },
 async setItem(key,value){
  const base=keyOf(key),str=String(value),n=Math.ceil(str.length/SIZE);
  if(n<1||n>LIMIT)throw Error('Login session too large.');
  const previous=Number(await SecureStore.getItemAsync(base+'.parts'))||0;
  for(let i=0;i<n;i++)await SecureStore.setItemAsync(base+'.'+i,str.slice(i*SIZE,(i+1)*SIZE));
  await SecureStore.setItemAsync(base+'.parts',String(n));
  for(let i=n;i<Math.min(previous,LIMIT);i++)await SecureStore.deleteItemAsync(base+'.'+i);
 },
 async removeItem(key){
  const base=keyOf(key),n=Number(await SecureStore.getItemAsync(base+'.parts'))||0;
  await SecureStore.deleteItemAsync(base+'.parts');
  for(let i=0;i<Math.min(n,LIMIT);i++)await SecureStore.deleteItemAsync(base+'.'+i);
 }
};
