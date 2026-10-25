export type ManagedProxySelection={countryCode:string;handle:string};
export type ProxyCountry={code:string;name:string;available:number};
export function validManagedProxySelection(value:unknown):value is ManagedProxySelection{
  const v=value as ManagedProxySelection;
  return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='countryCode,handle'
    &&typeof v.countryCode==='string'&&(v.countryCode==='auto'||/^[A-Z]{2}$/.test(v.countryCode))
    &&typeof v.handle==='string'&&/^[a-z0-9_.-]{1,80}$/.test(v.handle);
}
