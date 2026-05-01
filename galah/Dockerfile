FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /src
RUN git clone --depth 1 https://github.com/0x4D31/galah.git .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /galah .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata jq
WORKDIR /galah
COPY --from=builder /galah .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
VOLUME ["/galah/config", "/galah/logs"]
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
