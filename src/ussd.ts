import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
export type SimInfo = {subscriptionId:number; slotIndex:number; carrierName:string};
export type Reply = { reply:string; isFinal:boolean; sessionId?:number };
const bridge = NativeModules.UssdBridge;
const requireBridge = () => {
  if (Platform.OS !== 'android' || !bridge) throw new Error('Android native USSD bridge missing. Run expo prebuild and rebuild the APK.');
  return bridge;
};
export const sims = async ():Promise<SimInfo[]> => requireBridge().getSimList();
export const connected = async ():Promise<boolean> => requireBridge().isServiceConnected();
export const reset = async ():Promise<void> => {await requireBridge().resetSession(true);};
export const setPin = async (pin:string):Promise<void> => {await requireBridge().setPendingPin(pin);};
export const clearPin = async ():Promise<void> => {await requireBridge().clearPendingPin();};
export const dial = async (code:string,sub:number):Promise<void> => {await requireBridge().dialUssd(code,sub);};
export const listen = (onReply:(r:Reply)=>void,onError:(e:string)=>void):(()=>void) => {
  const emitter = new NativeEventEmitter(requireBridge());
  const a = emitter.addListener('ussdReply',onReply);
  const b = emitter.addListener('ussdError',(v:any)=>onError(String(v?.error||'Native USSD error')));
  return () => {a.remove();b.remove();};
};
