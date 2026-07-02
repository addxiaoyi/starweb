/**
 * Telemetry route handler
 * Collects client-side telemetry data (route changes, errors, etc.)
 */

import { randomUUID } from 'node:crypto';

export function registerTelemetryRoutes(app) {
  // POST /api/telemetry - Accept telemetry events from the client
  app.post('/api/telemetry', (req, res) => {
    try {
      const { type, page, message, stack, ...extra } = req.body;

      if (!type) {
        return res.status(400).json({ error: 'Missing required field: type' });
      }

      const event = {
        id: randomUUID(),
        type,
        page: page || '',
        message: message || '',
        stack: stack || '',
        timestamp: new Date().toISOString(),
        ...extra,
      };

      // Log to console for now (could be extended to DB/file storage)
      console.log('[telemetry]', JSON.stringify(event));

      return res.status(200).json({ success: true, id: event.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[telemetry error]', message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
