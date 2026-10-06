import type { HistorySeries } from "../models/kpi-history";
export const historyFixture:HistorySeries={
  technician:{id:"a",code:"GS-01",fullName:"Ana López",inactive:false},granularity:"WEEK",referenceDate:"2026-10-06",timeZone:"America/Tegucigalpa",generatedAt:"2026-10-06T12:00:00Z",
  points:Array.from({length:12},(_,i)=>{const d=new Date("2026-07-20T00:00:00Z");d.setUTCDate(d.getUTCDate()+i*7);const end=new Date(d);end.setUTCDate(end.getUTCDate()+6);return {periodStart:d.toISOString().slice(0,10),periodEnd:end.toISOString().slice(0,10),status:i===11?"NO_DATA":"OFFICIAL",officialWeeks:i===11?0:1,expectedWeeks:1,partial:i===11,scores:i===11?{overall:null,productivity:null,compliance:null,efficiency:null,quality:null}:{overall:"70.00",productivity:"80.00",compliance:null,efficiency:"60.00",quality:"90.00"}};}),
};
