-- Move the daily brief after the collection window; preserve Admin activation.
UPDATE executive_brief_schedule_settings SET hour_wib=9,minute_wib=30,updated_at=now() WHERE id=1;
