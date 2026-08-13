// Next.js が新しいサーバーインスタンスを起動する際に一度だけ呼ばれる公式フック。
// OTEL_EXPORTER_OTLP_ENDPOINT が未設定なら何もしない（他サービスのtracing.tsと同じ方針）。
// Edge runtime では @opentelemetry/auto-instrumentations-node（http/net等のNode専用モジュールに依存）を
// 読み込めないため、NEXT_RUNTIME==='nodejs' の場合のみ動的importする。
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  const { registerOTel } = await import('@vercel/otel');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'frontend',
    instrumentations: [
      ...getNodeAutoInstrumentations({
        // liveness/readiness probe はトレースしない
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url?.startsWith('/api/healthz') ?? false,
        },
      }),
    ],
  });
}
