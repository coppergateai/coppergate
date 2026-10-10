/**
 * OpenTelemetry stubs for TASK002.
 * Real SDK wiring (exporter, auto-instrumentation) lands when staging needs traces.
 */

export type SpanLike = {
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
};

export type TracerLike = {
  startSpan(name: string): SpanLike;
};

const noopSpan: SpanLike = {
  setAttribute() {},
  end() {},
};

const noopTracer: TracerLike = {
  startSpan() {
    return noopSpan;
  },
};

export type TelemetryInitOptions = {
  serviceName: string;
  enabled?: boolean;
};

let initialized = false;

export function initTelemetry(options: TelemetryInitOptions): void {
  if (initialized) return;
  initialized = true;
  if (options.enabled) {
    // Placeholder: swap for @opentelemetry/sdk-node when exporters are configured.
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "otel stub active (no exporter)",
        service: options.serviceName,
      }),
    );
  }
}

export function getTracer(_name = "coppergate"): TracerLike {
  return noopTracer;
}

/** Test helper */
export function resetTelemetryForTests(): void {
  initialized = false;
}
