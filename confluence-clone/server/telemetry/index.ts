import { NodeSDK } from '@opentelemetry/sdk-node'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'ConfluenceClone'
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0'



const _sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
})

_sdk.start()
process.on('SIGTERM', () => _sdk.shutdown().catch(console.error))

import { metrics as _otelMetrics, createNoopMeter } from '@opentelemetry/api'
export const meterProvider = null
export const prometheusExporter = null

export const telemetryReady = true
