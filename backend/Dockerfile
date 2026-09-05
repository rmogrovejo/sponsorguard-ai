FROM python:3.12-slim-bookworm

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/creatorpreflight \
    && chown appuser:appuser /tmp/creatorpreflight
USER appuser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CREATORPREFLIGHT_ENV=production \
    TMPDIR=/tmp/creatorpreflight

EXPOSE 8000

# Dockerfile HEALTHCHECK uses CMD (not Compose CMD-SHELL). Probe via stdlib so
# python:3.12-slim does not need curl. PORT is read from the container env.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,sys,urllib.request; p=os.environ.get('PORT') or '8000'; urllib.request.urlopen(f'http://127.0.0.1:{p}/health', timeout=4)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
