-- Separate usage, Gemini feature attribution and paid reservations from Monitoring.
-- Evaluation continues to read the saved Monitoring model selection and prompt.
-- Register data only: no schema or model/budget changes; existing logs stay historical.
INSERT INTO ai_tasks(code,name,description,enabled)
VALUES('evaluation_analysis','Analisis Evaluasi Siklus','Knowledge & Evaluation synthesis of saved cycle results; uses the Monitoring configuration',TRUE)
ON CONFLICT(code) DO NOTHING;
