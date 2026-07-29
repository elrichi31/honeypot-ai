WITH canary_attribution AS (
  SELECT
    alert.id AS alert_id,
    hit.sensor_id,
    hit.client_id
  FROM alerts alert
  CROSS JOIN LATERAL (
    SELECT web_hit.sensor_id, sensor.client_id
    FROM web_hits web_hit
    JOIN sensors sensor ON sensor.sensor_id = web_hit.sensor_id
    WHERE web_hit.src_ip = COALESCE(alert.src_ip, split_part(alert.alert_key, ':', 2))
      AND web_hit.canary_triggered = true
      AND web_hit.timestamp BETWEEN alert.created_at - INTERVAL '1 hour'
                                AND alert.created_at + INTERVAL '1 hour'
      AND sensor.client_id IS NOT NULL
    ORDER BY ABS(EXTRACT(EPOCH FROM (web_hit.timestamp - alert.created_at)))
    LIMIT 1
  ) hit
  WHERE alert.alert_key LIKE 'canary:%'
    AND alert.client_id IS NULL
)
UPDATE alerts alert
SET
  sensor_id = attribution.sensor_id,
  client_id = attribution.client_id
FROM canary_attribution attribution
WHERE alert.id = attribution.alert_id;
