-- Register the five Humas tasks before prompt seed migrations.
-- Configuration only; does not enable any model execution.
INSERT INTO ai_tasks(code,name,description,enabled) VALUES
 ('gap_analysis','Analisis Gap','Optional narrative explanation of deterministic Gap findings',TRUE),
 ('strakom_analysis','Strakom','Communication strategy analysis',TRUE),
 ('publication_analysis','Publikasi','Approved strategy versus publication evidence',TRUE),
 ('monitoring_analysis','Monitoring','Post-publication evidence analysis',TRUE),
 ('content_studio_prompting','Content Studio','Basic creative direction for Content Studio prompts',TRUE)
ON CONFLICT(code) DO NOTHING;
