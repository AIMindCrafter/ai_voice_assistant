import os
import logging
import base64

def setup_observability():
    """Sets up OpenTelemetry and routes traces to Langfuse."""
    try:
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from livekit.agents.telemetry import set_tracer_provider
        
        LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY")
        LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY")
        LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", os.getenv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com"))
        
        if LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY:
            auth_header = base64.b64encode(f"{LANGFUSE_PUBLIC_KEY}:{LANGFUSE_SECRET_KEY}".encode()).decode()
            
            otlp_exporter = OTLPSpanExporter(
                endpoint=f"{LANGFUSE_HOST.rstrip('/')}/api/public/otel/v1/traces",
                headers={"Authorization": f"Basic {auth_header}"}
            )
            
            provider = TracerProvider()
            provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
            set_tracer_provider(provider)
            logging.info("⚡ OpenTelemetry Langfuse tracing successfully configured.")
        else:
            logging.warning("Langfuse credentials (LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY) are missing. Tracing will not be enabled.")
    except Exception as e:
        logging.warning(f"Could not configure OpenTelemetry tracing: {e}")
