import {Alert,PermissionsAndroid,Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {beginAttempt,finishAttempt,Payment} from './db';
import * as ussd from './ussd';
export type RunOutcome={status:'CONFIRMED'|'FAILED'|'REVIEW';reason:string;response:string};
const PIN_KEY='feeflow_wallet_pin';
export const savePin=async(pin:string)=>{if(!/^\d{4,8}$/.test(pin))throw Error('PIN must be 4–8 digits');await SecureStore.setItemAsync(PIN_KEY,pin);};
export const pinExists=async()=>!!(await SecureStore.getItemAsync(PIN_KEY));
export const removePin=async()=>SecureStore.deleteItemAsync(PIN_KEY);
export async function permissions(){
 if(Platform.OS!=='android')throw Error('Android phone required');
 const res=await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CALL_PHONE,PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE]);
 if(Object.values(res).some(x=>x!=='granted'))throw Error('Phone permissions required');
 if(!await ussd.connected())throw Error('Enable FeeFlow USSD service in Android Accessibility settings');
}
const failureTokens=['insufficient','not enough','kuguma filna','kuma filna','haraaga xisaabtaadu','wrong pin','incorrect pin','pin code length','invalid pin','cannot transfer','lama fulin','khalad','failed','rejected'];
const successTokens=['ayaad uwareejisay','ayaad u dirtay','si guul leh','successfully sent','waa la diray'];
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export async function execute(p:Payment):Promise<RunOutcome>{
 // Critical: timeouts and unknown replies are REVIEW, never retried automatically.
 const pin=await SecureStore.getItemAsync(PIN_KEY);
 if(!pin) return {status:'FAILED',reason:'Wallet PIN not configured',response:''};
 let started=false;let cleanupOk=false;
 try{
   await permissions();
   const list=await ussd.sims();const sim=list.find(x=>x.slotIndex===p.simSlot-1);
   if(!sim)return{status:'FAILED',reason:'Requested SIM not available',response:''};
   await ussd.reset();await sleep(500);
   await ussd.setPin(pin);
   const code=`*712*${p.phone}*${p.amount}#`;
   started=true;
   const outcome=await new Promise<RunOutcome>((resolve)=>{
      let settled=false;let done=()=>{};
      const finish=(r:RunOutcome)=>{if(settled)return;settled=true;clearTimeout(overall);clearTimeout(watchdog);done();resolve(r);};
      const failUnknown=(reason:string)=>finish({status:'REVIEW',reason,response:''});
      let watchdog:ReturnType<typeof setTimeout>|undefined;
      const overall=setTimeout(()=>failUnknown('USSD timeout: transaction outcome unknown'),60000);
      done=ussd.listen(event=>{
        const text=event.reply||'';const low=text.toLowerCase();
        if(watchdog)clearTimeout(watchdog);
        watchdog=setTimeout(()=>failUnknown('No final carrier reply within 30 seconds'),30000);
        const failed=failureTokens.some(x=>low.includes(x));const succeeded=successTokens.some(x=>low.includes(x));
        if(failed)finish({status:'FAILED',reason:low.includes('filna')||low.includes('insufficient')?'Insufficient balance':'Carrier rejected payment',response:text});
        else if(succeeded)finish({status:'CONFIRMED',reason:'',response:text});
        else if(event.isFinal)finish({status:'REVIEW',reason:'Unrecognized final carrier reply; verify manually',response:text});
      },e=>failUnknown('Native USSD error: '+e));
      ussd.dial(code,sim.subscriptionId).catch(e=>finish({status:'REVIEW',reason:'Dial start/error uncertain: '+String(e?.message||e),response:''}));
   });
   return outcome;
 }catch(e:any){
   return{status:started?'REVIEW':'FAILED',reason:String(e?.message||e),response:''};
 }finally{
   try{await ussd.clearPin();await ussd.reset();cleanupOk=true;}catch{}
   // Native reset requests dismissal; it cannot prove dialog is closed.
   // The caller applies an inter-job gap, and must explicitly verify on this device before production.
 }
}
export type QueueControl={pauseRequested:boolean;cancelRequested:boolean;running:boolean};
export const control:QueueControl={pauseRequested:false,cancelRequested:false,running:false};
export async function runBatch(items:Payment[],onProgress:()=>Promise<void>):Promise<boolean>{
 if(control.running)throw Error('Batch already running');
 control.running=true;control.pauseRequested=false;control.cancelRequested=false;
 try{
  for(let i=0;i<items.length;i++){
   if(control.cancelRequested)break;
   while(control.pauseRequested&&!control.cancelRequested)await sleep(250);
   if(control.cancelRequested)break;
   const p=await beginAttempt(items[i].id);
   const result=await execute(p);
   await finishAttempt(p.id,p.attempt,result.status,result.reason,result.response);
   await onProgress();
   if(i<items.length-1)await sleep(3000);
  }
 }finally{control.running=false;control.pauseRequested=false;control.cancelRequested=false;}
}
