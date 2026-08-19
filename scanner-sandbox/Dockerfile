FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends     nmap     curl     ca-certificates     && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 9000

ENV SCAN_TIMEOUT_SECONDS=300

CMD ["python", "-m", "http.server", "9000"]
