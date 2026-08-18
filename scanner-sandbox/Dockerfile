FROM alpine:3.19

RUN apk add --no-cache \
    nmap \
    curl \
    bash \
    python3 \
    py3-pip

WORKDIR /sandbox

EXPOSE 9000

CMD ["tail", "-f", "/dev/null"]
