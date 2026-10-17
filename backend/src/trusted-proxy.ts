// The adapter is the sole hop allowed to provide a client IP. Forwarded headers
// are ignored for all direct/non-loopback connections and standalone servers.
export function trustedProxy(address:string,hop:number){
 return process.env.VERCEL==='1'&&hop===0&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
}
