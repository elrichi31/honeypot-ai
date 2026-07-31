export const ALL_ANALYTICS_EVENTS_SUBQUERY = `
  SELECT timestamp, src_ip AS srcIp, 'cowrie' AS source, sensor_id FROM cowrie_events FINAL
  UNION ALL
  SELECT timestamp, src_ip AS srcIp, 'web' AS source, sensor_id FROM web_events FINAL
  UNION ALL
  SELECT timestamp, src_ip AS srcIp, protocol AS source, sensor_id FROM protocol_events FINAL
  UNION ALL
  SELECT timestamp, src_ip AS srcIp, 'suricata' AS source, sensor_id FROM suricata_alerts FINAL
`
