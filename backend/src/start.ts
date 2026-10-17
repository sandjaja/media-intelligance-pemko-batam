import 'dotenv/config';

// Vercel's Neon integration can expose the PostgreSQL connection as POSTGRES_URL.
// The application internally uses DATABASE_URL, so normalize the provider variable
// once at process startup without copying or exposing the secret.
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}

if(process.env.DEPLOYMENT_MODE==='vps'){
  const {loadVpsConfig}=await import('./install-service.js');
  const installed=await loadVpsConfig();
  if(!installed&&process.env.INSTALL_ENABLED==='true'){
    const {startInstaller}=await import('./install-server.js');
    await startInstaller();
  }else await import('./server.js');
}else await import('./server.js');
