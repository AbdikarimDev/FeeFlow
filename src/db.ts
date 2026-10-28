import * as SQLite from 'expo-sqlite';
export type Employee = {id:number; name:string; phone:string; amount:number; simSlot:number; active:number};
export type Schedule = {id:number; title:string; dueAt:string; recurring:number; state:string; createdAt:string; notified:number};
export type Payment = {id:number; batchId:number; employeeId:number; name:string; phone:string; amount:number; simSlot:number; state:string; reason:string|null; response:string|null; attempt:number; updatedAt:string};
let db:SQLite.SQLiteDatabase;
export async function initDB(){
 db=await SQLite.openDatabaseAsync('feeflow.db');
 await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
 CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,amount REAL NOT NULL CHECK(amount>0),simSlot INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,dueAt TEXT NOT NULL,recurring INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'SCHEDULED',createdAt TEXT NOT NULL,notified INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,batchId INTEGER NOT NULL,employeeId INTEGER NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,amount REAL NOT NULL,simSlot INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'READY',reason TEXT,response TEXT,attempt INTEGER NOT NULL DEFAULT 0,updatedAt TEXT NOT NULL,UNIQUE(batchId,employeeId),FOREIGN KEY(batchId) REFERENCES batches(id));
 CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,paymentId INTEGER NOT NULL,number INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT,response TEXT,startedAt TEXT NOT NULL,finishedAt TEXT,UNIQUE(paymentId,number),FOREIGN KEY(paymentId) REFERENCES payments(id));`);
 // Never automatically repeat a payment after process death.
 await db.runAsync("UPDATE payments SET state='REVIEW',reason='App stopped during payment; check carrier records before retry' WHERE state='DIALING'");
 await db.runAsync("UPDATE attempts SET status='REVIEW',reason='App interrupted during USSD',finishedAt=? WHERE status='DIALING'",new Date().toISOString());
}
const ensure=()=>{if(!db)throw new Error('Database not initialized');return db;};
export const allEmployees=()=>ensure().getAllAsync<Employee>('SELECT * FROM employees ORDER BY active DESC,name');
export const upsertEmployee=async (x:{id?:number;name:string;phone:string;amount:number;simSlot:number})=>{
 if(x.id) await ensure().runAsync('UPDATE employees SET name=?,phone=?,amount=?,simSlot=? WHERE id=?',x.name,x.phone,x.amount,x.simSlot,x.id);
 else await ensure().runAsync('INSERT INTO employees(name,phone,amount,simSlot) VALUES(?,?,?,?)',x.name,x.phone,x.amount,x.simSlot);
};
export const toggleEmployee=(id:number,active:number)=>ensure().runAsync('UPDATE employees SET active=? WHERE id=?',active,id);
export async function makeBatch(title:string,dueAt:string,recurring:boolean,ids:number[]){
 const employees=await allEmployees();const chosen=employees.filter(x=>ids.includes(x.id)&&x.active);
 if(!chosen.length)throw new Error('Select at least one active employee');
 const now=new Date().toISOString();
 await ensure().withTransactionAsync(async()=>{
   const ins=await ensure().runAsync('INSERT INTO batches(title,dueAt,recurring,state,createdAt) VALUES(?,?,?,?,?)',title,dueAt,recurring?1:0,'SCHEDULED',now);
   for(const e of chosen)await ensure().runAsync('INSERT INTO payments(batchId,employeeId,name,phone,amount,simSlot,state,updatedAt) VALUES(?,?,?,?,?,?,?,?)',ins.lastInsertRowId,e.id,e.name,e.phone,e.amount,e.simSlot,'READY',now);
 });
}
export const batches=()=>ensure().getAllAsync<Schedule>('SELECT * FROM batches ORDER BY dueAt DESC');
export const payments=(batchId:number)=>ensure().getAllAsync<Payment>('SELECT * FROM payments WHERE batchId=? ORDER BY id',batchId);
export const allPayments=()=>ensure().getAllAsync<(Payment&{title:string,dueAt:string})>(`SELECT p.*,b.title,b.dueAt FROM payments p JOIN batches b ON b.id=p.batchId ORDER BY p.updatedAt DESC`);
export const changeBatch=(id:number,state:string)=>ensure().runAsync('UPDATE batches SET state=? WHERE id=?',state,id);
export const markNotified=(id:number)=>ensure().runAsync('UPDATE batches SET notified=1 WHERE id=?',id);
export async function beginAttempt(id:number){
 const p=await ensure().getFirstAsync<Payment>('SELECT * FROM payments WHERE id=?',id);
 if(!p||!['READY','RETRY_READY'].includes(p.state))throw new Error('Payment is not ready for execution');
 const n=p.attempt+1;const now=new Date().toISOString();
 await ensure().withTransactionAsync(async()=>{
  await ensure().runAsync("UPDATE payments SET state='DIALING',attempt=?,updatedAt=? WHERE id=? AND state IN ('READY','RETRY_READY')",n,now,id);
  await ensure().runAsync("INSERT INTO attempts(paymentId,number,status,startedAt) VALUES(?,?,?,?)",id,n,'DIALING',now);
 });
 return {...p,attempt:n};
}
export async function finishAttempt(id:number,attempt:number,status:'CONFIRMED'|'FAILED'|'REVIEW',reason:string,response:string){
 const now=new Date().toISOString();
 await ensure().withTransactionAsync(async()=>{
  await ensure().runAsync('UPDATE payments SET state=?,reason=?,response=?,updatedAt=? WHERE id=? AND attempt=?',status,reason,response,now,id,attempt);
  await ensure().runAsync('UPDATE attempts SET status=?,reason=?,response=?,finishedAt=? WHERE paymentId=? AND number=?',status,reason,response,now,id,attempt);
 });
}
export const setPayment=(id:number,state:string,reason:string)=>ensure().runAsync('UPDATE payments SET state=?,reason=?,updatedAt=? WHERE id=?',state,reason,new Date().toISOString(),id);
export const attempts=(id:number)=>ensure().getAllAsync<any>('SELECT * FROM attempts WHERE paymentId=? ORDER BY number DESC',id);
export async function recurBatch(batchId:number){
 const b=await ensure().getFirstAsync<Schedule>('SELECT * FROM batches WHERE id=?',batchId);if(!b||!b.recurring)return;
 const items=await payments(batchId); const d=new Date(b.dueAt); d.setMonth(d.getMonth()+1);
 const existing=await ensure().getFirstAsync<{id:number}>('SELECT id FROM batches WHERE title=? AND dueAt=?',b.title,d.toISOString()); if(existing)return;
 await ensure().withTransactionAsync(async()=>{
  const ins=await ensure().runAsync('INSERT INTO batches(title,dueAt,recurring,state,createdAt) VALUES(?,?,?,?,?)',b.title,d.toISOString(),1,'SCHEDULED',new Date().toISOString());
  for(const p of items)await ensure().runAsync('INSERT INTO payments(batchId,employeeId,name,phone,amount,simSlot,state,updatedAt) VALUES(?,?,?,?,?,?,?,?)',ins.lastInsertRowId,p.employeeId,p.name,p.phone,p.amount,p.simSlot,'READY',new Date().toISOString());
 });
}
