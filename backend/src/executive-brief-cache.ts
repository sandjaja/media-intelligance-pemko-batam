import type { Pool } from 'pg';

export type CachedExecutiveBrief = {
  brief_date: string;
  scope_key: string;
  status: 'running' | 'ready' | 'failed';
  brief_json: Record<string, unknown> | null;
  generated_at: string | null;
  model_code: string | null;
};

export async function readLatestExecutiveBrief(pool: Pick<Pool, 'query'>, scopeKey = 'city'): Promise<CachedExecutiveBrief | null> {
  const { rows } = await pool.query(
    `SELECT brief_date::text,scope_key,status,brief_json,generated_at,model_code
     FROM executive_brief_daily_cache
     WHERE scope_key=$1 AND status='ready'
     ORDER BY brief_date DESC LIMIT 1`, [scopeKey],
  );
  return rows[0] ?? null;
}

// The caller must only invoke AI after this function returns true.
// A failed or stale run must be reviewed before retrying: no automatic retry loop.
export async function claimExecutiveBriefDay(
  pool: Pick<Pool, 'query'>, date: string, scopeKey = 'city',
): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_BRIEF_DATE');
  const { rows } = await pool.query(
    `INSERT INTO executive_brief_daily_cache
       (brief_date,scope_key,status,locked_until)
     VALUES ($1::date,$2,'running',now()+interval '2 minutes')
     ON CONFLICT (brief_date,scope_key) DO NOTHING
     RETURNING brief_date`, [date,scopeKey],
  );
  return rows.length === 1;
}

export async function completeExecutiveBriefDay(
  pool: Pick<Pool, 'query'>, date: string, scopeKey: string,
  brief: Record<string, unknown>, modelCode: string | null, sourceCount: number, manualRetry=false,
): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE executive_brief_daily_cache
       SET status='ready',brief_json=$3::jsonb,model_code=$4,source_count=$5,
           generated_at=now(),locked_until=NULL,updated_at=now(),
           error_code=CASE WHEN error_code LIKE 'RETRY_RUNNING:%' THEN LEFT('RETRY_SUCCESS:'||SUBSTRING(error_code FROM 15),80) ELSE error_code END
     WHERE brief_date=$1::date AND scope_key=$2 AND status='running'
       AND locked_until > now()
       AND (($6::boolean AND error_code LIKE 'RETRY_RUNNING:%') OR (NOT $6::boolean AND COALESCE(error_code,'') NOT LIKE 'RETRY_%'))
     RETURNING brief_date`,
    [date,scopeKey,JSON.stringify(brief),modelCode,sourceCount,manualRetry],
  );
  return rows.length === 1;
}

export async function failExecutiveBriefDay(
  pool: Pick<Pool, 'query'>, date: string, scopeKey: string, errorCode: string,
): Promise<void> {
  await pool.query(
    `UPDATE executive_brief_daily_cache
       SET status='failed',error_code=$3,locked_until=NULL,updated_at=now()
     WHERE brief_date=$1::date AND scope_key=$2 AND status='running' AND COALESCE(error_code,'') NOT LIKE 'RETRY_%'`,
    [date,scopeKey,errorCode.slice(0,80)],
  );
}

/** One explicit manual retry after a failed daily run. Retains the first failure code. */
export async function claimExecutiveBriefRetry(pool: Pick<Pool, 'query'>, date: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_BRIEF_DATE');
  const { rows } = await pool.query(
    `UPDATE executive_brief_daily_cache
     SET status='running',error_code='RETRY_RUNNING:'||COALESCE(error_code,'STALE_RUN'),
         locked_until=now()+interval '2 minutes',updated_at=now()
     WHERE brief_date=$1::date AND scope_key='city' AND (status='failed' OR (status='running' AND (locked_until IS NULL OR locked_until<=now())))
       AND COALESCE(error_code,'') NOT LIKE 'RETRY_%'
     RETURNING brief_date`, [date],
  );
  return rows.length === 1;
}

export async function failExecutiveBriefRetry(pool: Pick<Pool, 'query'>, date: string, code: string): Promise<void> {
  await pool.query(
    `UPDATE executive_brief_daily_cache
     SET status='failed',
         error_code=LEFT('RETRY_FAILED:'||SUBSTRING(COALESCE(error_code,'UNKNOWN') FROM 15)||':'||$2,80),
         locked_until=NULL,updated_at=now()
     WHERE brief_date=$1::date AND scope_key='city' AND status='running'
       AND error_code LIKE 'RETRY_RUNNING:%'`, [date,code],
  );
}

export async function inspectExecutiveBriefRetry(pool:Pick<Pool,'query'>,date:string){
  const {rows}=await pool.query(`SELECT status,error_code,locked_until FROM executive_brief_daily_cache WHERE brief_date=$1::date AND scope_key='city' LIMIT 1`,[date]);
  const row=rows[0];
  if(row?.status==='running'&&(!row.locked_until||new Date(row.locked_until).getTime()<=Date.now()))row.status='failed';
  const reason=!row?'not_generated':row.status==='ready'?'ready':row.status==='running'?'running':String(row.error_code||'').startsWith('RETRY_')?'retry_used':'available';
  const messages={not_generated:'Belum ada analisis hari ini. Di Preview, jadwal otomatis hanya berjalan di Production; gunakan Pengujian Executive Brief (Manual) untuk membuat analisis pertama.',ready:'Executive Brief hari ini sudah berhasil tersimpan.',running:'Analisis hari ini sedang berjalan. Perbarui status setelah selesai.',retry_used:'Percobaan ulang hari ini sudah digunakan. Tidak ada panggilan AI tambahan.',available:'Analisis hari ini gagal. Satu percobaan ulang tersedia dan akan menggunakan kuota Gemini.'};
  return {date,available:reason==='available',reason,message:(row?.status==='failed'&&String(row.error_code||'').includes('503')?'Layanan Gemini sedang sibuk (503). ':'')+messages[reason]};
}

export async function readExecutiveBriefState(pool:Pick<Pool,'query'>,date:string){
  const [brief,current]=await Promise.all([readLatestExecutiveBrief(pool),pool.query(`SELECT status,error_code,locked_until FROM executive_brief_daily_cache WHERE brief_date=$1::date AND scope_key='city' LIMIT 1`,[date])]);
  const today=current.rows[0]||null;
  if(today?.status==='running'&&(!today.locked_until||new Date(today.locked_until).getTime()<=Date.now()))today.status='failed';
  const failed=today?.status==='failed',retryAvailable=failed&&!String(today.error_code||'').startsWith('RETRY_');
  const busy=failed&&String(today.error_code||'').includes('503');
  const message=busy?'Layanan Gemini sedang sibuk (503). Brief hari ini belum berhasil diperbarui.':failed?'Brief hari ini gagal diperbarui. Hasil terakhir tetap ditampilkan.':today?.status==='running'?'Penyusunan brief hari ini sedang berjalan.':today?.status==='ready'?'Brief hari ini sudah tersimpan.':'Brief hari ini belum dibuat. Jadwal otomatis mengikuti aktivasi Admin.';
  return {brief,date,status:today?.status||'not_generated',outdated:!!brief&&brief.brief_date!==date,retryAvailable,message:message+(failed?(retryAvailable?' Satu percobaan Analisis Ulang tersedia di menu Scheduler Admin.':' Kesempatan Analisis Ulang hari ini sudah digunakan.'):'')};
}
