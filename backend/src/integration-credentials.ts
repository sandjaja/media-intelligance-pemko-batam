import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM='aes-256-gcm';
const IV_BYTES=12;

function encryptionKey():Buffer{
 const secret=process.env.INTEGRATION_CREDENTIAL_KEY;
 if(!secret)throw new Error('INTEGRATION_CREDENTIAL_KEY_NOT_CONFIGURED');
 return createHash('sha256').update(secret,'utf8').digest();
}

export function encryptIntegrationCredential(value:string):string{
 const iv=randomBytes(IV_BYTES);
 const cipher=createCipheriv(ALGORITHM,encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 const tag=cipher.getAuthTag();
 return ['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join('.');
}

export function decryptIntegrationCredential(payload:string):string{
 const [version,ivRaw,tagRaw,dataRaw]=payload.split('.');
 if(version!=='v1'||!ivRaw||!tagRaw||!dataRaw)throw new Error('INVALID_INTEGRATION_CREDENTIAL');
 const decipher=createDecipheriv(ALGORITHM,encryptionKey(),Buffer.from(ivRaw,'base64url'));
 decipher.setAuthTag(Buffer.from(tagRaw,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(dataRaw,'base64url')),decipher.final()]).toString('utf8');
}

export function integrationCredentialHint(value:string):string{
 const trimmed=value.trim();
 if(trimmed.length<=4)return '••••';
 return '••••••••'+trimmed.slice(-4);
}
