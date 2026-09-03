import json
import logging
import logging.config
from datetime import UTC, datetime


class JsonLogFormatter(logging.Formatter):
    """Small JSON formatter for request-boundary events."""

    _EXTRA_FIELDS = (
        "event",
        "request_id",
        "method",
        "path",
        "status_code",
        "duration_ms",
        "error_type",
        "error_code",
        "provider",
        "model",
        "requirement_count",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in self._EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {"()": "app.core.logging.JsonLogFormatter"},
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "level": "INFO",
                }
            },
            "loggers": {
                "sponsorguard": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                }
            },
        }
    )
