// Trust exactly one local reverse-proxy hop; never accept arbitrary X-Forwarded-For.
export function trustedProxy(address:string,hop:number){
 return (process.env.VERCEL==='1'||process.env.TRUST_LOCAL_PROXY==='true')&&hop===0&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
}
